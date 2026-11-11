import { dateKey, formatDocNo, type DocPrefix } from '@mediflow/shared'
import type { Tx } from '../db/client'

/**
 * 原子自增计数器（INSERT … ON CONFLICT DO UPDATE … RETURNING），
 * 在调用方事务内执行，SQLite 与 PostgreSQL 通用；替代原系统的 max+1。
 */
export async function nextCounter(tx: Tx, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number | bigint }[]>`
    INSERT INTO "doc_counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "doc_counter"."value" + 1
    RETURNING "value"`
  return Number(rows[0].value)
}

/** 将计数器至少推进到 value（导入旧数据后避免编号冲突） */
export async function bumpCounter(tx: Tx, key: string, value: number): Promise<void> {
  const cur = await tx.docCounter.findUnique({ where: { key } })
  if (!cur) await tx.docCounter.create({ data: { key, value } })
  else if (cur.value < value) await tx.docCounter.update({ where: { key }, data: { value } })
}

/** 单据号：JZ/RK/TH/GF + yyyymmdd + 4 位流水 */
export async function nextDocNo(
  tx: Tx,
  prefix: DocPrefix,
  date: Date | string = new Date(),
): Promise<string> {
  const day = typeof date === 'string' ? date.replace(/-/g, '') : dateKey(date)
  const seq = await nextCounter(tx, `${prefix}${day}`)
  return formatDocNo(prefix, day, seq)
}

export type CodePrefix = 'Y' | 'D' | 'R' | 'X'

/** 主数据编号：Y 药品 / D 供药单位 / R 人员 / X 收费项目 + 5 位 */
export async function nextCode(
  tx: Tx,
  prefix: CodePrefix,
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < 1000; i++) {
    const n = await nextCounter(tx, `CODE_${prefix}`)
    const code = `${prefix}${String(n).padStart(5, '0')}`
    if (!(await exists(code))) return code
  }
  throw new Error('无法生成编号')
}
