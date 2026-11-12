import { addDays, toDateStr } from '@mediflow/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextDocNo } from '../src/services/numbering'
import { supplierPayables } from '../src/services/reports'
import { createPurchaseOrder, createSupplierReturn, dispenseVisit } from '../src/services/stock'
import { addPatientPayment, getVisit, saveVisit } from '../src/services/visits'
import { baseData, makeDb, type TestDb } from './helpers'

let t: TestDb
let base: Awaited<ReturnType<typeof baseData>>
const today = toDateStr()

beforeEach(async () => {
  t = await makeDb()
  base = await baseData(t.prisma)
})
afterEach(async () => {
  await t.cleanup()
})

/** 入库三个批次：一个已过期、一个近效期、一个远效期 */
async function stockUp() {
  const db = t.prisma
  // 已过期批次只能通过台账以外的方式存在（入库时允许录入历史数据）
  return db.$transaction((tx) =>
    createPurchaseOrder(
      tx,
      {
        supplierId: base.supplier.id,
        paidNow: 0,
        payMethod: '现金',
        lines: [
          {
            drugId: base.drugA.id,
            batchNo: 'OLD',
            expiryDate: addDays(today, -1),
            quantity: 50,
            costPrice: 1000,
          },
          {
            drugId: base.drugA.id,
            batchNo: 'NEAR',
            expiryDate: addDays(today, 20),
            quantity: 3,
            costPrice: 1000,
          },
          {
            drugId: base.drugA.id,
            batchNo: 'FAR',
            expiryDate: addDays(today, 400),
            quantity: 10,
            costPrice: 900,
          },
        ],
      },
      null,
    ),
  )
}

async function batchStock(batchNo: string) {
  const b = await t.prisma.drugBatch.findFirstOrThrow({ where: { batchNo } })
  return b.stock
}

describe('FEFO 发药', () => {
  it('先出近效期批次，跳过已过期批次，并写台账', async () => {
    await stockUp()
    const db = t.prisma
    const id = await db.$transaction((tx) =>
      saveVisit(
        tx,
        {
          patientId: base.patient.id,
          doctorId: base.doctor.id,
          prescription: [{ drugId: base.drugA.id, quantity: 5, unitPrice: 1500 }],
          charges: [],
          dispense: true,
        },
        null,
      ),
    )
    expect(await batchStock('OLD')).toBe(50)
    expect(await batchStock('NEAR')).toBe(0)
    expect(await batchStock('FAR')).toBe(8)
    const v = await getVisit(db, id)
    expect(v.status).toBe('DISPENSED')
    expect(v.items.map((i) => [i.batch?.batchNo, i.quantity])).toEqual([
      ['NEAR', 3],
      ['FAR', 2],
    ])
    const moves = await db.stockMovement.findMany({ where: { type: 'DISPENSE' } })
    expect(moves.reduce((s, m) => s + m.quantity, 0)).toBe(-5)
    // 台账合计与缓存库存一致
    for (const b of await db.drugBatch.findMany()) {
      const sum = await db.stockMovement.aggregate({ where: { batchId: b.id }, _sum: { quantity: true } })
      expect(sum._sum.quantity ?? 0).toBe(b.stock)
    }
  })

  it('有效库存不足时整单失败并回滚（过期库存不计入）', async () => {
    await stockUp()
    const db = t.prisma
    const id = await db.$transaction((tx) =>
      saveVisit(
        tx,
        {
          patientId: base.patient.id,
          prescription: [
            { drugId: base.drugA.id, quantity: 2, unitPrice: 1500 },
            { drugId: base.drugA.id, quantity: 12, unitPrice: 1500 },
          ],
          charges: [],
          dispense: false,
        },
        null,
      ),
    )
    await expect(db.$transaction((tx) => dispenseVisit(tx, id, null))).rejects.toThrow(/库存不足/)
    // 回滚：第一行的扣减也不生效
    expect(await batchStock('NEAR')).toBe(3)
    expect(await batchStock('FAR')).toBe(10)
    expect((await getVisit(db, id)).status).toBe('OPEN')
    expect(await db.stockMovement.count({ where: { type: 'DISPENSE' } })).toBe(0)
  })

  it('没有任何批次的药品发药失败', async () => {
    const db = t.prisma
    await expect(
      db.$transaction((tx) =>
        saveVisit(
          tx,
          {
            patientId: base.patient.id,
            prescription: [{ drugId: base.drugB.id, quantity: 1, unitPrice: 800 }],
            charges: [],
            dispense: true,
          },
          null,
        ),
      ),
    ).rejects.toThrow(/布洛芬片.*库存不足/)
    expect(await db.visit.count()).toBe(0)
  })
})

