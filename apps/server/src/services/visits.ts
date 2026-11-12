import { computeVisitTotals, toDateStr, type VisitSaveInput, type VisitTotals } from '@mediflow/shared'
import type { Prisma } from '@prisma/client'
import type { Tx } from '../db/client'
import { badRequest, notFound } from '../errors'
import { nextDocNo } from './numbering'
import { dispenseVisit } from './stock'

export const visitInclude = {
  patient: true,
  doctor: { select: { id: true, name: true } },
  items: { include: { drug: true, batch: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
  charges: { include: { chargeItem: true }, orderBy: { id: 'asc' } },
  payments: { orderBy: { id: 'asc' } },
} satisfies Prisma.VisitInclude

type VisitWithRows = {
  items: { quantity: number; unitPrice: number }[]
  charges: { quantity: number; unitPrice: number }[]
  payments: { amount: number }[]
}

/** 合计永远从明细行计算（修复原系统欠付款/总金额靠手填的问题） */
export function totalsOf(v: VisitWithRows): VisitTotals {
  return computeVisitTotals(v.items, v.charges, v.payments)
}

export function withTotals<T extends VisitWithRows>(v: T): T & { totals: VisitTotals } {
  return { ...v, totals: totalsOf(v) }
}

export async function saveVisit(tx: Tx, input: VisitSaveInput, userId: number | null, visitId?: number) {
  const patient = await tx.patient.findUnique({ where: { id: input.patientId } })
  if (!patient) throw notFound('患者不存在')
  if (input.doctorId) {
    const doc = await tx.staff.findUnique({ where: { id: input.doctorId } })
    if (!doc) throw notFound('医生不存在')
  }
  for (const p of input.prescription) {
    const d = await tx.drug.findUnique({ where: { id: p.drugId } })
    if (!d) throw notFound(`药品 ${p.drugId} 不存在`)
  }
  for (const c of input.charges) {
    const ci = await tx.chargeItem.findUnique({ where: { id: c.chargeItemId } })
    if (!ci) throw notFound(`收费项目 ${c.chargeItemId} 不存在`)
  }
  const base = {
    patientId: input.patientId,
    doctorId: input.doctorId ?? null,
    chiefComplaint: input.chiefComplaint,
    history: input.history,
    diagnosis: input.diagnosis,
    remark: input.remark,
    ...(input.visitDate ? { visitDate: new Date(input.visitDate) } : {}),
  }
  let id: number
  if (visitId) {
    const existing = await tx.visit.findUnique({ where: { id: visitId } })
    if (!existing) throw notFound('就诊记录不存在')
    if (existing.status !== 'OPEN') {
      // 已发药：只允许修改病历文字，不允许改处方与收费明细
      await tx.visit.update({
        where: { id: visitId },
        data: {
          chiefComplaint: base.chiefComplaint,
          history: base.history,
          diagnosis: base.diagnosis,
          remark: base.remark,
        },
      })
      return visitId
    }
    await tx.visit.update({ where: { id: visitId }, data: base })
    await tx.prescriptionItem.deleteMany({ where: { visitId } })
    await tx.visitChargeItem.deleteMany({ where: { visitId } })
    id = visitId
  } else {
    const visitNo = await nextDocNo(tx, 'JZ', input.visitDate ? new Date(input.visitDate) : new Date())
    const v = await tx.visit.create({ data: { ...base, visitNo, createdById: userId } })
    id = v.id
  }
  let sort = 0
  for (const p of input.prescription) {
    await tx.prescriptionItem.create({
      data: {
        visitId: id,
        drugId: p.drugId,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
        usage: p.usage,
        sort: sort++,
      },
    })
  }
  for (const c of input.charges) {
    await tx.visitChargeItem.create({
      data: { visitId: id, chargeItemId: c.chargeItemId, quantity: c.quantity, unitPrice: c.unitPrice },
    })
  }
  if (input.dispense) await dispenseVisit(tx, id, userId)
  return id
}

export async function getVisit(tx: Tx, id: number) {
  const v = await tx.visit.findUnique({ where: { id }, include: visitInclude })
  if (!v) throw notFound('就诊记录不存在')
  return withTotals(v)
}

/** 收费/还款：金额不能超过当前欠款；就诊日之后的付款记为「还款」 */
export async function addPatientPayment(
  tx: Tx,
  input: { visitId: number; amount: number; method: string; paidAt?: string; remark?: string | null },
  username?: string,
) {
  const v = await tx.visit.findUnique({
    where: { id: input.visitId },
    include: { items: true, charges: true, payments: true },
  })
  if (!v) throw notFound('就诊记录不存在')
  if (v.status === 'CANCELLED') throw badRequest('就诊已作废，不能收费')
  const t = totalsOf(v)
  if (input.amount > t.owed) throw badRequest(`收款金额超过欠款（欠 ${(t.owed / 100).toFixed(2)} 元）`)
  const paidAt = input.paidAt ?? toDateStr()
  const kind = paidAt > toDateStr(v.visitDate) ? 'PATIENT_REPAY' : 'PATIENT'
  return tx.payment.create({
    data: {
      kind,
      visitId: v.id,
      patientId: v.patientId,
      amount: input.amount,
      method: input.method,
      paidAt,
      receivedBy: username,
      remark: input.remark,
    },
  })
}

export async function cancelVisit(tx: Tx, id: number) {
  const v = await tx.visit.findUnique({ where: { id }, include: { payments: true } })
  if (!v) throw notFound('就诊记录不存在')
  if (v.status !== 'OPEN') throw badRequest('只能作废未发药的就诊记录')
  if (v.payments.length) throw badRequest('已有收费记录，不能作废')
  return tx.visit.update({ where: { id }, data: { status: 'CANCELLED' } })
}
