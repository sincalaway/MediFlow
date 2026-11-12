import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureSchema } from '../src/db/client'
import { SCHEMA_VERSION } from '../src/db/schemaSql'
import { getClinicSettings } from '../src/routes/settings'
import { getVisit, saveVisit } from '../src/services/visits'
import { baseData, makeDb, type TestDb } from './helpers'

let t: TestDb
beforeEach(async () => {
  t = await makeDb()
})
afterEach(async () => {
  await t.cleanup()
})

describe('数据库迁移', () => {
  it('v1 库启动时自动补齐处方前记字段', async () => {
    const db = t.prisma
    for (const c of ['feeType', 'department', 'rxType', 'weight', 'agentName', 'agentIdCard'])
      await db.$executeRawUnsafe(`ALTER TABLE "Visit" DROP COLUMN "${c}"`)
    await db.meta.update({ where: { key: 'schema_version' }, data: { value: '1' } })
    expect(await ensureSchema(db, 'sqlite')).toBe(false)
    const cols = await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("Visit")`)
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['feeType', 'rxType', 'agentIdCard']))
    expect((await db.meta.findUnique({ where: { key: 'schema_version' } }))?.value).toBe(
      String(SCHEMA_VERSION),
    )
  })
})

describe('处方前记', () => {
  it('保存费别/科别/类别；非麻精一处方不保存代办人；发药后仍可改前记', async () => {
    const db = t.prisma
    const b = await baseData(db)
    const input = {
      patientId: b.patient.id,
      doctorId: b.doctor.id,
      feeType: '医保' as const,
      department: '内科',
      rxType: '急诊' as const,
      agentName: '不该保存',
      prescription: [],
      charges: [{ chargeItemId: b.charge.id, quantity: 1, unitPrice: 1000 }],
      dispense: true,
    }
    const id = await db.$transaction((tx) => saveVisit(tx, input, null))
    let v = await getVisit(db, id)
    expect([v.feeType, v.department, v.rxType, v.agentName, v.status]).toEqual([
      '医保',
      '内科',
      '急诊',
      null,
      'DISPENSED',
    ])
    await db.$transaction((tx) =>
      saveVisit(tx, { ...input, rxType: '麻、精一', agentName: '王五', dispense: false }, null, id),
    )
    v = await getVisit(db, id)
    expect([v.rxType, v.agentName]).toEqual(['麻、精一', '王五'])
  })

  it('机构信息默认为空串', async () => {
    expect(await getClinicSettings(t.prisma)).toEqual({
      name: '',
      address: '',
      phone: '',
      department: '',
      receiptNote: '',
    })
  })
})
