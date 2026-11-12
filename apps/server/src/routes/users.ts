import { userCreateSchema, userUpdateSchema } from '@mediflow/shared'
import bcrypt from 'bcryptjs'
import type { FastifyPluginAsync } from 'fastify'
import { currentUser, guard } from '../auth'
import { intParam } from '../db/search'
import { badRequest } from '../errors'

const select = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  active: true,
  staffId: true,
  lastLoginAt: true,
  createdAt: true,
  mustChangePassword: true,
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma
  const admin = { preHandler: guard('basic.user') }

  app.get('/users', admin, async () => db.user.findMany({ select, orderBy: { id: 'asc' } }))

  app.post('/users', admin, async (req) => {
    const b = userCreateSchema.parse(req.body)
    const { password, ...rest } = b
    return db.user.create({
      data: { ...rest, passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
      select,
    })
  })

  app.put('/users/:id', admin, async (req) => {
    const id = intParam((req.params as { id: string }).id)
    const b = userUpdateSchema.parse(req.body)
    const target = await db.user.findUniqueOrThrow({ where: { id } })
    if (target.role === 'admin' && (b.role !== 'admin' || !b.active)) {
      const admins = await db.user.count({ where: { role: 'admin', active: true } })
      if (admins <= 1) throw badRequest('至少保留一个启用的管理员')
    }
    const { password, ...rest } = b
    return db.user.update({
      where: { id },
      data: {
        ...rest,
        ...(password ? { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true } : {}),
      },
      select,
    })
  })

  app.delete('/users/:id', admin, async (req) => {
    const id = intParam((req.params as { id: string }).id)
    if (id === currentUser(req).id) throw badRequest('不能删除当前登录用户')
    const target = await db.user.findUniqueOrThrow({ where: { id } })
    if (target.role === 'admin' && (await db.user.count({ where: { role: 'admin', active: true } })) <= 1) {
      throw badRequest('至少保留一个启用的管理员')
    }
    await db.user.delete({ where: { id } })
    return { ok: true }
  })
}
