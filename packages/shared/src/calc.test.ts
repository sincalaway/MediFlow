// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { describe, expect, it } from 'vitest'
import {
  allocateFefo,
  computeSupplierPayable,
  computeVisitTotals,
  expiryState,
  InsufficientStockError,
} from './calc'
import { formatDocNo } from './docno'
import { accessCurrencyToCents, yuanToCents } from './money'
import { pinyinCode } from './pinyin'

describe('FEFO 分配（纯函数）', () => {
  const batches = [
    { id: 1, expiryDate: '2027-06-01', stock: 5 },
    { id: 2, expiryDate: '2026-12-01', stock: 3 },
    { id: 3, expiryDate: '2026-01-01', stock: 100 }, // 已过期
    { id: 4, expiryDate: '2028-01-01', stock: 10 },
  ]
  it('按有效期先后扣减并跳过过期批次', () => {
    expect(allocateFefo(batches, 6, '2026-11-11')).toEqual([
      { batchId: 2, quantity: 3 },
      { batchId: 1, quantity: 3 },
    ])
  })
  it('库存不足时抛错（过期库存不计入）', () => {
    expect(() => allocateFefo(batches, 19, '2026-11-11')).toThrow(InsufficientStockError)
    expect(allocateFefo(batches, 18, '2026-11-11')).toHaveLength(3)
  })
  it('有效期当天视为过期', () => {
    expect(() => allocateFefo([{ id: 1, expiryDate: '2026-11-11', stock: 9 }], 1, '2026-11-11')).toThrow()
  })
})

describe('金额计算', () => {
  it('就诊合计由明细计算', () => {
    const t = computeVisitTotals(
      [
        { quantity: 1, unitPrice: 2000 },
        { quantity: 2, unitPrice: 1300 },
      ],
      [{ quantity: 1, unitPrice: 500 }],
      [{ amount: 4000 }],
    )
    expect(t).toEqual({ drugFee: 4600, otherFee: 500, total: 5100, paid: 4000, owed: 1100 })
  })
  it('应付 = 入库 − 退货 − 付款', () => {
    expect(computeSupplierPayable(36000, 2400, 30000).payable).toBe(3600)
  })
  it('Access Currency 与元转换', () => {
    expect(accessCurrencyToCents(3000000)).toBe(30000)
    expect(yuanToCents('12.345')).toBe(1235)
    expect(yuanToCents(0.1 + 0.2)).toBe(30)
  })
})

describe('其它工具', () => {
  it('单据号 4 位流水，超出自动加宽', () => {
    expect(formatDocNo('JZ', '20261111', 7)).toBe('JZ202611110007')
    expect(formatDocNo('RK', '20261111', 12345)).toBe('RK2026111112345')
  })
  it('拼音检索码', () => {
    expect(pinyinCode('大青叶感冒片')).toBe('DQYGMP')
    expect(pinyinCode('999感冒颗粒')).toBe('999GMKL')
    expect(pinyinCode('小儿氨酚黄那敏颗粒')).toBe('XEAFHNMKL')
  })
  it('效期状态', () => {
    expect(expiryState('2026-11-11', '2026-11-11')).toBe('expired')
    expect(expiryState('2026-12-01', '2026-11-11')).toBe('near')
    expect(expiryState('2027-12-01', '2026-11-11')).toBe('valid')
  })
})
