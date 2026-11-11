// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { buildApp } from '@mediflow/server/src/app'
import { loadSecret } from '@mediflow/server/src/config'
import { mkdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

/** 在当前进程内启动 MediFlow 服务：SQLite 存放在用户数据目录，监听 127.0.0.1 的随机空闲端口 */
export async function startServer(userDataDir: string, webRoot: string) {
  const dataDir = join(userDataDir, 'data')
  mkdirSync(dataDir, { recursive: true })
  const app = await buildApp({
    databaseUrl: `file:${join(dataDir, 'mediflow.db')}`,
    jwtSecret: loadSecret(dataDir),
    webRoot,
    dataDir,
    logger: false,
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = (app.server.address() as AddressInfo).port
  return { app, port, dataDir, url: `http://127.0.0.1:${port}/` }
}
