import { z } from 'zod'
import { FEE_TYPES, PAY_METHODS, ROLES, RX_TYPES } from './enums'

/** 约定：金额字段一律为「分」的整数；日期字段为 YYYY-MM-DD 字符串 */
export const cents = z.number().int('金额必须为整数分').min(0, '金额不能为负')
export const qty = z.number().int('数量必须为整数').positive('数量必须大于 0')
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
const optStr = z.string().trim().max(500).optional().nullable()
const reqStr = (label: string, max = 100) => z.string().trim().min(1, `${label}不能为空`).max(max)

export const passwordSchema = z.string().min(6, '密码至少 6 位').max(64)

export const loginSchema = z.object({
  username: reqStr('用户名', 32),
  password: z.string().min(1, '请输入密码'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const setupSchema = z.object({
  password: passwordSchema,
  displayName: z.string().trim().max(32).optional(),
})

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: passwordSchema,
})

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]{2,32}$/, '用户名为 2-32 位字母、数字或 _ . -'),
  displayName: reqStr('姓名', 32),
  role: z.enum(ROLES),
  password: passwordSchema,
  staffId: z.number().int().optional().nullable(),
  active: z.boolean().default(true),
})
export const userUpdateSchema = userCreateSchema.omit({ password: true, username: true }).extend({
  password: passwordSchema.optional().or(z.literal('')),
})
export type UserCreateInput = z.infer<typeof userCreateSchema>

export const staffSchema = z.object({
  code: z.string().trim().max(20).optional(),
  name: reqStr('姓名', 32),
  gender: z.enum(['男', '女']).optional().nullable(),
  title: z.string().trim().max(32).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  address: optStr,
  remark: optStr,
  isDoctor: z.boolean().default(false),
  active: z.boolean().default(true),
})
export type StaffInput = z.infer<typeof staffSchema>

export const supplierSchema = z.object({
  code: z.string().trim().max(20).optional(),
  name: reqStr('单位名称', 100),
  contact: z.string().trim().max(32).optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  address: optStr,
  remark: optStr,
  active: z.boolean().default(true),
})
export type SupplierInput = z.infer<typeof supplierSchema>

export const chargeItemSchema = z.object({
  code: z.string().trim().max(20).optional(),
  name: reqStr('项目名称', 64),
  price: cents,
  unit: z.string().trim().max(16).optional().nullable(),
  active: z.boolean().default(true),
})
export type ChargeItemInput = z.infer<typeof chargeItemSchema>

export const drugSchema = z
  .object({
    code: z.string().trim().max(20).optional(),
    name: reqStr('药品名称', 100),
    pinyin: z.string().trim().max(32).optional(),
    category: z.string().trim().max(32).optional().nullable(),
    spec: z.string().trim().max(64).optional().nullable(),
    dosageForm: z.string().trim().max(32).optional().nullable(),
    unit: z.string().trim().max(16).optional().nullable(),
    manufacturer: z.string().trim().max(100).optional().nullable(),
    stockMin: z.number().int().min(0).default(0),
    stockMax: z.number().int().min(0).default(0),
    retailPrice: cents.default(0),
    remark: optStr,
    active: z.boolean().default(true),
  })
  .refine((d) => d.stockMax === 0 || d.stockMax >= d.stockMin, {
    message: '库存上限不能小于库存下限',
    path: ['stockMax'],
  })
export type DrugInput = z.infer<typeof drugSchema>

export const patientSchema = z.object({
  name: reqStr('姓名', 32),
  gender: z.enum(['男', '女']).optional().nullable(),
  birthDate: dateStr.optional().nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  idCard: z.string().trim().max(32).optional().nullable(),
  address: optStr,
  allergies: optStr,
  history: optStr,
  remark: optStr,
})
export type PatientInput = z.infer<typeof patientSchema>

