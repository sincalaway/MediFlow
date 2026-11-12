import type { VisitStatus } from '@mediflow/shared'

export interface VisitListRow {
  id: number
  visitNo: string
  visitDate: string
  status: VisitStatus
  diagnosis: string | null
  patient: { id: number; name: string; phone: string | null }
  doctor: { name: string } | null
  totals: { drugFee: number; otherFee: number; total: number; paid: number; owed: number }
}
