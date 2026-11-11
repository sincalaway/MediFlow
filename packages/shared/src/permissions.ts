import type { Role } from './enums'

/** 功能模块 -> 允许的角色（admin 拥有全部权限）。前端路由与后端 API 共用。 */
export const MODULES = {
  'basic.read': ['doctor', 'pharmacist', 'cashier'],
  'basic.drug': ['pharmacist'],
  'basic.supplier': ['pharmacist'],
  'basic.staff': [],
  'basic.chargeItem': ['cashier'],
  'basic.user': [],
  pharmacy: ['pharmacist'],
  'pharmacy.read': ['pharmacist', 'doctor'],
  patient: ['doctor', 'cashier'],
  visit: ['doctor'],
  'visit.read': ['doctor', 'cashier', 'pharmacist'],
  dispense: ['doctor', 'pharmacist'],
  charge: ['cashier'],
  finance: ['cashier'],
  'finance.supplier': [],
  system: [],
} as const satisfies Record<string, readonly Role[]>

export type ModuleKey = keyof typeof MODULES

export function can(role: Role | undefined | null, mod: ModuleKey): boolean {
  if (!role) return false
  if (role === 'admin') return true
  return (MODULES[mod] as readonly Role[]).includes(role)
}