export const prescriptionLineSchema = z.object({
  drugId: z.number().int(),
  quantity: qty,
  unitPrice: cents,
  usage: z.string().trim().max(100).optional().nullable(),
})
export const visitChargeLineSchema = z.object({
  chargeItemId: z.number().int(),
  quantity: qty.default(1),
  unitPrice: cents,
})

export const visitSaveSchema = z.object({
  patientId: z.number().int(),
  doctorId: z.number().int().optional().nullable(),
  visitDate: z.string().datetime({ offset: true }).optional(),
  chiefComplaint: optStr,
  history: optStr,
  diagnosis: optStr,
  remark: optStr,
  /** 处方前记：费别、科别、处方类别、体重；麻、精一处方另需代办人信息 */
  feeType: z.enum(FEE_TYPES).optional().nullable(),
  department: z.string().trim().max(32).optional().nullable(),
  rxType: z.enum(RX_TYPES).default('普通'),
  weight: z.string().trim().max(16).optional().nullable(),
  agentName: z.string().trim().max(32).optional().nullable(),
  agentIdCard: z.string().trim().max(32).optional().nullable(),
  prescription: z.array(prescriptionLineSchema).default([]),
  charges: z.array(visitChargeLineSchema).default([]),
  /** 保存后立即按 FEFO 发药 */
  dispense: z.boolean().default(false),
})
export type VisitSaveInput = z.infer<typeof visitSaveSchema>

export const patientPaymentSchema = z.object({
  visitId: z.number().int(),
  amount: z.number().int().positive('金额必须大于 0'),
  method: z.enum(PAY_METHODS).default('现金'),
  paidAt: dateStr.optional(),
  remark: optStr,
})

export const purchaseLineSchema = z.object({
  drugId: z.number().int(),
  batchNo: z.string().trim().max(32).optional().nullable(),
  mfgDate: dateStr.optional().nullable(),
  expiryDate: dateStr,
  quantity: qty,
  costPrice: cents,
})
export const purchaseOrderSchema = z.object({
  supplierId: z.number().int(),
  orderDate: dateStr.optional(),
  handler: z.string().trim().max(32).optional().nullable(),
  remark: optStr,
  /** 入库时当场支付的金额（分），生成一笔供应商付款 */
  paidNow: cents.default(0),
  payMethod: z.enum(PAY_METHODS).default('银行卡'),
  lines: z.array(purchaseLineSchema).min(1, '至少一行入库明细'),
})
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>

export const returnLineSchema = z.object({
  batchId: z.number().int(),
  quantity: qty,
  unitPrice: cents,
})
export const supplierReturnSchema = z.object({
  supplierId: z.number().int(),
  returnDate: dateStr.optional(),
  handler: z.string().trim().max(32).optional().nullable(),
  remark: optStr,
  lines: z.array(returnLineSchema).min(1, '至少一行退货明细'),
})
export type SupplierReturnInput = z.infer<typeof supplierReturnSchema>

export const supplierPaymentSchema = z.object({
  supplierId: z.number().int(),
  amount: z.number().int().positive('金额必须大于 0'),
  method: z.enum(PAY_METHODS).default('银行卡'),
  paidAt: dateStr.optional(),
  remark: optStr,
})

export const stockAdjustSchema = z.object({
  batchId: z.number().int(),
  /** 盘点后的实际数量 */
  actualQuantity: z.number().int().min(0),
  remark: optStr,
})

export const periodQuerySchema = z.object({
  from: dateStr,
  to: dateStr,
})

/** 机构信息（处方笺/收据抬头），存于 Meta 表 */
export const clinicSettingsSchema = z.object({
  name: z.string().trim().max(64).default(''),
  address: z.string().trim().max(128).default(''),
  phone: z.string().trim().max(32).default(''),
  department: z.string().trim().max(32).default(''),
  receiptNote: z.string().trim().max(200).default(''),
})
export type ClinicSettings = z.infer<typeof clinicSettingsSchema>
