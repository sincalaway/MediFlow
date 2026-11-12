import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { importClinicms } from '../src/import-clinicms'
import { supplierPayables } from '../src/services/reports'
import { getVisit } from '../src/services/visits'
import { makeDb, type TestDb } from './helpers'

// fixtures/clinicms-sample.json 由 tools/import-clinicms/extract.py 从 inmis/Clinicms 自带的演示库导出
let t: TestDb
let result: Awaited<ReturnType<typeof importClinicms>>

beforeAll(async () => {
  t = await makeDb()
  const dump = JSON.parse(readFileSync(join(__dirname, 'fixtures/clinicms-sample.json'), 'utf8'))
  result = await t.prisma.$transaction((tx) => importClinicms(tx, dump), { timeout: 60000 })
})
afterAll(() => t.cleanup())

describe('Clinicms 旧数据导入', () => {
  it('导入 13 张业务表并按 姓名+电话 去重患者', () => {
    expect(result.counts).toMatchObject({
      人员: 3,
      供药单位: 3,
      收费项目: 3,
      药品: 3,
      入库单: 2,
      入库明细: 3,
      退货单: 2,
      退货明细: 2,
      就诊: 2,
      患者: 2,
      处方明细: 3,
      其他项目: 4,
      患者还款: 1,
      批次: 3,
    })
  })

  it('Currency 正确换算为分，批次库存由台账得出', async () => {
    const drugs = await t.prisma.drug.findMany({ include: { batches: true }, orderBy: { code: 'asc' } })
    expect(drugs.map((d) => d.batches.reduce((s, b) => s + b.stock, 0))).toEqual([28, 7, 26])
    const ci = await t.prisma.chargeItem.findUniqueOrThrow({ where: { code: 'X00001' } })
    expect(ci.price).toBe(500) // 5.00 元
  })

  it('就诊合计由明细计算，与原系统一致', async () => {
    const v = await t.prisma.visit.findUniqueOrThrow({ where: { visitNo: 'JZ20180329001' } })
    const full = await getVisit(t.prisma, v.id)
    expect(full.totals).toEqual({ drugFee: 4600, otherFee: 800, total: 5400, paid: 5400, owed: 0 })
  })

  it('应付账款扣减退货（修复原系统高估）', async () => {
    const rows = await supplierPayables(t.prisma)
    const d1 = rows.find((r) => r.code === 'D00001')!
    // 入库 360.00 − 退货 24.00 − 付款 300.00 = 36.00（原系统算法未扣退货，得 60.00）
    expect(d1).toMatchObject({ purchases: 36000, returns: 2400, payments: 30000, payable: 3600 })
  })
})
