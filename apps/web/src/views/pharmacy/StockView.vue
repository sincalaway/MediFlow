<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import { NTag } from 'naive-ui'
import { h, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../../api'
import { useAuth } from '../../stores/auth'
import { money, run } from '../../utils'

interface BatchRow {
  id: number
  batchNo: string
  mfgDate: string | null
  expiryDate: string
  stock: number
  costPrice: number
  state: 'expired' | 'near' | 'valid'
  drug: { code: string; name: string; spec: string | null; unit: string | null; manufacturer: string | null }
  supplier: { name: string } | null
}
interface DrugRow {
  id: number
  code: string
  name: string
  spec: string | null
  unit: string | null
  total: number
  valid: number
  expired: number
  nearExpiry: number
  stockMin: number
  stockMax: number
  batchCount: number
}
const auth = useAuth()
const route = useRoute()
const tab = ref<'batch' | 'drug'>('batch')
const filter = ref<string>((route.query.filter as string) || 'all')
const keyword = ref('')
const batches = ref<BatchRow[]>([])
const drugRows = ref<DrugRow[]>([])
const adjust = ref<{ row: BatchRow; actual: number; remark: string } | null>(null)

async function load() {
  if (tab.value === 'batch')
    batches.value =
      (await run(() =>
        api.get<BatchRow[]>('/stock/batches', { filter: filter.value, keyword: keyword.value }),
      )) ?? []
  else
    drugRows.value = (await run(() => api.get<DrugRow[]>('/stock/drugs', { keyword: keyword.value }))) ?? []
}
onMounted(load)

const stateTag = (s: BatchRow['state']) =>
  h(
    NTag,
    {
      size: 'small',
      bordered: false,
      type: s === 'expired' ? 'error' : s === 'near' ? 'warning' : 'success',
    },
    { default: () => (s === 'expired' ? '已过期' : s === 'near' ? '近效期' : '有效') },
  )

const batchCols: DataTableColumns<BatchRow> = [
  { title: '药品编号', key: 'code', width: 90, render: (r) => r.drug.code },
  { title: '药品名称', key: 'name', width: 160, render: (r) => r.drug.name },
  { title: '规格', key: 'spec', width: 110, render: (r) => r.drug.spec },
  { title: '批号', key: 'batchNo', width: 100 },
  { title: '生产日期', key: 'mfgDate', width: 100 },
  { title: '有效期至', key: 'expiryDate', width: 100 },
  { title: '状态', key: 'state', width: 80, render: (r) => stateTag(r.state) },
  { title: '库存', key: 'stock', width: 80, render: (r) => `${r.stock} ${r.drug.unit ?? ''}` },
  { title: '进价', key: 'costPrice', width: 90, render: (r) => money(r.costPrice) },
  { title: '库存金额', key: 'amount', width: 100, render: (r) => money(r.costPrice * r.stock) },
  {
    title: '供药单位',
    key: 'supplier',
    width: 160,
    ellipsis: { tooltip: true },
    render: (r) => r.supplier?.name ?? '',
  },
  ...(auth.can('pharmacy')
    ? [
        {
          title: '操作',
          key: 'op',
          width: 70,
          render: (r: BatchRow) =>
            h(
              'a',
              {
                class: 'cursor-pointer text-teal-700',
                onClick: () => (adjust.value = { row: r, actual: r.stock, remark: '' }),
              },
              '盘点',
            ),
        },
      ]
    : []),
]
const drugCols: DataTableColumns<DrugRow> = [
  { title: '药品编号', key: 'code' },
  { title: '药品名称', key: 'name' },
  { title: '规格', key: 'spec' },
  { title: '单位', key: 'unit' },
  { title: '总库存', key: 'total' },
  { title: '有效期内', key: 'valid' },
  { title: '近效期(30天)', key: 'nearExpiry' },
  { title: '已过期', key: 'expired' },
  { title: '批次数', key: 'batchCount' },
  { title: '下限/上限', key: 'mm', render: (r) => `${r.stockMin} / ${r.stockMax}` },
]

async function saveAdjust() {
  const a = adjust.value!
  const ok = await run(
    () => api.post('/stock/adjust', { batchId: a.row.id, actualQuantity: a.actual, remark: a.remark }),
    '库存已调整并记入台账',
  )
  if (ok) {
    adjust.value = null
    load()
  }
}
</script>

<template>
  <n-card :bordered="false">
    <n-tabs v-model:value="tab" type="line" @update:value="load">
      <n-tab name="batch">按批次</n-tab>
      <n-tab name="drug">按药品</n-tab>
    </n-tabs>
    <div class="my-3 flex flex-wrap items-center gap-3">
      <n-radio-group v-if="tab === 'batch'" v-model:value="filter" @update:value="load">
        <n-radio-button value="all">全部</n-radio-button>
        <n-radio-button value="valid">有效期内</n-radio-button>
        <n-radio-button value="near">近效期（30 天）</n-radio-button>
        <n-radio-button value="expired">已过期</n-radio-button>
      </n-radio-group>
      <n-input
        v-model:value="keyword"
        placeholder="药品名称/拼音码/批号"
        clearable
        class="!w-56"
        @keyup.enter="load"
        @clear="load"
      />
      <n-button @click="load">查询</n-button>
    </div>
    <n-data-table
      v-if="tab === 'batch'"
      :columns="batchCols"
      :data="batches"
      size="small"
      :pagination="{ pageSize: 30 }"
      :scroll-x="1300"
    />
    <n-data-table v-else :columns="drugCols" :data="drugRows" size="small" :pagination="{ pageSize: 30 }" />
    <n-modal :show="!!adjust" preset="card" title="盘点调整" class="!w-[420px]" @update:show="adjust = null">
      <template v-if="adjust">
        <p>{{ adjust.row.drug.name }} 批号 {{ adjust.row.batchNo }}，账面库存 {{ adjust.row.stock }}</p>
        <n-form-item label="实际数量"
          ><n-input-number v-model:value="adjust.actual" :min="0" :precision="0"
        /></n-form-item>
        <n-form-item label="原因"
          ><n-input v-model:value="adjust.remark" placeholder="如：破损、盘盈"
        /></n-form-item>
      </template>
      <template #footer
        ><div class="flex justify-end">
          <n-button type="primary" @click="saveAdjust">确认调整</n-button>
        </div></template
      >
    </n-modal>
  </n-card>
</template>
