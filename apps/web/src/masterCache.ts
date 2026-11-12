import { ref } from 'vue'
import { api } from './api'

export interface DrugLite {
  id: number
  code: string
  name: string
  pinyin: string
  spec: string | null
  unit: string | null
  manufacturer: string | null
  retailPrice: number
  active: boolean
}
export interface SupplierLite {
  id: number
  code: string
  name: string
  active: boolean
}

export const drugs = ref<DrugLite[]>([])
export const suppliers = ref<SupplierLite[]>([])

export async function loadDrugs(force = false) {
  if (!force && drugs.value.length) return drugs.value
  drugs.value = await api.get<DrugLite[]>('/drugs')
  return drugs.value
}
export async function loadSuppliers(force = false) {
  if (!force && suppliers.value.length) return suppliers.value
  suppliers.value = await api.get<SupplierLite[]>('/suppliers')
  return suppliers.value
}
