<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import { computed, h, onMounted, ref } from 'vue'
import { api } from '../../api'
import { money, run } from '../../utils'

interface Row {
  supplierId: number
  code: string
  name: string
  contact: string | null
  phone: string | null
  purchases: number
  returns: number
  payments: number
  payable: number
}
const rows = ref<Row[]>([])
onMounted(async () => {
  rows.value = (await run(() => api.get<Row[]>('/finance/payables'))) ?? []
})
const sum = computed(() =>
  rows.value.reduce(
    (s, r) => ({
      purchases: s.purchases + r.purchases,
      returns: s.returns + r.returns,
      payments: s.payments + r.payments,
      payable: s.payable + r.payable,
    }),
    { purchases: 0, returns: 0, payments: 0, payable: 0 },
  ),
)
const columns: DataTableColumns<Row> = [
  { title: '单位编号', key: 'code' },
  { title: '供药单位', key: 'name' },
  { title: '联系人', key: 'contact' },
  { title: '联系电话', key: 'phone' },
  { title: '入库总额', key: 'purchases', render: (r) => money(r.purchases) },
  { title: '退货总额', key: 'returns', render: (r) => money(r.returns) },
  { title: '已付款', key: 'payments', render: (r) => money(r.payments) },
  {
    title: '应付余额',
    key: 'payable',
    render: (r) =>
      h(
        'b',
        { class: r.payable > 0 ? 'text-red-600' : r.payable < 0 ? 'text-blue-600' : '' },
        money(r.payable),
      ),
  },
]
</script>

<template>
  <n-card :bordered="false">
    <n-alert type="info" :bordered="false" class="mb-3"
      >应付余额 = 入库总额 − 退货总额 − 已付款（原系统未扣减退货，欠款被高估）。负数表示预付/多付。</n-alert
    >
    <n-data-table :columns="columns" :data="rows" size="small" />
    <div class="mt-3 text-right">
      合计：入库 {{ money(sum.purchases) }}　退货 {{ money(sum.returns) }}　已付
      {{ money(sum.payments) }}　应付 <b class="text-red-600">{{ money(sum.payable) }}</b>
    </div>
  </n-card>
</template>
