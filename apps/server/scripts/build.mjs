// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
// 打包服务端为单文件 CJS（@prisma/client 保持外部依赖）
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['@prisma/client', '.prisma/client'],
  logLevel: 'info',
})
