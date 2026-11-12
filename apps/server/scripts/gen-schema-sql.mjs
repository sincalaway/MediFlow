// 生成建表 SQL（SQLite + PostgreSQL），写入 src/db/schemaSql.ts，供启动时自动建库（桌面版无需 Prisma CLI）
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const prismaBin = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js')
execFileSync(process.execPath, [join(root, 'scripts/prisma-provider.mjs'), 'postgresql'])

function diff(schema) {
  return execFileSync(
    process.execPath,
    [prismaBin, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schema, '--script'],
    { cwd: root, encoding: 'utf8' },
  )
}
const sqlite = diff('prisma/schema.prisma')
const pg = diff('prisma/schema.postgresql.prisma')
const version = (readFileSync(join(root, 'prisma/schema.prisma'), 'utf8').match(
  /SCHEMA_VERSION\s*=\s*(\d+)/,
) || [0, 1])[1]
const out = `// 自动生成，请勿手改：pnpm db:sql
export const SCHEMA_VERSION = ${version}
export const SQLITE_SQL = ${JSON.stringify(sqlite)}
export const POSTGRES_SQL = ${JSON.stringify(pg)}
`
writeFileSync(join(root, 'src/db/schemaSql.ts'), out)
console.log('wrote src/db/schemaSql.ts')
