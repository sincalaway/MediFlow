// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import type { DbProvider } from './client'

/** 不区分大小写的 contains（SQLite 的 LIKE 默认对 ASCII 不区分大小写；PG 需要 mode） */
export function contains(provider: DbProvider, k: string) {
  return provider === 'postgresql' ? { contains: k, mode: 'insensitive' as const } : { contains: k }
}

export function intParam(v: unknown): number {
  const n = Number(v)
  if (!Number.isInteger(n)) throw Object.assign(new Error('无效 ID'), { statusCode: 400 })
  return n
}
