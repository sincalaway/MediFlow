import { describe, expect, it } from 'vitest'
import { ageText, moneyUpper, splitPrescription } from './print'

describe('实足年龄', () => {
  it('成人与幼儿', () => {
    expect(ageText('1990-05-20', '2026-05-19')).toBe('35岁')
    expect(ageText('1990-05-20', '2026-05-20')).toBe('36岁')
    expect(ageText('2024-03-10', '2026-01-09')).toBe('1岁9月')
    expect(ageText('2024-01-09', '2026-01-09')).toBe('2岁')
  })
  it('婴儿写月龄、新生儿写日龄', () => {
    expect(ageText('2026-01-01', '2026-01-15')).toBe('14天')
    expect(ageText('2025-12-20', '2026-03-05')).toBe('2月13天')
    expect(ageText('2025-11-05', '2026-03-05')).toBe('4月')
  })
  it('无生日或日期颠倒返回空', () => {
    expect(ageText(null, '2026-01-01')).toBe('')
    expect(ageText('2027-01-01', '2026-01-01')).toBe('')
  })
})

describe('处方分张', () => {
  const line = (id: number, category = '西药', usage = '口服') => ({
    drugId: id,
    name: `药${id}`,
    category,
    quantity: 1,
    unitPrice: 100,
    usage,
  })
  it('每张不超过 5 种，饮片单独成张', () => {
    const items = [1, 2, 3, 4, 5, 6, 7].map((i) => line(i)).concat([line(8, '中药饮片'), line(9, '中药')])
    const sheets = splitPrescription(items)
    expect(sheets.map((s) => [s.kind, s.lines.length])).toEqual([
      ['western', 5],
      ['western', 2],
      ['herbal', 2],
    ])
    expect(sheets[0]!.amount).toBe(500)
  })
  it('同药多批次行合并', () => {
    const sheets = splitPrescription([line(1), { ...line(1), quantity: 2 }, line(1, '西药', '外用')])
    expect(sheets[0]!.lines.map((l) => l.quantity)).toEqual([3, 1])
    expect(sheets[0]!.lines[0]!.amount).toBe(300)
  })
})

describe('金额大写', () => {
  it.each([
    [0, '零元整'],
    [100, '壹元整'],
    [12345, '壹佰贰拾叁元肆角伍分'],
    [100005, '壹仟元零伍分'],
    [1000000, '壹万元整'],
    [10010000, '壹拾万零壹佰元整'],
    [50, '伍角'],
  ])('%i 分 -> %s', (c, s) => expect(moneyUpper(c)).toBe(s))
})
