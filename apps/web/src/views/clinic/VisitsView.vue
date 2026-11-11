<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { VISIT_STATUS_LABELS } from '@mediflow/shared'
import type { DataTableColumns } from 'naive-ui'
import { NTag } from 'naive-ui'
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'
import DateRange from '../../components/DateRange.vue'
import { useAuth } from '../../stores/auth'
import type { VisitListRow } from '../../types'
import { fmtDateTime, money, run, today } from '../../utils'

const auth = useAuth()
const router = useRouter()
const from = ref(today())
const to = ref(today())
const keyword = ref('')
const status = ref<string | null>(null)
const rows = ref<VisitListRow[]>([])
async function load() {
  rows.value =
    (await run(() =>
      api.get<VisitListRow[]>('/visits', {
        from: from.value,
        to: to.value,
        keyword: keyword.value,
        status: status.value,
      }),
    )) ?? []
}
onMounted(load)
const statusOptions = Object.entries(VISIT_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const columns: DataTableColumns<VisitListRow> = [
  {
    title: '就诊编号',
    key: 'visitNo',
    render: (r) =>
      h(
        'a',
        { class: 'cursor-pointer text-teal-700', onClick: () => router.push(`/clinic/visits/${r.id}`) },
        r.visitNo,
      ),
  },
  { title: '就诊时间', key: 'visitDate', render: (r) => fmtDateTime(r.visitDate) },
  { title: '患者', key: 'patient', render: (r) => r.patient.name },
  { title: '医生', key: 'doctor', render: (r) => r.doctor?.name ?? '' },
  { title: '诊断', key: 'diagnosis', ellipsis: { tooltip: true } },
  {
    title: '状态',
    key: 'status',
    render: (r) =>
      h(
        NTag,
        {
          size: 'small',
          bordered: false,
          type: r.status === 'DISPENSED' ? 'success' : r.status === 'OPEN' ? 'warning' : 'default',
        },
        { default: () => VISIT_STATUS_LABELS[r.status] },
      ),
  },
  { title: '药品费', key: 'drugFee', render: (r) => money(r.totals.drugFee) },
  { title: '其他费', key: 'otherFee', render: (r) => money(r.totals.otherFee) },
  { title: '合计', key: 'total', render: (r) => money(r.totals.total) },
  { title: '已收', key: 'paid', render: (r) => money(r.totals.paid) },
  {
    title: '欠款',
    key: 'owed',
    render: (r) => h('span', { class: r.totals.owed > 0 ? 'text-red-600' : '' }, money(r.totals.owed)),
  },
]
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <DateRange v-model:from="from" v-model:to="to" />
      <n-select v-model:value="status" :options="statusOptions" clearable placeholder="状态" class="!w-28" />
      <n-input
        v-model:value="keyword"
        placeholder="患者/电话/编号/诊断"
        clearable
        class="!w-52"
        @keyup.enter="load"
      />
      <n-button @click="load">查询</n-button>
      <div class="flex-1" />
      <n-button v-if="auth.can('visit')" type="primary" @click="router.push('/clinic/visits/new')"
        >新建就诊</n-button
      >
    </div>
    <n-data-table
      :columns="columns"
      :data="rows"
      size="small"
      :pagination="{ pageSize: 20 }"
      :scroll-x="1100"
    />
  </n-card>
</template>
