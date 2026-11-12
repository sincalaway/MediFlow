export const ROLES = ['admin', 'doctor', 'pharmacist', 'cashier'] as const
export type Role = (typeof ROLES)[number]
export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理员',
  doctor: '医生',
  pharmacist: '药剂师',
  cashier: '收费员',
}

export const VISIT_STATUS = ['OPEN', 'DISPENSED', 'CANCELLED'] as const
export type VisitStatus = (typeof VISIT_STATUS)[number]
export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  OPEN: '待发药',
  DISPENSED: '已发药',
  CANCELLED: '已作废',
}

export const MOVEMENT_TYPES = ['IN', 'RETURN', 'DISPENSE', 'ADJUST'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]
export const MOVEMENT_LABELS: Record<MovementType, string> = {
  IN: '入库',
  RETURN: '退货',
  DISPENSE: '发药',
  ADJUST: '盘点调整',
}

export const PAYMENT_KINDS = ['PATIENT', 'PATIENT_REPAY', 'SUPPLIER'] as const
export type PaymentKind = (typeof PAYMENT_KINDS)[number]
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  PATIENT: '就诊收费',
  PATIENT_REPAY: '患者还款',
  SUPPLIER: '供应商付款',
}

export const PAY_METHODS = ['现金', '微信', '支付宝', '银行卡', '医保', '其他'] as const

export const DOC_PREFIXES = ['JZ', 'RK', 'TH', 'GF'] as const
export type DocPrefix = (typeof DOC_PREFIXES)[number]

/** 处方类别（《处方管理办法》附件1 处方标准·二、处方颜色） */
export const RX_TYPES = ['普通', '急诊', '儿科', '麻、精一', '精二'] as const
export type RxType = (typeof RX_TYPES)[number]
export const RX_TYPE_STYLE: Record<RxType, { paper: string; mark: string | null; paperName: string }> = {
  普通: { paper: '#ffffff', mark: null, paperName: '白色' },
  急诊: { paper: '#fff8d6', mark: '急诊', paperName: '淡黄色' },
  儿科: { paper: '#e6f5e3', mark: '儿科', paperName: '淡绿色' },
  '麻、精一': { paper: '#fde4e4', mark: '麻、精一', paperName: '淡红色' },
  精二: { paper: '#ffffff', mark: '精二', paperName: '白色' },
}

/** 费别 */
export const FEE_TYPES = ['自费', '医保', '公费', '其他'] as const
export type FeeType = (typeof FEE_TYPES)[number]
