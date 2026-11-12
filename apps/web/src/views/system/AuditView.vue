<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import { fmtDateTime, run } from '../../utils'

interface Row {
  id: number
  at: string
  username: string | null
  method: string
  path: string
  entity: string | null
  entityId: string | null
  statusCode: number
  summary: string | null
  ip: string | null
}
const keyword = ref('')
const rows = ref<Row[]>([])
const page = ref(1)
const total = ref(0)
async function load() {
  const r = await run(() =>
    api.get<{ total: number; rows: Row[] }>('/system/audit-logs', {
      page: page.value,
      pageSize: 50,
      keyword: keyword.value,
    }),
  )
  if (r) {
    rows.value = r.rows
    total.value = r.total
  }
}
onMounted(load)
const METHOD: Record<string, string> = { POST: '新增/操作', PUT: '修改', DELETE: '删除', PATCH: '修改' }
const columns: DataTableColumns<Row> = [
  { title: '时间', key: 'at', width: 150, render: (r) => fmtDateTime(r.at) },
  { title: '用户', key: 'username', width: 100 },
  { title: '动作', key: 'method', width: 90, render: (r) => METHOD[r.method] ?? r.method },
  { title: '接口', key: 'path', width: 220 },
  { title: '对象', key: 'entityId', width: 140 },
  {
    title: '结果',
    key: 'statusCode',
    width: 70,
    render: (r) => (r.statusCode < 400 ? '成功' : `失败 ${r.statusCode}`),
  },
  { title: '内容摘要', key: 'summary', ellipsis: { tooltip: true } },
  { title: 'IP', key: 'ip', width: 120 },
]
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex items-center gap-2">
      <n-input
        v-model:value="keyword"
        placeholder="用户 / 接口 / 对象"
        clearable
        class="!w-56"
        @keyup.enter="((page = 1), load())"
      />
      <n-button @click="((page = 1), load())">查询</n-button>
    </div>
    <n-data-table :columns="columns" :data="rows" size="small" :scroll-x="1100" />
    <div class="mt-3 flex justify-end">
      <n-pagination v-model:page="page" :item-count="total" :page-size="50" @update:page="load" />
    </div>
  </n-card>
</template>
