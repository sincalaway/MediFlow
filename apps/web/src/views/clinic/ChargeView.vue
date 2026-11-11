<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { PAYMENT_KIND_LABELS, type PaymentKind } from '@mediflow/shared'
import type { DataTableColumns } from 'naive-ui'
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'
import DateRange from '../../components/DateRange.vue'
import PayModal, { type PayTarget } from '../../components/PayModal.vue'
import { fmtDateTime, money, run, today } from '../../utils'
import type { VisitListRow } from '../../types'

const router = useRouter()
const from = ref(today())
const to = ref(today())
const onlyOwed = ref(true)
const keyword = ref('')
const rows = ref<VisitListRow[]>([])
const payments = ref<
  {
    id: number
    kind: PaymentKind
    amount: number
    method: string
    paidAt: string
    receivedBy: string | null
    patient: { name: string } | null
    visit: { visitNo: string } | null
  }[]
>([])
const target = ref<PayTarget | null>(null)

async function load() {
  rows.value =
    (await run(() =>
      api.get<VisitListRow[]>('/visits', {
        from: from.value,
        to: to.value,
        keyword: keyword.value,
        owed: onlyOwed.value ? 1 : undefined,
      }),
    )) ?? []
  rows.value = rows.value.filter((r) => r.status !== 'CANCELLED')
  payments.value =
    (await run(() =>
      api.get<typeof payments.value>('/finance/patient-payments', { from: from.value, to: to.value }),
    )) ?? []
}
onMounted(load)
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
  { title: '药品费', key: 'drugFee', render: (r) => money(r.totals.drugFee) },
  { title: '其他费', key: 'otherFee', render: (r) => money(r.totals.otherFee) },
  { title: '合计', key: 'total', render: (r) => money(r.totals.total) },
  { title: '已收', key: 'paid', render: (r) => money(r.totals.paid) },
  {
    title: '欠款',
    key: 'owed',
    render: (r) => h('b', { class: r.totals.owed > 0 ? 'text-red-600' : '' }, money(r.totals.owed)),
  },
  {
    title: '操作',
    key: 'op',
    render: (r) =>
      r.totals.owed > 0
        ? h(
            'a',
            {
              class: 'cursor-pointer text-teal-700',
              onClick: () =>
                (target.value = { id: r.id, visitNo: r.visitNo, patientName: r.patient.name, ...r.totals }),
            },
            '收费',
          )
        : '已结清',
  },
]
</script>

<template>
  <div class="space-y-4">
    <n-card :bordered="false">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <DateRange v-model:from="from" v-model:to="to" />
        <n-input
          v-model:value="keyword"
          placeholder="患者/电话/就诊编号"
          clearable
          class="!w-48"
          @keyup.enter="load"
        />
        <n-checkbox v-model:checked="onlyOwed">只看未结清</n-checkbox>
        <n-button @click="load">查询</n-button>
      </div>
      <n-data-table :columns="columns" :data="rows" size="small" :pagination="{ pageSize: 20 }" />
    </n-card>
    <n-card title="期间收款记录" :bordered="false">
      <n-table size="small">
        <thead>
          <tr>
            <th>日期</th>
            <th>类型</th>
            <th>就诊编号</th>
            <th>患者</th>
            <th>方式</th>
            <th>金额</th>
            <th>收款人</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in payments" :key="p.id">
            <td>{{ p.paidAt }}</td>
            <td>{{ PAYMENT_KIND_LABELS[p.kind] }}</td>
            <td>{{ p.visit?.visitNo }}</td>
            <td>{{ p.patient?.name }}</td>
            <td>{{ p.method }}</td>
            <td class="money">{{ money(p.amount) }}</td>
            <td>{{ p.receivedBy }}</td>
          </tr>
        </tbody>
      </n-table>
    </n-card>
    <PayModal :target="target" @close="target = null" @done="((target = null), load())" />
  </div>
</template>
