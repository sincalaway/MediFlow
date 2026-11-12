import type { ModuleKey } from '@mediflow/shared'
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from './stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    group?: string
    modules?: ModuleKey[]
    public?: boolean
    hidden?: boolean
  }
}

export const menuGroups = ['基础信息', '药房管理', '门诊业务', '财务管理', '系统管理'] as const

const r = (
  path: string,
  title: string,
  group: string | undefined,
  modules: ModuleKey[],
  component: RouteRecordRaw['component'],
  extra: Partial<RouteRecordRaw> = {},
) =>
  ({
    path,
    name: path.replace(/^\//, '').replace(/[/:]/g, '-') || 'home',
    component,
    meta: { title, group, modules },
    ...extra,
  }) as RouteRecordRaw

export const appRoutes: RouteRecordRaw[] = [
  r('/', '工作台', undefined, [], () => import('./views/DashboardView.vue')),
  // 基础信息
  r(
    '/basic/drugs',
    '药品信息',
    '基础信息',
    ['basic.read', 'basic.drug'],
    () => import('./views/basic/DrugsView.vue'),
  ),
  r(
    '/basic/suppliers',
    '供药单位',
    '基础信息',
    ['basic.read', 'basic.supplier'],
    () => import('./views/basic/SuppliersView.vue'),
  ),
  r(
    '/basic/staff',
    '人员信息',
    '基础信息',
    ['basic.read', 'basic.staff'],
    () => import('./views/basic/StaffView.vue'),
  ),
  r(
    '/basic/charge-items',
    '收费项目',
    '基础信息',
    ['basic.read', 'basic.chargeItem'],
    () => import('./views/basic/ChargeItemsView.vue'),
  ),
  r('/basic/users', '用户与权限', '基础信息', ['basic.user'], () => import('./views/basic/UsersView.vue')),
  // 药房
  r(
    '/pharmacy/purchase',
    '药品入库',
    '药房管理',
    ['pharmacy.read'],
    () => import('./views/pharmacy/PurchaseOrdersView.vue'),
  ),
  r(
    '/pharmacy/purchase/new',
    '新建入库单',
    undefined,
    ['pharmacy'],
    () => import('./views/pharmacy/PurchaseOrderNewView.vue'),
  ),
  r(
    '/pharmacy/returns',
    '药品退货',
    '药房管理',
    ['pharmacy.read'],
    () => import('./views/pharmacy/SupplierReturnsView.vue'),
  ),
  r(
    '/pharmacy/returns/new',
    '新建退货单',
    undefined,
    ['pharmacy'],
    () => import('./views/pharmacy/SupplierReturnNewView.vue'),
  ),
  r(
    '/pharmacy/stock',
    '药品库存',
    '药房管理',
    ['pharmacy.read'],
    () => import('./views/pharmacy/StockView.vue'),
  ),
  r(
    '/pharmacy/shortage',
    '缺货提醒',
    '药房管理',
    ['pharmacy.read'],
    () => import('./views/pharmacy/AlertsView.vue'),
    { props: { mode: 'shortage' } },
  ),
  r(
    '/pharmacy/overstock',
    '超储提醒',
    '药房管理',
    ['pharmacy.read'],
    () => import('./views/pharmacy/AlertsView.vue'),
    { props: { mode: 'overstock' } },
  ),
  r(
    '/pharmacy/purchase-stats',
    '期间入库统计',
    '药房管理',
    ['pharmacy.read'],
    () => import('./views/pharmacy/PeriodStatsView.vue'),
    { props: { mode: 'purchases' } },
  ),
  r(
    '/pharmacy/return-stats',
    '期间退货统计',
    '药房管理',
    ['pharmacy.read'],
    () => import('./views/pharmacy/PeriodStatsView.vue'),
    { props: { mode: 'returns' } },
  ),
  // 门诊
  r(
    '/clinic/patients',
    '患者档案',
    '门诊业务',
    ['patient', 'visit.read'],
    () => import('./views/clinic/PatientsView.vue'),
  ),
  r('/clinic/visits', '就诊登记', '门诊业务', ['visit.read'], () => import('./views/clinic/VisitsView.vue')),
  r('/clinic/visits/new', '新建就诊', undefined, ['visit'], () => import('./views/clinic/VisitEditView.vue')),
  r(
    '/clinic/visits/:id',
    '就诊详情',
    undefined,
    ['visit.read', 'charge'],
    () => import('./views/clinic/VisitEditView.vue'),
    { props: true },
  ),
  r('/clinic/charge', '收费登记', '门诊业务', ['charge'], () => import('./views/clinic/ChargeView.vue')),
  r(
    '/clinic/debts',
    '患者欠款',
    '门诊业务',
    ['charge', 'patient'],
    () => import('./views/clinic/DebtsView.vue'),
  ),
  // 财务
  r(
    '/finance/supplier-payments',
    '付供药单位货款',
    '财务管理',
    ['finance', 'pharmacy'],
    () => import('./views/finance/SupplierPaymentsView.vue'),
  ),
  r(
    '/finance/payables',
    '应付账款统计',
    '财务管理',
    ['finance', 'pharmacy'],
    () => import('./views/finance/PayablesView.vue'),
  ),
  r('/finance/income', '收入报表', '财务管理', ['finance'], () => import('./views/finance/IncomeView.vue')),
  // 系统
  r(
    '/system/clinic',
    '机构信息',
    '系统管理',
    ['system'],
    () => import('./views/system/ClinicSettingsView.vue'),
  ),
  r('/system/audit', '审计日志', '系统管理', ['system'], () => import('./views/system/AuditView.vue')),
  r('/system/backup', '备份与恢复', '系统管理', ['system'], () => import('./views/system/BackupView.vue')),
  r('/system/excel', 'Excel 导入导出', '系统管理', ['system'], () => import('./views/system/ExcelView.vue')),
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/change-password',
      name: 'change-password',
      component: () => import('./views/ChangePasswordView.vue'),
      meta: { title: '修改密码' },
    },
    {
      path: '/print/prescription/:id',
      name: 'print-prescription',
      component: () => import('./views/print/PrescriptionPrint.vue'),
      props: true,
      meta: { title: '打印处方', modules: ['visit.read', 'charge'] },
    },
    {
      path: '/print/receipt/:id',
      name: 'print-receipt',
      component: () => import('./views/print/ReceiptPrint.vue'),
      props: true,
      meta: { title: '打印收据', modules: ['visit.read', 'charge'] },
    },
    { path: '/', component: () => import('./layouts/MainLayout.vue'), children: appRoutes },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  if (!auth.loaded) await auth.load()
  if (to.meta.public) return true
  if (!auth.me) return { name: 'login', query: { redirect: to.fullPath } }
  if (auth.me.mustChangePassword && to.name !== 'change-password') return { name: 'change-password' }
  const mods = to.meta.modules
  if (mods && mods.length && !auth.can(...mods)) return { path: '/' }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - MediFlow` : 'MediFlow 诊所管理系统'
})
