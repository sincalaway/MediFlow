<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import { h, onMounted, ref } from 'vue'
import { api } from '../../api'
import DateRange from '../../components/DateRange.vue'
import { useAuth } from '../../stores/auth'
import { money, monthStart, run, today } from '../../utils'

interface Row {
  id: number
  orderNo: string
  orderDate: string
  supplier: { name: string }
  handler: string | null
  lineCount: number
  total: number
  paidNow: number
}
interface Detail {
  orderNo: string
  orderDate: string
  supplier: { name: string }
  handler: string | null
  remark: string | null
  total: number
  lines: {
    id: number
    quantity: number
    costPrice: number
    drug: { name: string; spec: string | null; unit: string | null }
    batch: { batchNo: string; mfgDate: string | null; expiryDate: string }
  }[]
}
const auth = useAuth()
const from = ref(monthStart())
const to = ref(today())
const rows = ref<Row[]>([])
const detail = ref<Detail | null>(null)

async function load() {
  rows.value = (await run(() => api.get<Row[]>('/purchase-orders', { from: from.value, to: to.value }))) ?? []
}
onMounted(load)
async function view(r: Row) {
  detail.value = (await run(() => api.get<Detail>(`/purchase-orders/${r.id}`))) ?? null
}

const columns: DataTableColumns<Row> = [
  {
    title: '入库编号',
    key: 'orderNo',
    render: (r) => h('a', { class: 'cursor-pointer text-teal-700', onClick: () => view(r) }, r.orderNo),
  },
  { title: '入库日期', key: 'orderDate' },
  { title: '供药单位', key: 'supplier', render: (r) => r.supplier.name },
  { title: '品种数', key: 'lineCount' },
  { title: '总金额', key: 'total', render: (r) => money(r.total) },
  { title: '当场付款', key: 'paidNow', render: (r) => money(r.paidNow) },
  { title: '经办人', key: 'handler' },
]
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <DateRange v-model:from="from" v-model:to="to" />
      <n-button @click="load">查询</n-button>
      <div class="flex-1" />
      <n-button v-if="auth.can('pharmacy')" type="primary" @click="$router.push('/pharmacy/purchase/new')"
        >新建入库单</n-button
      >
    </div>
    <n-data-table :columns="columns" :data="rows" size="small" :pagination="{ pageSize: 20 }" />
    <n-modal
      :show="!!detail"
      preset="card"
      :title="`入库单 ${detail?.orderNo}`"
      class="!w-[860px]"
      @update:show="detail = null"
    >
      <template v-if="detail">
        <div class="mb-2 text-sm text-gray-600">
          {{ detail.orderDate }} · {{ detail.supplier.name }} · 经办人 {{ detail.handler || '-' }} · 合计
          <b>{{ money(detail.total) }}</b>
        </div>
        <n-table size="small" :single-line="false">
          <thead>
            <tr>
              <th>药品</th>
              <th>规格</th>
              <th>批号</th>
              <th>生产日期</th>
              <th>有效期至</th>
              <th>数量</th>
              <th>进价</th>
              <th>金额</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in detail.lines" :key="l.id">
              <td>{{ l.drug.name }}</td>
              <td>{{ l.drug.spec }}</td>
              <td>{{ l.batch.batchNo }}</td>
              <td>{{ l.batch.mfgDate }}</td>
              <td>{{ l.batch.expiryDate }}</td>
              <td>{{ l.quantity }} {{ l.drug.unit }}</td>
              <td>{{ money(l.costPrice) }}</td>
              <td>{{ money(l.quantity * l.costPrice) }}</td>
            </tr>
          </tbody>
        </n-table>
      </template>
    </n-modal>
  </n-card>
</template>
