import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPrisma, ensureSchema } from '../src/db/client'

export async function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), 'mediflow-test-'))
  const url = `file:${join(dir, 'test.db')}`
  const prisma = createPrisma(url)
  await ensureSchema(prisma, 'sqlite')
  return {
    prisma,
    url,
    dir,
    async cleanup() {
      await prisma.$disconnect()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export type TestDb = Awaited<ReturnType<typeof makeDb>>

/** 基础数据：1 个供应商、2 个药品、1 个收费项目、1 个患者、1 个医生 */
export async function baseData(db: TestDb['prisma']) {
  const supplier = await db.supplier.create({ data: { code: 'D00001', name: '测试药业' } })
  const drugA = await db.drug.create({
    data: {
      code: 'Y00001',
      name: '阿莫西林胶囊',
      pinyin: 'AMXLJN',
      retailPrice: 1500,
      stockMin: 5,
      stockMax: 100,
    },
  })
  const drugB = await db.drug.create({
    data: { code: 'Y00002', name: '布洛芬片', pinyin: 'BLFP', retailPrice: 800 },
  })
  const charge = await db.chargeItem.create({ data: { code: 'X00001', name: '诊查费', price: 1000 } })
  const patient = await db.patient.create({ data: { name: '张三', pinyin: 'ZS', phone: '13800000000' } })
  const doctor = await db.staff.create({ data: { code: 'R00001', name: '李医生', isDoctor: true } })
  return { supplier, drugA, drugB, charge, patient, doctor }
}
