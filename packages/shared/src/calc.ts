/** 核心金额计算：所有汇总都由明细行计算，不允许手填 */
export interface LineLike {
  quantity: number
  unitPrice: number // 分
}
export interface PaymentLike {
  amount: number // 分
}

export interface VisitTotals {
  drugFee: number
  otherFee: number
  total: number
  paid: number
  owed: number
}

export function lineAmount(l: LineLike): number {
  return l.quantity * l.unitPrice
}

export function sumLines(lines: LineLike[]): number {
  return lines.reduce((s, l) => s + lineAmount(l), 0)
}

export function sumPayments(payments: PaymentLike[]): number {
  return payments.reduce((s, p) => s + p.amount, 0)
}

export function computeVisitTotals(
  prescriptionItems: LineLike[],
  chargeItems: LineLike[],
  payments: PaymentLike[],
): VisitTotals {
  const drugFee = sumLines(prescriptionItems)
  const otherFee = sumLines(chargeItems)
  const total = drugFee + otherFee
  const paid = sumPayments(payments)
  return { drugFee, otherFee, total, paid, owed: total - paid }
}

export interface SupplierPayable {
  purchases: number
  returns: number
  payments: number
  payable: number
}

/** 应付账款 = 入库总额 − 退货总额 − 已付款（修复原系统未扣退货的问题） */
export function computeSupplierPayable(
  purchases: number,
  returns: number,
  payments: number,
): SupplierPayable {
  return { purchases, returns, payments, payable: purchases - returns - payments }
}

export interface BatchStock {
  id: number
  /** 有效期至，YYYY-MM-DD */
  expiryDate: string
  stock: number
}
export interface Allocation {
  batchId: number
  quantity: number
}

/** 本地日期字符串 YYYY-MM-DD */
export function toDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return toDateStr(new Date(y, m - 1, d + days))
}

/** 有效期至 <= 今天 视为已过期（与原系统「有效期至 > date()」一致） */
export function isExpired(expiryDate: string, today: string = toDateStr()): boolean {
  return expiryDate <= today
}

/**
 * 先过期先出（FEFO）分配：跳过已过期与无库存批次，按有效期升序扣减。
 * 库存不足时抛出 InsufficientStockError。纯函数，事务内由服务端调用。
 */
export function allocateFefo(
  batches: BatchStock[],
  quantity: number,
  today: string = toDateStr(),
): Allocation[] {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('数量必须为正整数')
  const usable = batches
    .filter((b) => b.stock > 0 && !isExpired(b.expiryDate, today))
    .sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : a.expiryDate > b.expiryDate ? 1 : a.id - b.id))
  const available = usable.reduce((s, b) => s + b.stock, 0)
  if (available < quantity) {
    throw new InsufficientStockError(quantity, available)
  }
  const result: Allocation[] = []
  let left = quantity
  for (const b of usable) {
    if (left <= 0) break
    const take = Math.min(b.stock, left)
    result.push({ batchId: b.id, quantity: take })
    left -= take
  }
  return result
}

export class InsufficientStockError extends Error {
  constructor(
    public required: number,
    public available: number,
    public drugName?: string,
  ) {
    super(`${drugName ? drugName + ' ' : ''}库存不足：需要 ${required}，有效库存仅 ${available}`)
    this.name = 'InsufficientStockError'
  }
}

export type ExpiryState = 'expired' | 'near' | 'valid'
export function expiryState(expiryDate: string, today: string = toDateStr(), nearDays = 30): ExpiryState {
  if (isExpired(expiryDate, today)) return 'expired'
  if (expiryDate <= addDays(today, nearDays)) return 'near'
  return 'valid'
}
