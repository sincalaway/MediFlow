import type { ClinicSettings, FeeType, PaymentKind, RxType, VisitStatus, VisitTotals } from '@mediflow/shared'
import { api } from '../../api'

export interface PrintVisit {
  id: number
  visitNo: string
  visitDate: string
  status: VisitStatus
  diagnosis: string | null
  feeType: FeeType | null
  department: string | null
  rxType: RxType
  weight: string | null
  agentName: string | null
  agentIdCard: string | null
  patient: {
    id: number
    name: string
    gender: string | null
    birthDate: string | null
    phone: string | null
    idCard: string | null
    address: string | null
    allergies: string | null
  }
  doctor: { id: number; name: string } | null
  items: {
    drugId: number
    quantity: number
    unitPrice: number
    usage: string | null
    drug: {
      name: string
      category: string | null
      dosageForm: string | null
      spec: string | null
      unit: string | null
    }
  }[]
  charges: { quantity: number; unitPrice: number; chargeItem: { name: string } }[]
  payments: {
    id: number
    kind: PaymentKind
    amount: number
    method: string
    paidAt: string
    receivedBy: string | null
  }[]
  totals: VisitTotals
}

export async function loadPrintData(id: string | number) {
  const [visit, clinic] = await Promise.all([
    api.get<PrintVisit>(`/visits/${id}`),
    api.get<ClinicSettings>('/settings/clinic'),
  ])
  return { visit, clinic }
}

/** 门诊病历号：按患者主键编号，跨就诊不变 */
export const recordNo = (patientId: number) => `MZ${String(patientId).padStart(6, '0')}`

export const ymdCn = (d: string | Date) => {
  const x = new Date(d)
  return `${x.getFullYear()}年${String(x.getMonth() + 1).padStart(2, '0')}月${String(x.getDate()).padStart(2, '0')}日`
}
export const ymd = (d: string | Date) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
