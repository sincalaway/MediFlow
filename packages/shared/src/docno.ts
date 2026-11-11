// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import type { DocPrefix } from './enums'

export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** 单据号：前缀 + yyyymmdd + 4 位流水（超过 9999 自动加宽，不会溢出） */
export function formatDocNo(prefix: DocPrefix, day: string, seq: number): string {
  return `${prefix}${day}${String(seq).padStart(4, '0')}`
}
