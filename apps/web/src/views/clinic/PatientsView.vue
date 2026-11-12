<script setup lang="ts">
import { VISIT_STATUS_LABELS, type VisitStatus } from '@mediflow/shared'
import type { DataTableColumns } from 'naive-ui'
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'
import PatientForm, { type Patient } from '../../components/PatientForm.vue'
import { useAuth } from '../../stores/auth'
import { fmtDateTime, money, run } from '../../utils'

type Row = Patient & { visitCount: number; updatedAt: string }
interface VisitRow {
  id: number
  visitNo: string
  visitDate: string
  status: VisitStatus
  chiefComplaint: string | null
  diagnosis: string | null
  doctor: { name: string } | null
  items: { id: number; quantity: number; drug: { name: string; unit: string | null } }[]
  totals: { total: number; owed: number }
}
const auth = useAuth()
const router = useRouter()
const keyword = ref('')
const rows = ref<Row[]>([])
const showForm = ref(false)
const editing = ref<Patient | null>(null)
const detail = ref<(Patient & { visits: VisitRow[] }) | null>(null)

async function load() {
  rows.value = (await run(() => api.get<Row[]>('/patients', { keyword: keyword.value }))) ?? []
}
onMounted(load)
async function view(p: Row) {
  detail.value = (await run(() => api.get<Patient & { visits: VisitRow[] }>(`/patients/${p.id}`))) ?? null
}
const canEdit = auth.can('patient', 'visit')
const columns: DataTableColumns<Row> = [
  {
    title: '姓名',
    key: 'name',
    render: (r) => h('a', { class: 'cursor-pointer text-teal-700', onClick: () => view(r) }, r.name),
  },
  { title: '性别', key: 'gender', width: 60 },
  { title: '出生日期', key: 'birthDate', width: 110 },
  { title: '联系电话', key: 'phone', width: 130 },
  { title: '过敏史', key: 'allergies', ellipsis: { tooltip: true } },
  { title: '就诊次数', key: 'visitCount', width: 90 },
  { title: '最近更新', key: 'updatedAt', width: 150, render: (r) => fmtDateTime(r.updatedAt) },
  {
    title: '操作',
    key: 'op',
    width: 150,
    render: (r) =>
      h('div', { class: 'flex gap-2' }, [
        h('a', { class: 'cursor-pointer text-teal-700', onClick: () => view(r) }, '病历'),
        canEdit
          ? h(
              'a',
              {
                class: 'cursor-pointer text-teal-700',
                onClick: () => ((editing.value = r), (showForm.value = true)),
              },
              '编辑',
            )
          : null,
        auth.can('visit')
          ? h(
              'a',
              {
                class: 'cursor-pointer text-teal-700',
                onClick: () => router.push({ path: '/clinic/visits/new', query: { patientId: r.id } }),
              },
              '接诊',
            )
          : null,
      ]),
  },
]
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex items-center gap-2">
      <n-input
        v-model:value="keyword"
        placeholder="姓名 / 拼音 / 电话 / 身份证"
        clearable
        class="!w-64"
        @keyup.enter="load"
        @clear="load"
      />
      <n-button @click="load">查询</n-button>
      <div class="flex-1" />
      <n-button v-if="canEdit" type="primary" @click="((editing = null), (showForm = true))"
        >新建患者</n-button
      >
    </div>
    <n-data-table :columns="columns" :data="rows" size="small" :pagination="{ pageSize: 20 }" />
    <PatientForm v-model:show="showForm" :patient="editing" @saved="load" />
    <n-drawer :show="!!detail" :width="720" @update:show="detail = null">
      <n-drawer-content v-if="detail" :title="`${detail.name} 的病历`" closable>
        <n-descriptions :column="2" size="small" bordered label-placement="left" class="mb-4">
          <n-descriptions-item label="性别">{{ detail.gender }}</n-descriptions-item>
          <n-descriptions-item label="出生日期">{{ detail.birthDate }}</n-descriptions-item>
          <n-descriptions-item label="电话">{{ detail.phone }}</n-descriptions-item>
          <n-descriptions-item label="身份证">{{ detail.idCard }}</n-descriptions-item>
          <n-descriptions-item label="过敏史"
            ><span class="text-red-600">{{ detail.allergies }}</span></n-descriptions-item
          >
          <n-descriptions-item label="既往史">{{ detail.history }}</n-descriptions-item>
        </n-descriptions>
        <n-empty v-if="!detail.visits.length" description="暂无就诊记录" />
        <n-timeline>
          <n-timeline-item
            v-for="v in detail.visits"
            :key="v.id"
            :time="fmtDateTime(v.visitDate)"
            :type="v.status === 'CANCELLED' ? 'default' : 'success'"
          >
            <div class="text-sm">
              <router-link :to="`/clinic/visits/${v.id}`" class="font-medium text-teal-700">{{
                v.visitNo
              }}</router-link>
              · {{ VISIT_STATUS_LABELS[v.status] }} · 医生 {{ v.doctor?.name ?? '-' }} · 合计
              {{ money(v.totals.total) }}
              <span v-if="v.totals.owed > 0" class="text-red-600">（欠 {{ money(v.totals.owed) }}）</span>
            </div>
            <div class="text-sm text-gray-600">
              主诉：{{ v.chiefComplaint || '-' }}；诊断：{{ v.diagnosis || '-' }}
            </div>
            <div class="text-xs text-gray-500">
              处方：{{
                v.items.map((i) => `${i.drug.name}×${i.quantity}${i.drug.unit ?? ''}`).join('，') || '无'
              }}
            </div>
          </n-timeline-item>
        </n-timeline>
      </n-drawer-content>
    </n-drawer>
  </n-card>
</template>
