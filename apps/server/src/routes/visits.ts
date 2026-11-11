// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { addDays, patientPaymentSchema, visitSaveSchema } from '@mediflow/shared'
import type { Prisma } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { currentUser, guard } from '../auth'
import { contains, intParam } from '../db/search'
import { dispenseVisit } from '../services/stock'
import {
  addPatientPayment,
  cancelVisit,
  getVisit,
  saveVisit,
  visitInclude,
  withTotals,
} from '../services/visits'

export const visitRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma

  app.get('/visits', { preHandler: guard('visit.read', 'charge') }, async (req) => {
    const q = req.query as { from?: string; to?: string; keyword?: string; status?: string; owed?: string }
    const where: Prisma.VisitWhereInput = {}
    if (q.from || q.to) {
      where.visitDate = {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00`) } : {}),
        ...(q.to ? { lt: new Date(`${addDays(q.to, 1)}T00:00:00`) } : {}),
      }
    }
    if (q.status) where.status = q.status
    const k = q.keyword?.trim()
    if (k) {
      where.OR = [
        { visitNo: contains(app.dbProvider, k) },
        { diagnosis: contains(app.dbProvider, k) },
        { patient: { name: contains(app.dbProvider, k) } },
        { patient: { pinyin: contains(app.dbProvider, k.toUpperCase()) } },
        { patient: { phone: contains(app.dbProvider, k) } },
      ]
    }
    const list = await db.visit.findMany({
      where,
      include: visitInclude,
      orderBy: { visitDate: 'desc' },
      take: 500,
    })
    const rows = list.map(withTotals)
    return q.owed === '1' ? rows.filter((v) => v.totals.owed > 0) : rows
  })

  app.get('/visits/:id', { preHandler: guard('visit.read', 'charge') }, async (req) =>
    getVisit(db, intParam((req.params as { id: string }).id)),
  )

  app.post('/visits', { preHandler: guard('visit') }, async (req) => {
    const b = visitSaveSchema.parse(req.body)
    const u = currentUser(req)
    const id = await db.$transaction((tx) => saveVisit(tx, b, u.id))
    return getVisit(db, id)
  })

  app.put('/visits/:id', { preHandler: guard('visit') }, async (req) => {
    const b = visitSaveSchema.parse(req.body)
    const u = currentUser(req)
    const id = await db.$transaction((tx) =>
      saveVisit(tx, b, u.id, intParam((req.params as { id: string }).id)),
    )
    return getVisit(db, id)
  })

  /** 发药：FEFO 自动选批次，拒绝过期，库存不足整单失败 */
  app.post('/visits/:id/dispense', { preHandler: guard('dispense') }, async (req) => {
    const id = intParam((req.params as { id: string }).id)
    const u = currentUser(req)
    await db.$transaction((tx) => dispenseVisit(tx, id, u.id))
    return getVisit(db, id)
  })

  app.post('/visits/:id/cancel', { preHandler: guard('visit') }, async (req) => {
    const id = intParam((req.params as { id: string }).id)
    await db.$transaction((tx) => cancelVisit(tx, id))
    return getVisit(db, id)
  })

  app.post('/visits/:id/payments', { preHandler: guard('charge') }, async (req) => {
    const id = intParam((req.params as { id: string }).id)
    const b = patientPaymentSchema.parse({ ...(req.body as object), visitId: id })
    const u = currentUser(req)
    await db.$transaction((tx) => addPatientPayment(tx, b, u.displayName))
    return getVisit(db, id)
  })
}
