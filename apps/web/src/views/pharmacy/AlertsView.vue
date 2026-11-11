<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import { run } from '../../utils'

const props = defineProps<{ mode: 'shortage' | 'overstock' }>()
interface Row {
  id: number
  code: string
  name: string
  spec: string | null
  unit: string | null
  manufacturer: string | null
  total: number
  valid: number
  stockMin: number
  stockMax: number
}
const rows = ref<Row[]>([])
onMounted(async () => {
  rows.value = (await run(() => api.get<Row[]>(`/stock/${props.mode}`))) ?? []
})
const columns = computed<DataTableColumns<Row>>(() => [
  { title: '药品编号', key: 'code' },
  { title: '药品名称', key: 'name' },
  { title: '规格', key: 'spec' },
  { title: '生产厂家', key: 'manufacturer' },
  { title: '有效库存', key: 'valid' },
  { title: '总库存', key: 'total' },
  props.mode === 'shortage' ? { title: '库存下限', key: 'stockMin' } : { title: '库存上限', key: 'stockMax' },
  props.mode === 'shortage'
    ? { title: '建议补货', key: 'need', render: (r: Row) => `${r.stockMin - r.valid} ${r.unit ?? ''}` }
    : { title: '超出数量', key: 'over', render: (r: Row) => `${r.total - r.stockMax} ${r.unit ?? ''}` },
])
</script>

<template>
  <n-card :bordered="false">
    <n-alert :type="mode === 'shortage' ? 'warning' : 'info'" :bordered="false" class="mb-3">
      {{
        mode === 'shortage'
          ? '有效期内库存低于「库存下限」的药品（已过期库存不计入）。'
          : '总库存高于「库存上限」的药品。'
      }}
    </n-alert>
    <n-data-table :columns="columns" :data="rows" size="small" />
  </n-card>
</template>
