// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
/** 金额统一以「分」为单位的整数存储与计算 */
export function yuanToCents(yuan: number | string): number {
  const n = typeof yuan === 'string' ? Number(yuan) : yuan
  if (!Number.isFinite(n)) throw new Error(`无效金额: ${yuan}`)
  return Math.round(n * 100)
}

export function centsToYuan(cents: number): number {
  return cents / 100
}

/** 格式化为 "¥1,234.50" 风格（不含符号时 symbol=false） */
export function formatMoney(cents: number | null | undefined, symbol = true): string {
  const v = (cents ?? 0) / 100
  const s = v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return symbol ? `¥${s}` : s
}

/** Access Currency 原始值（×10000 的定点整数）转为分 */
export function accessCurrencyToCents(raw: number | null | undefined): number {
  if (raw == null) return 0
  return Math.round(Number(raw) / 100)
}
