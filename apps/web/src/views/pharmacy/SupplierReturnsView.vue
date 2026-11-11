<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import { h, onMounted, ref } from 'vue'
import { api } from '../../api'
import DateRange from '../../components/DateRange.vue'
import { useAuth } from '../../stores/auth'
import { money, run, today } from '../../utils'

interface Row {
  id: number
  returnNo: string
  returnDate: string
  supplier: { name: string }
  handler: string | null
  lineCount: number
  total: number
}
interface Detail {
  returnNo: string
  returnDate: string
  supplier: { name: string }
  handler: string | null
  total: number
  lines: {
    id: number
    quantity: number
    unitPrice: number
    batch: {
      batchNo: string
      expiryDate: string
      drug: { name: string; spec: string | null; unit: string | null }
    }
  }[]
}
const auth = useAuth()
const from = ref('2000-01-01')
const to = ref(today())
const rows = ref<Row[]>([])
const detail = ref<Detail | null>(null)
async function load() {
  rows.value =
    (await run(() => api.get<Row[]>('/supplier-returns', { from: from.value, to: to.value }))) ?? []
}
onMounted(load)
async function view(r: Row) {
  detail.value = (await run(() => api.get<Detail>(`/supplier-returns/${r.id}`))) ?? null
}
const columns: DataTableColumns<Row> = [
  {
    title: '退货编号',
    key: 'returnNo',
    render: (r) => h('a', { class: 'cursor-pointer text-teal-700', onClick: () => view(r) }, r.returnNo),
  },
  { title: '退货日期', key: 'returnDate' },
  { title: '供药单位', key: 'supplier', render: (r) => r.supplier.name },
  { title: '品种数', key: 'lineCount' },
  { title: '退货总额', key: 'total', render: (r) => money(r.total) },
  { title: '经办人', key: 'handler' },
]
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <DateRange v-model:from="from" v-model:to="to" />
      <n-button @click="load">查询</n-button>
      <div class="flex-1" />
      <n-button v-if="auth.can('pharmacy')" type="primary" @click="$router.push('/pharmacy/returns/new')"
        >新建退货单</n-button
      >
    </div>
    <n-data-table :columns="columns" :data="rows" size="small" :pagination="{ pageSize: 20 }" />
    <n-modal
      :show="!!detail"
      preset="card"
      :title="`退货单 ${detail?.returnNo}`"
      class="!w-[760px]"
      @update:show="detail = null"
    >
      <template v-if="detail">
        <div class="mb-2 text-sm text-gray-600">
          {{ detail.returnDate }} · {{ detail.supplier.name }} · 合计 <b>{{ money(detail.total) }}</b>
        </div>
        <n-table size="small" :single-line="false">
          <thead>
            <tr>
              <th>药品</th>
              <th>规格</th>
              <th>批号</th>
              <th>有效期至</th>
              <th>数量</th>
              <th>单价</th>
              <th>金额</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in detail.lines" :key="l.id">
              <td>{{ l.batch.drug.name }}</td>
              <td>{{ l.batch.drug.spec }}</td>
              <td>{{ l.batch.batchNo }}</td>
              <td>{{ l.batch.expiryDate }}</td>
              <td>{{ l.quantity }} {{ l.batch.drug.unit }}</td>
              <td>{{ money(l.unitPrice) }}</td>
              <td>{{ money(l.quantity * l.unitPrice) }}</td>
            </tr>
          </tbody>
        </n-table>
      </template>
    </n-modal>
  </n-card>
</template>
