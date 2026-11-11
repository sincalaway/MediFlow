import type { FastifyInstance } from 'fastify'

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function redact(body: unknown): string | null {
  if (body == null || typeof body !== 'object') return null
  const s = JSON.stringify(body, (k, v) => (/password/i.test(k) ? '***' : v))
  return s.length > 2000 ? s.slice(0, 2000) + '…' : s
}

/** 所有写操作记录审计日志（含失败请求），在响应结束后写入，不阻塞业务事务 */
export function registerAudit(app: FastifyInstance) {
  app.addHook('onSend', async (req, _reply, payload) => {
    if (!WRITE.has(req.method) || typeof payload !== 'string') return payload
    try {
      const p = JSON.parse(payload)
      const ref = p?.visitNo ?? p?.orderNo ?? p?.returnNo ?? p?.docNo ?? p?.code ?? p?.id
      if (ref != null) req.auditRef = String(ref)
    } catch {
      /* 非 JSON */
    }
    return payload
  })
  app.addHook('onResponse', async (req, reply) => {
    if (!WRITE.has(req.method) || !req.url.startsWith('/api/')) return
    const route = req.routeOptions.url ?? req.url
    const entity = route.replace(/^\/api\//, '').split('/')[0] || null
    const params = req.params as Record<string, string> | undefined
    const body = req.isMultipart() ? { file: '(上传文件)' } : req.body
    const username =
      req.authUser?.username ??
      (typeof (req.body as { username?: unknown })?.username === 'string'
        ? (req.body as { username: string }).username
        : null)
    try {
      await app.prisma.auditLog.create({
        data: {
          userId: req.authUser?.id ?? null,
          username,
          method: req.method,
          path: req.url.slice(0, 300),
          entity,
          entityId: params?.id ?? req.auditRef ?? null,
          statusCode: reply.statusCode,
          summary: redact(body),
          ip: req.ip,
        },
      })
    } catch (e) {
      req.log.warn({ err: e }, 'audit log failed')
    }
  })
}
