// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
// 收集生产运行所需的最小 node_modules（仅 Prisma Client + 查询引擎），用于 Docker 镜像
// 用法：node scripts/runtime-deps.mjs <输出目录>
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = resolve(process.argv[2] || 'runtime')
const req = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'))
const clientDir = dirname(req.resolve('@prisma/client/package.json'))
const generated = join(clientDir, '..', '..', '.prisma', 'client')
if (!existsSync(join(generated, 'index.js'))) throw new Error('Prisma Client 尚未生成')
const nm = join(out, 'node_modules')
mkdirSync(join(nm, '@prisma', 'client', 'runtime'), { recursive: true })
for (const f of ['package.json', 'default.js', 'index.js', 'runtime/library.js']) {
  cpSync(join(clientDir, f), join(nm, '@prisma', 'client', f))
}
cpSync(generated, join(nm, '.prisma', 'client'), {
  recursive: true,
  filter: (src) => !/(wasm|edge|react-native|\.d\.ts$|\.map$)/.test(src.slice(generated.length)),
})
console.log('runtime deps ->', nm)
