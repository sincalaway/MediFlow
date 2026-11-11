// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { changePasswordSchema, loginSchema, setupSchema } from '@mediflow/shared'
import bcrypt from 'bcryptjs'
import type { FastifyPluginAsync } from 'fastify'
import { currentUser } from '../auth'
import { AppError, badRequest, conflict } from '../errors'

export const authRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma

  /** 首次运行：系统内没有任何用户时需要设置管理员密码 */
  app.get('/auth/setup-status', async () => ({ needsSetup: (await db.user.count()) === 0 }))

  app.post('/auth/setup', async (req) => {
    const body = setupSchema.parse(req.body)
    if ((await db.user.count()) > 0) throw conflict('系统已初始化')
    const user = await db.user.create({
      data: {
        username: 'admin',
        displayName: body.displayName || '系统管理员',
        role: 'admin',
        passwordHash: await bcrypt.hash(body.password, 10),
      },
    })
    return { id: user.id, username: user.username }
  })

  app.post('/auth/login', async (req) => {
    const body = loginSchema.parse(req.body)
    const user = await db.user.findUnique({ where: { username: body.username } })
    if (!user || !user.active || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new AppError(401, '用户名或密码错误')
    }
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const token = app.jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role as never,
      name: user.displayName,
    })
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        staffId: user.staffId,
      },
    }
  })

  app.get('/auth/me', async (req) => {
    const u = await db.user.findUniqueOrThrow({
      where: { id: currentUser(req).id },
      include: { staff: true },
    })
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      mustChangePassword: u.mustChangePassword,
      staffId: u.staffId,
    }
  })

  app.post('/auth/change-password', async (req) => {
    const body = changePasswordSchema.parse(req.body)
    const u = await db.user.findUniqueOrThrow({ where: { id: currentUser(req).id } })
    if (!(await bcrypt.compare(body.oldPassword, u.passwordHash))) throw badRequest('原密码错误')
    if (body.oldPassword === body.newPassword) throw badRequest('新密码不能与原密码相同')
    await db.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 10), mustChangePassword: false },
    })
    return { ok: true }
  })
}
