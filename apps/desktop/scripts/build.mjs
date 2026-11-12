// 生成桌面版打包目录 .stage：
//   main.js            Electron 主进程 + 内置服务端（esbuild 打包）
//   web/               前端构建产物（apps/web/dist）
//   node_modules/      仅包含 Prisma Client 运行时与生成的客户端/查询引擎
import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stage = join(root, '.stage')
const webDist = join(root, '../web/dist')
const serverPkg = join(root, '../server/package.json')

if (!existsSync(join(webDist, 'index.html'))) {
  console.error('未找到 apps/web/dist，请先执行 pnpm build')
  process.exit(1)
}
rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

await build({
  entryPoints: [join(root, 'src/main.ts')],
  outfile: join(stage, 'main.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: true,
  external: ['electron', '@prisma/client', '.prisma/client'],
  logLevel: 'info',
})

if (process.argv.includes('--smoke')) {
  await build({
    entryPoints: [join(root, 'src/smoke.ts')],
    outfile: join(stage, 'smoke.js'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron', '@prisma/client', '.prisma/client'],
    logLevel: 'warning',
  })
}

cpSync(webDist, join(stage, 'web'), { recursive: true })

// Prisma Client：@prisma/client 的入口 + library 运行时，以及生成的 .prisma/client（含本平台查询引擎）
const req = createRequire(serverPkg)
const clientDir = dirname(req.resolve('@prisma/client/package.json'))
const generated = join(clientDir, '..', '..', '.prisma', 'client')
if (!existsSync(join(generated, 'index.js'))) {
  console.error('未找到生成的 Prisma Client，请先执行 pnpm --filter @mediflow/server prisma:generate')
  process.exit(1)
}
const nm = join(stage, 'node_modules')
const outClient = join(nm, '@prisma', 'client')
mkdirSync(join(outClient, 'runtime'), { recursive: true })
for (const f of ['package.json', 'default.js', 'index.js']) cpSync(join(clientDir, f), join(outClient, f))
for (const f of ['library.js']) cpSync(join(clientDir, 'runtime', f), join(outClient, 'runtime', f))
cpSync(generated, join(nm, '.prisma', 'client'), {
  recursive: true,
  filter: (src) => !/(wasm|edge|react-native|\.d\.ts$|\.map$)/.test(src.slice(generated.length)),
})

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
writeFileSync(
  join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'mediflow',
      productName: 'MediFlow',
      version: pkg.version,
      description: pkg.description,
      author: pkg.author,
      license: 'MIT',
      main: 'main.js',
    },
    null,
    2,
  ),
)
console.log('desktop stage ready:', stage)
