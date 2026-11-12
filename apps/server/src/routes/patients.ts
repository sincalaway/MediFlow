import { patientSchema, pinyinCode } from '@mediflow/shared'
import type { Prisma } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { guard } from '../auth'
import { contains, intParam } from '../db/search'
import { conflict } from '../errors'
import { visitInclude, withTotals } from '../services/visits'

export const patientRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma
  const read = { preHandler: guard('patient', 'visit.read') }
  const write = { preHandler: guard('patient', 'visit') }

  app.get('/patients', read, async (req) => {
    const q = req.query as { keyword?: string; take?: string }
    const k = q.keyword?.trim()
    const where: Prisma.PatientWhereInput = k
      ? {
          OR: [
            { name: contains(app.dbProvider, k) },
            { pinyin: contains(app.dbProvider, k.toUpperCase()) },
            { phone: contains(app.dbProvider, k) },
            { idCard: contains(app.dbProvider, k) },
          ],
        }
      : {}
    const list = await db.patient.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Number(q.take) || 200, 1000),
      include: { _count: { select: { visits: true } } },
    })
    return list.map(({ _count, ...p }) => ({ ...p, visitCount: _count.visits }))
  })

  app.get('/patients/:id', read, async (req) => {
    const id = intParam((req.params as { id: string }).id)
    const p = await db.patient.findUniqueOrThrow({ where: { id } })
    const visits = await db.visit.findMany({
      where: { patientId: id },
      include: visitInclude,
      orderBy: { visitDate: 'desc' },
    })
    return { ...p, visits: visits.map(withTotals) }
  })

  app.post('/patients', write, async (req) => {
    const b = patientSchema.parse(req.body)
    const force = (req.query as { force?: string }).force === '1'
    if (!force && b.phone) {
      const dup = await db.patient.findFirst({ where: { name: b.name, phone: b.phone } })
      if (dup) throw conflict(`已存在同名同电话的患者档案（ID ${dup.id}）`)
    }
    return db.patient.create({ data: { ...b, pinyin: pinyinCode(b.name) } })
  })

  app.put('/patients/:id', write, async (req) => {
    const b = patientSchema.parse(req.body)
    return db.patient.update({
      where: { id: intParam((req.params as { id: string }).id) },
      data: { ...b, pinyin: pinyinCode(b.name) },
    })
  })

  app.delete('/patients/:id', { preHandler: guard('system') }, async (req) => {
    await db.patient.delete({ where: { id: intParam((req.params as { id: string }).id) } })
    return { ok: true }
  })
}
