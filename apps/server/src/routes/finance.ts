import { periodQuerySchema, supplierPaymentSchema, toDateStr } from '@mediflow/shared'
import type { FastifyPluginAsync } from 'fastify'
import { currentUser, guard } from '../auth'
import { intParam } from '../db/search'
import { notFound } from '../errors'
import { nextDocNo } from '../services/numbering'
import { incomeReport, patientDebts, supplierPayables } from '../services/reports'

export const financeRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma
  const fin = { preHandler: guard('finance', 'pharmacy') }

  app.get('/supplier-payments', fin, async (req) => {
    const q = req.query as { from?: string; to?: string; supplierId?: string }
    return db.payment.findMany({
      where: {
        kind: 'SUPPLIER',
        ...(q.supplierId ? { supplierId: Number(q.supplierId) } : {}),
        ...(q.from || q.to
          ? { paidAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
          : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { orderNo: true } },
      },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
    })
  })

  app.post('/supplier-payments', { preHandler: guard('finance') }, async (req) => {
    const b = supplierPaymentSchema.parse(req.body)
    const u = currentUser(req)
    return db.$transaction(async (tx) => {
      const s = await tx.supplier.findUnique({ where: { id: b.supplierId } })
      if (!s) throw notFound('供药单位不存在')
      const paidAt = b.paidAt ?? toDateStr()
      return tx.payment.create({
        data: {
          kind: 'SUPPLIER',
          docNo: await nextDocNo(tx, 'GF', paidAt),
          supplierId: s.id,
          amount: b.amount,
          method: b.method,
          paidAt,
          receivedBy: u.displayName,
          remark: b.remark,
        },
      })
    })
  })

  app.delete('/supplier-payments/:id', { preHandler: guard('system') }, async (req) => {
    await db.payment.delete({ where: { id: intParam((req.params as { id: string }).id), kind: 'SUPPLIER' } })
    return { ok: true }
  })

  app.get('/finance/payables', fin, async () => supplierPayables(db))

  app.get('/finance/patient-debts', { preHandler: guard('charge', 'patient') }, async (req) =>
    patientDebts(db, (req.query as { keyword?: string }).keyword),
  )

  app.get('/finance/income', { preHandler: guard('finance') }, async (req) => {
    const q = periodQuerySchema.parse(req.query)
    return incomeReport(db, q.from, q.to)
  })

  app.get('/finance/patient-payments', { preHandler: guard('finance', 'charge') }, async (req) => {
    const q = req.query as { from?: string; to?: string }
    return db.payment.findMany({
      where: {
        kind: { in: ['PATIENT', 'PATIENT_REPAY'] },
        ...(q.from || q.to
          ? { paidAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
          : {}),
      },
      include: { patient: { select: { name: true } }, visit: { select: { visitNo: true } } },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: 1000,
    })
  })
}
