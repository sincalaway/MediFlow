import { addDays, computeSupplierPayable, expiryState, toDateStr, type ExpiryState } from '@mediflow/shared'
import type { PrismaClient } from '@prisma/client'
import { totalsOf } from './visits'

export type BatchFilter = 'all' | 'valid' | 'expired' | 'near'

export async function stockByBatch(
  db: PrismaClient,
  opts: { filter: BatchFilter; keyword?: string; includeEmpty?: boolean },
) {
  const today = toDateStr()
  const where: Record<string, unknown> = {}
  if (!opts.includeEmpty) where.stock = { gt: 0 }
  if (opts.filter === 'expired') where.expiryDate = { lte: today }
  if (opts.filter === 'valid') where.expiryDate = { gt: today }
  if (opts.filter === 'near') where.expiryDate = { gt: today, lte: addDays(today, 30) }
  const batches = await db.drugBatch.findMany({
    where,
    include: { drug: true, supplier: { select: { id: true, name: true } } },
    orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
  })
  const k = opts.keyword?.trim().toUpperCase()
  return batches
    .filter(
      (b) =>
        !k || [b.drug.name, b.drug.pinyin, b.drug.code, b.batchNo].some((f) => f.toUpperCase().includes(k)),
    )
    .map((b) => ({ ...b, state: expiryState(b.expiryDate, today) as ExpiryState }))
}

export async function stockByDrug(db: PrismaClient, keyword?: string) {
  const today = toDateStr()
  const near = addDays(today, 30)
  const drugs = await db.drug.findMany({ include: { batches: true }, orderBy: { code: 'asc' } })
  const k = keyword?.trim().toUpperCase()
  return drugs
    .filter((d) => !k || [d.name, d.pinyin, d.code].some((f) => f.toUpperCase().includes(k)))
    .map(({ batches, ...d }) => {
      let total = 0
      let valid = 0
      let expired = 0
      let nearExpiry = 0
      for (const b of batches) {
        total += b.stock
        if (b.expiryDate <= today) expired += b.stock
        else {
          valid += b.stock
          if (b.expiryDate <= near) nearExpiry += b.stock
        }
      }
      return {
        ...d,
        total,
        valid,
        expired,
        nearExpiry,
        batchCount: batches.filter((b) => b.stock > 0).length,
      }
    })
}

/** 缺货：有效库存低于下限 */
export async function shortage(db: PrismaClient) {
  return (await stockByDrug(db)).filter((d) => d.active && d.stockMin > 0 && d.valid < d.stockMin)
}
/** 超储：总库存高于上限 */
export async function overstock(db: PrismaClient) {
  return (await stockByDrug(db)).filter((d) => d.active && d.stockMax > 0 && d.total > d.stockMax)
}

export async function purchaseStats(db: PrismaClient, from: string, to: string) {
  const lines = await db.purchaseOrderLine.findMany({
    where: { order: { orderDate: { gte: from, lte: to } } },
    include: { drug: true, batch: true, order: { include: { supplier: { select: { name: true } } } } },
    orderBy: { id: 'asc' },
  })
  return summarize(
    lines.map((l) => ({
      drug: l.drug,
      quantity: l.quantity,
      amount: l.quantity * l.costPrice,
      row: {
        docNo: l.order.orderNo,
        date: l.order.orderDate,
        supplier: l.order.supplier.name,
        drugName: l.drug.name,
        spec: l.drug.spec,
        unit: l.drug.unit,
        batchNo: l.batch.batchNo,
        expiryDate: l.batch.expiryDate,
        quantity: l.quantity,
        unitPrice: l.costPrice,
        amount: l.quantity * l.costPrice,
      },
    })),
  )
}

