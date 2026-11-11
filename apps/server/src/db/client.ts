// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { PrismaClient, type Prisma } from '@prisma/client'
import { POSTGRES_SQL, SCHEMA_VERSION, SQLITE_SQL } from './schemaSql'

export type Tx = Prisma.TransactionClient
export type DbProvider = 'sqlite' | 'postgresql'

export function detectProvider(url: string): DbProvider {
  return /^postgres(ql)?:\/\//i.test(url) ? 'postgresql' : 'sqlite'
}

/** SQLite 单连接 + 忙等待，保证事务串行化（单机诊所足够），避免 database is locked */
export function normalizeDbUrl(url: string): string {
  if (detectProvider(url) !== 'sqlite') return url
  const params: string[] = []
  if (!/connection_limit=/.test(url)) params.push('connection_limit=1')
  if (!/socket_timeout=/.test(url)) params.push('socket_timeout=30')
  if (!params.length) return url
  return url + (url.includes('?') ? '&' : '?') + params.join('&')
}

/** 从 file: URL 解析 SQLite 文件路径（相对路径以 prisma 目录为基准，与 Prisma 行为一致时由调用方传入绝对路径更稳妥） */
export function sqliteFilePath(url: string): string | null {
  if (detectProvider(url) !== 'sqlite') return null
  return url.replace(/^file:/, '').replace(/\?.*$/, '')
}

export function createPrisma(url: string): PrismaClient {
  return new PrismaClient({
    datasourceUrl: normalizeDbUrl(url),
    transactionOptions: { maxWait: 15000, timeout: 30000 },
  })
}

function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) =>
      s
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean)
}

/** 首次启动自动建表（无需 Prisma CLI），返回是否新建 */
export async function ensureSchema(
  prisma: PrismaClient,
  provider: DbProvider,
  url?: string,
): Promise<boolean> {
  if (provider === 'postgresql' && url) {
    const schema = /[?&]schema=([^&]+)/.exec(url)?.[1]
    if (schema && schema !== 'public') {
      await prisma.$executeRawUnsafe(
        `CREATE SCHEMA IF NOT EXISTS "${decodeURIComponent(schema).replace(/"/g, '')}"`,
      )
    }
  }
  try {
    const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(
      `SELECT "value" FROM "Meta" WHERE "key" = 'schema_version'`,
    )
    if (rows.length) return false
  } catch {
    // 表不存在 -> 建库
  }
  const statements = splitSql(provider === 'postgresql' ? POSTGRES_SQL : SQLITE_SQL)
  for (const st of statements) {
    await prisma.$executeRawUnsafe(st)
  }
  await prisma.meta.upsert({
    where: { key: 'schema_version' },
    create: { key: 'schema_version', value: String(SCHEMA_VERSION) },
    update: { value: String(SCHEMA_VERSION) },
  })
  return true
}
