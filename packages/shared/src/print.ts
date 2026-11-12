/**
 * 处方/收据打印的纯函数。
 * 依据《处方管理办法》（卫生部令第53号）第六条与附件1「处方标准」：
 * - 年龄填写实足年龄，新生儿、婴幼儿写日、月龄
 * - 西药、中成药每张处方不得超过 5 种药品；中药饮片应当单独开具处方
 */

function parseYmd(s: string): [number, number, number] {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return [y!, m!, d!]
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** 实足年龄：<1 月写「N天」，<1 岁写「N月」或「N月N天」，<3 岁写「N岁N月」，其余写「N岁」 */
export function ageText(birthDate: string | null | undefined, onDate: string): string {
  if (!birthDate) return ''
  const [by, bm, bd] = parseYmd(birthDate)
  const [ty, tm, td] = parseYmd(onDate)
  let years = ty - by
  let months = tm - bm
  let days = td - bd
  if (days < 0) {
    months -= 1
    // 借上一个月的天数
    const pm = tm - 1 === 0 ? 12 : tm - 1
    const py = tm - 1 === 0 ? ty - 1 : ty
    days += daysInMonth(py, pm)
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  if (years < 0) return ''
  if (years === 0 && months === 0) return `${days}天`
  if (years === 0) return days ? `${months}月${days}天` : `${months}月`
  if (years < 3) return months ? `${years}岁${months}月` : `${years}岁`
  return `${years}岁`
}

export interface RxPrintLineInput {
  drugId: number
  name: string
  category?: string | null
  dosageForm?: string | null
  spec?: string | null
  unit?: string | null
  quantity: number
  unitPrice: number
  usage?: string | null
}
export interface RxPrintLine extends RxPrintLineInput {
  amount: number
}
export interface RxSheet {
  kind: 'western' | 'herbal'
  lines: RxPrintLine[]
  amount: number
}

export const MAX_DRUGS_PER_SHEET = 5
export const MAX_HERBAL_PER_SHEET = 24

export function isHerbal(category?: string | null): boolean {
  if (!category) return false
  return category.includes('饮片') || category.trim() === '中药'
}

/** 发药时同一药品可能拆成多个批次行，打印时按 药品+单价+用法 合并 */
export function mergeRxLines(items: RxPrintLineInput[]): RxPrintLine[] {
  const out: RxPrintLine[] = []
  for (const it of items) {
    const usage = it.usage?.trim() || null
    const hit = out.find(
      (o) => o.drugId === it.drugId && o.unitPrice === it.unitPrice && (o.usage ?? null) === usage,
    )
    if (hit) {
      hit.quantity += it.quantity
      hit.amount = hit.quantity * hit.unitPrice
    } else out.push({ ...it, usage, amount: it.quantity * it.unitPrice })
  }
  return out
}

function chunk<T>(arr: T[], n: number): T[][] {
  const r: T[][] = []
  for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n))
  return r
}

/** 把处方拆成若干张处方笺：西药/中成药每张 ≤5 种；中药饮片单独成张 */
export function splitPrescription(items: RxPrintLineInput[]): RxSheet[] {
  const merged = mergeRxLines(items)
  const western = merged.filter((l) => !isHerbal(l.category))
  const herbal = merged.filter((l) => isHerbal(l.category))
  const sheets: RxSheet[] = []
  for (const lines of chunk(western, MAX_DRUGS_PER_SHEET))
    sheets.push({ kind: 'western', lines, amount: lines.reduce((s, l) => s + l.amount, 0) })
  for (const lines of chunk(herbal, MAX_HERBAL_PER_SHEET))
    sheets.push({ kind: 'herbal', lines, amount: lines.reduce((s, l) => s + l.amount, 0) })
  return sheets
}

/** 金额（分）转中文大写，用于收据：12345 -> 壹佰贰拾叁元肆角伍分 */
export function moneyUpper(cents: number): string {
  if (!Number.isFinite(cents)) return ''
  const neg = cents < 0
  let n = Math.abs(Math.round(cents))
  if (n === 0) return '零元整'
  const digits = '零壹贰叁肆伍陆柒捌玖'
  const jiao = Math.floor(n / 10) % 10
  const fen = n % 10
  n = Math.floor(n / 100)
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '万', '亿', '兆']
  let intPart = ''
  let group = 0
  let needZero = false
  while (n > 0) {
    const sec = n % 10000
    if (sec) {
      let s = ''
      let zero = false
      let x = sec
      for (let i = 0; i < 4 && x > 0; i++) {
        const d = x % 10
        if (d) {
          s = digits[d]! + units[i]! + (zero ? '零' : '') + s
          zero = false
        } else if (s) zero = true
        x = Math.floor(x / 10)
      }
      intPart = s + bigUnits[group]! + (needZero ? '零' : '') + intPart
      needZero = sec < 1000
    } else if (intPart) needZero = true
    n = Math.floor(n / 10000)
    group++
  }
  let res = intPart ? intPart + '元' : ''
  if (!jiao && !fen) res += '整'
  else {
    if (jiao) res += digits[jiao] + '角'
    else if (intPart) res += '零'
    if (fen) res += digits[fen] + '分'
  }
  return (neg ? '负' : '') + res
}
