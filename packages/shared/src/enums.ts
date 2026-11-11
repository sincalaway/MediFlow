// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
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
