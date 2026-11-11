<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import DateRange from '../../components/DateRange.vue'
import { money, monthStart, run, today } from '../../utils'

const props = defineProps<{ mode: 'purchases' | 'returns' }>()
interface Detail {
  docNo: string
  date: string
  supplier: string
  drugName: string
  spec: string | null
  unit: string | null
  batchNo: string
  expiryDate: string
  quantity: number
  unitPrice: number
  amount: number
}
interface ByDrug {
  drugId: number
  code: string
  name: string
  spec: string | null
  unit: string | null
  quantity: number
  amount: number
}
const from = ref(monthStart())
const to = ref(today())
const data = ref<{ details: Detail[]; byDrug: ByDrug[]; totalAmount: number }>({
  details: [],
  byDrug: [],
  totalAmount: 0,
})
async function load() {
  data.value =
    (await run(() =>
      api.get<typeof data.value>(`/stats/${props.mode}`, { from: from.value, to: to.value }),
    )) ?? data.value
}
onMounted(load)
const word = props.mode === 'purchases' ? '入库' : '退货'
const byDrugCols: DataTableColumns<ByDrug> = [
  { title: '药品编号', key: 'code' },
  { title: '药品名称', key: 'name' },
  { title: '规格', key: 'spec' },
  { title: `${word}数量`, key: 'quantity', render: (r) => `${r.quantity} ${r.unit ?? ''}` },
  { title: `${word}金额`, key: 'amount', render: (r) => money(r.amount) },
]
const detailCols: DataTableColumns<Detail> = [
  { title: '单号', key: 'docNo' },
  { title: '日期', key: 'date' },
  { title: '供药单位', key: 'supplier' },
  { title: '药品', key: 'drugName' },
  { title: '规格', key: 'spec' },
  { title: '批号', key: 'batchNo' },
  { title: '有效期至', key: 'expiryDate' },
  { title: '数量', key: 'quantity' },
  { title: '单价', key: 'unitPrice', render: (r) => money(r.unitPrice) },
  { title: '金额', key: 'amount', render: (r) => money(r.amount) },
]
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex items-center gap-2">
      <DateRange v-model:from="from" v-model:to="to" />
      <n-button @click="load">统计</n-button>
      <div class="ml-4">
        期间{{ word }}总额：<b class="money">{{ money(data.totalAmount) }}</b>
      </div>
    </div>
    <n-h4>按药品汇总</n-h4>
    <n-data-table :columns="byDrugCols" :data="data.byDrug" size="small" />
    <n-h4 class="mt-4">明细</n-h4>
    <n-data-table :columns="detailCols" :data="data.details" size="small" :pagination="{ pageSize: 20 }" />
  </n-card>
</template>
