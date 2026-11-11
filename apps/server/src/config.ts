// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export interface ServerOptions {
  databaseUrl: string
  jwtSecret: string
  /** 构建后的前端目录，存在时由服务端静态托管 */
  webRoot?: string | null
  /** 数据目录（备份、密钥等） */
  dataDir: string
  logger?: boolean
}

/** 把 SQLite 相对路径解析为绝对路径并确保目录存在 */
export function resolveSqliteUrl(url: string, baseDir: string): string {
  if (!url.startsWith('file:')) return url
  const [p, q] = url.slice(5).split('?')
  const abs = isAbsolute(p) ? p : resolve(baseDir, p)
  mkdirSync(dirname(abs), { recursive: true })
  return `file:${abs}${q ? '?' + q : ''}`
}

export function loadSecret(dataDir: string): string {
  const f = join(dataDir, '.jwt-secret')
  if (existsSync(f)) return readFileSync(f, 'utf8').trim()
  mkdirSync(dataDir, { recursive: true })
  const s = randomBytes(48).toString('hex')
  writeFileSync(f, s, { mode: 0o600 })
  return s
}

export function optionsFromEnv(): ServerOptions {
  try {
    process.loadEnvFile?.('.env')
  } catch {
    /* 无 .env 文件 */
  }
  const cwd = process.cwd()
  const dataDir = resolve(cwd, process.env.DATA_DIR || 'data')
  const databaseUrl = resolveSqliteUrl(process.env.DATABASE_URL || 'file:./data/mediflow.db', cwd)
  const webRoot = process.env.WEB_ROOT ? resolve(cwd, process.env.WEB_ROOT) : resolve(cwd, '../web/dist')
  return {
    databaseUrl,
    dataDir,
    jwtSecret: process.env.JWT_SECRET || loadSecret(dataDir),
    webRoot: existsSync(join(webRoot, 'index.html')) ? webRoot : null,
    logger: process.env.LOG !== '0',
  }
}
