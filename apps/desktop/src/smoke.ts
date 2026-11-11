/* 桌面版冒烟测试：用 Electron 自带的 Node 运行（ELECTRON_RUN_AS_NODE=1），验证内置服务 + Prisma 引擎可用 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startServer } from './serverHost'

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'mediflow-smoke-'))
  const s = await startServer(dir, join(__dirname, 'web'))
  const health = await (await fetch(`${s.url}api/health`)).json()
  const setup = await (await fetch(`${s.url}api/auth/setup-status`)).json()
  const index = await fetch(s.url)
  const html = await index.text()
  await s.app.close()
  rmSync(dir, { recursive: true, force: true })
  const ok = health.ok && setup.needsSetup === true && index.status === 200 && html.includes('<div id="app">')
  console.log(
    JSON.stringify({ health, setup, indexStatus: index.status, ok, versions: process.versions.electron }),
  )
  process.exit(ok ? 0 : 1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
