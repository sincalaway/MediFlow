// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { pinyin } from 'pinyin-pro'

/** 生成拼音检索码：汉字取拼音首字母，字母数字保留，其他字符忽略。例：999感冒颗粒 -> 999GMKL */
export function pinyinCode(name: string): string {
  if (!name) return ''
  const parts = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array', nonZh: 'consecutive' })
  return parts
    .join('')
    .replace(/[^0-9a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 32)
}

/** 关键字是否匹配名称/检索码/编号（不区分大小写） */
export function matchKeyword(keyword: string, ...fields: (string | null | undefined)[]): boolean {
  const k = keyword.trim().toUpperCase()
  if (!k) return true
  return fields.some((f) => (f ?? '').toUpperCase().includes(k))
}
