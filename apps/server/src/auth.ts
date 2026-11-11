// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { can, type ModuleKey, type Role } from '@mediflow/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { forbidden } from './errors'

export interface AuthUser {
  id: number
  username: string
  role: Role
  displayName: string
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; username: string; role: Role; name: string }
    user: { sub: number; username: string; role: Role; name: string }
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser
    auditRef?: string
  }
}

const PUBLIC = new Set(['/api/health', '/api/auth/login', '/api/auth/setup-status', '/api/auth/setup'])
const ALLOWED_WHEN_MUST_CHANGE = new Set(['/api/auth/me', '/api/auth/change-password'])

/** 全局鉴权：/api 下除公开接口外都需要有效 JWT，且用户仍处于启用状态 */
export function registerAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0]
    if (!url.startsWith('/api/') || PUBLIC.has(url)) return
    try {
      await req.jwtVerify()
    } catch {
      return reply.status(401).send({ message: '未登录或登录已过期' })
    }
    const u = await app.prisma.user.findUnique({ where: { id: req.user.sub } })
    if (!u || !u.active) return reply.status(401).send({ message: '账号已停用' })
    req.authUser = { id: u.id, username: u.username, role: u.role as Role, displayName: u.displayName }
    if (u.mustChangePassword && !ALLOWED_WHEN_MUST_CHANGE.has(url)) {
      return reply.status(428).send({ message: '请先修改初始密码', code: 'MUST_CHANGE_PASSWORD' })
    }
  })
}

/** 路由级权限守卫 */
export function guard(...mods: ModuleKey[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const role = req.authUser?.role
    if (!mods.some((m) => can(role, m))) throw forbidden(`当前角色无权访问该功能`)
  }
}

export function currentUser(req: FastifyRequest): AuthUser {
  if (!req.authUser) throw forbidden('未登录')
  return req.authUser
}