describe('退货', () => {
  it('退货不能超过批次库存', async () => {
    await stockUp()
    const db = t.prisma
    const near = await db.drugBatch.findFirstOrThrow({ where: { batchNo: 'NEAR' } })
    await expect(
      db.$transaction((tx) =>
        createSupplierReturn(
          tx,
          { supplierId: base.supplier.id, lines: [{ batchId: near.id, quantity: 4, unitPrice: 1000 }] },
          null,
        ),
      ),
    ).rejects.toThrow(/库存不足/)
    expect(await db.supplierReturn.count()).toBe(0)
    const r = await db.$transaction((tx) =>
      createSupplierReturn(
        tx,
        { supplierId: base.supplier.id, lines: [{ batchId: near.id, quantity: 3, unitPrice: 1000 }] },
        null,
      ),
    )
    expect(r.total).toBe(3000)
    expect(await batchStock('NEAR')).toBe(0)
  })
})

describe('单据编号', () => {
  it('按前缀+日期 4 位流水递增', async () => {
    const db = t.prisma
    const a = await db.$transaction((tx) => nextDocNo(tx, 'JZ', '2026-11-11'))
    const b = await db.$transaction((tx) => nextDocNo(tx, 'JZ', '2026-11-11'))
    const c = await db.$transaction((tx) => nextDocNo(tx, 'RK', '2026-11-11'))
    const d = await db.$transaction((tx) => nextDocNo(tx, 'JZ', '2026-11-12'))
    expect([a, b, c, d]).toEqual(['JZ202611110001', 'JZ202611110002', 'RK202611110001', 'JZ202611120001'])
  })

  it('并发生成不重号', async () => {
    const db = t.prisma
    const nos = await Promise.all(
      Array.from({ length: 30 }, () => db.$transaction((tx) => nextDocNo(tx, 'GF', '2026-11-11'))),
    )
    expect(new Set(nos).size).toBe(30)
    expect(nos.sort().at(-1)).toBe('GF202611110030')
  })

  it('事务回滚时编号不被占用', async () => {
    const db = t.prisma
    await expect(
      db.$transaction(async (tx) => {
        await nextDocNo(tx, 'TH', '2026-11-11')
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await db.$transaction((tx) => nextDocNo(tx, 'TH', '2026-11-11'))).toBe('TH202611110001')
  })
})

describe('就诊金额', () => {
  it('合计、已付、欠款由明细计算；收款不能超过欠款；后续日期记为还款', async () => {
    await stockUp()
    const db = t.prisma
    const id = await db.$transaction((tx) =>
      saveVisit(
        tx,
        {
          patientId: base.patient.id,
          prescription: [{ drugId: base.drugA.id, quantity: 2, unitPrice: 1500 }],
          charges: [{ chargeItemId: base.charge.id, quantity: 1, unitPrice: 1000 }],
          dispense: true,
        },
        null,
      ),
    )
    let v = await getVisit(db, id)
    expect(v.totals).toEqual({ drugFee: 3000, otherFee: 1000, total: 4000, paid: 0, owed: 4000 })
    await db.$transaction((tx) => addPatientPayment(tx, { visitId: id, amount: 2500, method: '现金' }))
    await expect(
      db.$transaction((tx) => addPatientPayment(tx, { visitId: id, amount: 2000, method: '现金' })),
    ).rejects.toThrow(/超过欠款/)
    await db.$transaction((tx) =>
      addPatientPayment(tx, { visitId: id, amount: 1500, method: '微信', paidAt: addDays(today, 3) }),
    )
    v = await getVisit(db, id)
    expect(v.totals).toEqual({ drugFee: 3000, otherFee: 1000, total: 4000, paid: 4000, owed: 0 })
    expect(v.payments.map((p) => p.kind)).toEqual(['PATIENT', 'PATIENT_REPAY'])
  })
})

describe('应付账款', () => {
  it('应付 = 入库 − 退货 − 付款（含入库当场付款）', async () => {
    const db = t.prisma
    await db.$transaction((tx) =>
      createPurchaseOrder(
        tx,
        {
          supplierId: base.supplier.id,
          paidNow: 2000,
          payMethod: '现金',
          lines: [
            {
              drugId: base.drugA.id,
              batchNo: 'B1',
              expiryDate: addDays(today, 365),
              quantity: 10,
              costPrice: 1000,
            },
          ],
        },
        null,
      ),
    )
    const b1 = await db.drugBatch.findFirstOrThrow({ where: { batchNo: 'B1' } })
    await db.$transaction((tx) =>
      createSupplierReturn(
        tx,
        { supplierId: base.supplier.id, lines: [{ batchId: b1.id, quantity: 2, unitPrice: 1000 }] },
        null,
      ),
    )
    await db.payment.create({
      data: { kind: 'SUPPLIER', supplierId: base.supplier.id, amount: 3000, paidAt: today },
    })
    const [row] = await supplierPayables(db)
    expect(row).toMatchObject({ purchases: 10000, returns: 2000, payments: 5000, payable: 3000 })
  })
})
