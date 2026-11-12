import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import type { PrismaClient } from '@prisma/client'
import Fastify, { type FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerAudit } from './audit'
import { registerAuth } from './auth'
import type { ServerOptions } from './config'
import { createPrisma, detectProvider, ensureSchema, type DbProvider } from './db/client'
import { errorHandler } from './errors'
import { authRoutes } from './routes/auth'
import { financeRoutes } from './routes/finance'
import { masterRoutes } from './routes/master'
import { patientRoutes } from './routes/patients'
import { pharmacyRoutes } from './routes/pharmacy'
import { settingsRoutes } from './routes/settings'
import { systemRoutes } from './routes/system'
import { userRoutes } from './routes/users'
import { visitRoutes } from './routes/visits'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
    dbProvider: DbProvider
    serverOptions: ServerOptions
  }
}

export const VERSION = '0.1.0'

export async function buildApp(opts: ServerOptions): Promise<FastifyInstance> {
  const prisma = createPrisma(opts.databaseUrl)
  const provider = detectProvider(opts.databaseUrl)
  await ensureSchema(prisma, provider, opts.databaseUrl)

  const app = Fastify({
    logger: opts.logger ? { level: 'info' } : false,
    bodyLimit: 10 * 1024 * 1024,
  })
  app.decorate('prisma', prisma)
  app.decorate('dbProvider', provider)
  app.decorate('serverOptions', opts)
  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  app.setErrorHandler(errorHandler)
  await app.register(jwt, { secret: opts.jwtSecret, sign: { expiresIn: '12h' } })
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 1 } })
  registerAuth(app)
  registerAudit(app)

  app.get('/api/health', async () => ({ ok: true, version: VERSION, db: provider }))
  await app.register(
    async (api) => {
      await api.register(authRoutes)
      await api.register(userRoutes)
      await api.register(masterRoutes)
      await api.register(patientRoutes)
      await api.register(visitRoutes)
      await api.register(pharmacyRoutes)
      await api.register(financeRoutes)
      await api.register(systemRoutes)
      await api.register(settingsRoutes)
    },
    { prefix: '/api' },
  )

  const webRoot = opts.webRoot
  if (webRoot && existsSync(join(webRoot, 'index.html'))) {
    await app.register(fastifyStatic, { root: webRoot, wildcard: false })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ message: '接口不存在' })
      return reply.sendFile('index.html')
    })
  }
  return app
}
