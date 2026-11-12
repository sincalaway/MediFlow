<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'
import PayModal, { type PayTarget } from '../../components/PayModal.vue'
import { useAuth } from '../../stores/auth'
import { fmtDate, money, run } from '../../utils'

interface Debt {
  visitId: number
  visitNo: string
  visitDate: string
  patientId: number
  patientName: string
  phone: string | null
  doctor: string | null
  total: number
  paid: number
  owed: number
}
const auth = useAuth()
const router = useRouter()
const keyword = ref('')
const rows = ref<Debt[]>([])
const target = ref<PayTarget | null>(null)
async function load() {
  rows.value = (await run(() => api.get<Debt[]>('/finance/patient-debts', { keyword: keyword.value }))) ?? []
}
onMounted(load)
const sum = computed(() => rows.value.reduce((s, r) => s + r.owed, 0))
const columns: DataTableColumns<Debt> = [
  { title: '患者', key: 'patientName' },
  { title: '电话', key: 'phone' },
  {
    title: '就诊编号',
    key: 'visitNo',
    render: (r) =>
      h(
        'a',
        { class: 'cursor-pointer text-teal-700', onClick: () => router.push(`/clinic/visits/${r.visitId}`) },
        r.visitNo,
      ),
  },
  { title: '就诊日期', key: 'visitDate', render: (r) => fmtDate(r.visitDate) },
  { title: '医生', key: 'doctor' },
  { title: '应收', key: 'total', render: (r) => money(r.total) },
  { title: '已收', key: 'paid', render: (r) => money(r.paid) },
  { title: '欠款', key: 'owed', render: (r) => h('b', { class: 'text-red-600' }, money(r.owed)) },
  ...(auth.can('charge')
    ? [
        {
          title: '操作',
          key: 'op',
          render: (r: Debt) =>
            h(
              'a',
              {
                class: 'cursor-pointer text-teal-700',
                onClick: () =>
                  (target.value = {
                    id: r.visitId,
                    visitNo: r.visitNo,
                    patientName: r.patientName,
                    total: r.total,
                    paid: r.paid,
                    owed: r.owed,
                  }),
              },
              '还款',
            ),
        },
      ]
    : []),
]
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex items-center gap-2">
      <n-input
        v-model:value="keyword"
        placeholder="患者/电话/就诊编号"
        clearable
        class="!w-56"
        @keyup.enter="load"
        @clear="load"
      />
      <n-button @click="load">查询</n-button>
      <div class="ml-4">
        共 {{ rows.length }} 笔，欠款合计 <b class="money text-red-600">{{ money(sum) }}</b>
      </div>
    </div>
    <n-alert type="info" :bordered="false" class="mb-3"
      >欠款 = 就诊明细合计 − 全部收款（含后续还款），由系统实时计算，不可手工修改。</n-alert
    >
    <n-data-table :columns="columns" :data="rows" size="small" :pagination="{ pageSize: 20 }" />
    <PayModal :target="target" @close="target = null" @done="((target = null), load())" />
  </n-card>
</template>
