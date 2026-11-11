import { buildApp } from './app'
import { optionsFromEnv } from './config'

async function main() {
  const opts = optionsFromEnv()
  const app = await buildApp(opts)
  const port = Number(process.env.PORT || 3000)
  const host = process.env.HOST || '0.0.0.0'
  await app.listen({ port, host })
  app.log.info(`MediFlow 服务已启动：http://localhost:${port}  数据库：${app.dbProvider}`)
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      app.close().finally(() => process.exit(0))
    })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