export async function returnStats(db: PrismaClient, from: string, to: string) {
  const lines = await db.supplierReturnLine.findMany({
    where: { ret: { returnDate: { gte: from, lte: to } } },
    include: {
      batch: { include: { drug: true } },
      ret: { include: { supplier: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
  })
  return summarize(
    lines.map((l) => ({
      drug: l.batch.drug,
      quantity: l.quantity,
      amount: l.quantity * l.unitPrice,
      row: {
        docNo: l.ret.returnNo,
        date: l.ret.returnDate,
        supplier: l.ret.supplier.name,
        drugName: l.batch.drug.name,
        spec: l.batch.drug.spec,
        unit: l.batch.drug.unit,
        batchNo: l.batch.batchNo,
        expiryDate: l.batch.expiryDate,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.quantity * l.unitPrice,
      },
    })),
  )
}

function summarize<R>(
  rows: {
    drug: { id: number; code: string; name: string; spec: string | null; unit: string | null }
    quantity: number
    amount: number
    row: R
  }[],
) {
  const byDrug = new Map<
    number,
    {
      drugId: number
      code: string
      name: string
      spec: string | null
      unit: string | null
      quantity: number
      amount: number
    }
  >()
  let totalAmount = 0
  for (const r of rows) {
    const cur = byDrug.get(r.drug.id) ?? {
      drugId: r.drug.id,
      code: r.drug.code,
      name: r.drug.name,
      spec: r.drug.spec,
      unit: r.drug.unit,
      quantity: 0,
      amount: 0,
    }
    cur.quantity += r.quantity
    cur.amount += r.amount
    byDrug.set(r.drug.id, cur)
    totalAmount += r.amount
  }
  return { details: rows.map((r) => r.row), byDrug: [...byDrug.values()], totalAmount }
}

/** 应付账款 = 入库 − 退货 − 付款（按供药单位） */
export async function supplierPayables(db: PrismaClient) {
  const suppliers = await db.supplier.findMany({ orderBy: { code: 'asc' } })
  const poLines = await db.purchaseOrderLine.findMany({
    select: { quantity: true, costPrice: true, order: { select: { supplierId: true } } },
  })
  const retLines = await db.supplierReturnLine.findMany({
    select: { quantity: true, unitPrice: true, ret: { select: { supplierId: true } } },
  })
  const pays = await db.payment.groupBy({
    by: ['supplierId'],
    where: { kind: 'SUPPLIER' },
    _sum: { amount: true },
  })
  const p = new Map<number, number>()
  const r = new Map<number, number>()
  for (const l of poLines)
    p.set(l.order.supplierId, (p.get(l.order.supplierId) ?? 0) + l.quantity * l.costPrice)
  for (const l of retLines) r.set(l.ret.supplierId, (r.get(l.ret.supplierId) ?? 0) + l.quantity * l.unitPrice)
  const pay = new Map(pays.map((x) => [x.supplierId!, x._sum.amount ?? 0]))
  return suppliers.map((s) => ({
    supplierId: s.id,
    code: s.code,
    name: s.name,
    contact: s.contact,
    phone: s.phone,
    ...computeSupplierPayable(p.get(s.id) ?? 0, r.get(s.id) ?? 0, pay.get(s.id) ?? 0),
  }))
}

/** 患者欠款：按就诊计算 owed > 0 */
export async function patientDebts(db: PrismaClient, keyword?: string) {
  const visits = await db.visit.findMany({
    where: { status: { not: 'CANCELLED' } },
    include: {
      patient: true,
      items: true,
      charges: true,
      payments: true,
      doctor: { select: { name: true } },
    },
    orderBy: { visitDate: 'desc' },
  })
  const k = keyword?.trim().toUpperCase()
  return visits
    .map((v) => ({
      visitId: v.id,
      visitNo: v.visitNo,
      visitDate: v.visitDate,
      patientId: v.patientId,
      patientName: v.patient.name,
      phone: v.patient.phone,
      doctor: v.doctor?.name ?? null,
      ...totalsOf(v),
    }))
    .filter((v) => v.owed > 0)
    .filter((v) => !k || [v.patientName, v.phone ?? '', v.visitNo].some((f) => f.toUpperCase().includes(k)))
}

/** 收入报表：按日汇总 应收（就诊合计）与 实收（收款，按支付方式） */
export async function incomeReport(db: PrismaClient, from: string, to: string) {
  const fromD = new Date(`${from}T00:00:00`)
  const toD = new Date(`${addDays(to, 1)}T00:00:00`)
  const visits = await db.visit.findMany({
    where: { status: { not: 'CANCELLED' }, visitDate: { gte: fromD, lt: toD } },
    include: { items: true, charges: true, payments: true },
  })
  const payments = await db.payment.findMany({
    where: { kind: { in: ['PATIENT', 'PATIENT_REPAY'] }, paidAt: { gte: from, lte: to } },
  })
  type Day = {
    date: string
    visits: number
    drugFee: number
    otherFee: number
    total: number
    received: number
    repay: number
    byMethod: Record<string, number>
  }
  const days = new Map<string, Day>()
  const day = (d: string) => {
    let x = days.get(d)
    if (!x)
      days.set(
        d,
        (x = { date: d, visits: 0, drugFee: 0, otherFee: 0, total: 0, received: 0, repay: 0, byMethod: {} }),
      )
    return x
  }
  for (const v of visits) {
    const t = totalsOf(v)
    const d = day(toDateStr(v.visitDate))
    d.visits++
    d.drugFee += t.drugFee
    d.otherFee += t.otherFee
    d.total += t.total
  }
  for (const p of payments) {
    const d = day(p.paidAt)
    d.received += p.amount
    if (p.kind === 'PATIENT_REPAY') d.repay += p.amount
    d.byMethod[p.method] = (d.byMethod[p.method] ?? 0) + p.amount
  }
  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
  const sum = rows.reduce(
    (s, r) => {
      s.visits += r.visits
      s.drugFee += r.drugFee
      s.otherFee += r.otherFee
      s.total += r.total
      s.received += r.received
      s.repay += r.repay
      for (const [m, a] of Object.entries(r.byMethod)) s.byMethod[m] = (s.byMethod[m] ?? 0) + a
      return s
    },
    {
      visits: 0,
      drugFee: 0,
      otherFee: 0,
      total: 0,
      received: 0,
      repay: 0,
      byMethod: {} as Record<string, number>,
    },
  )
  return { rows, sum }
}
