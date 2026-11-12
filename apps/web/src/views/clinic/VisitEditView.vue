<script setup lang="ts">
import {
  computeVisitTotals,
  FEE_TYPES,
  PAYMENT_KIND_LABELS,
  RX_TYPES,
  type ClinicSettings,
  type FeeType,
  type RxType,
  VISIT_STATUS_LABELS,
  type PaymentKind,
  type VisitStatus,
  type VisitTotals,
} from '@mediflow/shared'
import type { SelectOption } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../api'
import DrugSelect from '../../components/DrugSelect.vue'
import PatientForm, { type Patient } from '../../components/PatientForm.vue'
import PayModal, { type PayTarget } from '../../components/PayModal.vue'
import type { DrugLite } from '../../masterCache'
import { useAuth } from '../../stores/auth'
import { confirm, fmtDateTime, message, money, openPrint, run, toCents, yuan } from '../../utils'

const props = defineProps<{ id?: string }>()
interface VisitDetail {
  id: number
  visitNo: string
  visitDate: string
  status: VisitStatus
  patientId: number
  doctorId: number | null
  chiefComplaint: string | null
  history: string | null
  diagnosis: string | null
  remark: string | null
  feeType: FeeType | null
  department: string | null
  rxType: RxType
  weight: string | null
  agentName: string | null
  agentIdCard: string | null
  patient: Patient
  items: {
    id: number
    drugId: number
    quantity: number
    unitPrice: number
    usage: string | null
    drug: DrugLite
    batch: { batchNo: string; expiryDate: string } | null
  }[]
  charges: {
    id: number
    chargeItemId: number
    quantity: number
    unitPrice: number
    chargeItem: { name: string }
  }[]
  payments: {
    id: number
    kind: PaymentKind
    amount: number
    method: string
    paidAt: string
    receivedBy: string | null
  }[]
  totals: VisitTotals
}
interface RxLine {
  drugId: number | null
  quantity: number
  unitPrice: number
  usage: string
  unit?: string | null
}
interface ChLine {
  chargeItemId: number | null
  quantity: number
  unitPrice: number
}

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const visit = ref<VisitDetail | null>(null)
const patient = ref<Patient | null>(null)
const patientOptions = ref<SelectOption[]>([])
const patientCache = new Map<number, Patient>()
const doctors = ref<SelectOption[]>([])
const chargeItems = ref<{ id: number; name: string; price: number; active: boolean }[]>([])
const stock = ref(new Map<number, number>())
const showPatientForm = ref(false)
const payTarget = ref<PayTarget | null>(null)
const saving = ref(false)
const form = reactive({
  doctorId: null as number | null,
  chiefComplaint: '',
  history: '',
  diagnosis: '',
  remark: '',
  feeType: '自费' as FeeType | null,
  department: '',
  rxType: '普通' as RxType,
  weight: '',
  agentName: '',
  agentIdCard: '',
  rx: [] as RxLine[],
  ch: [] as ChLine[],
})

const isNew = computed(() => !props.id)
const editableRows = computed(() => auth.can('visit') && (isNew.value || visit.value?.status === 'OPEN'))
const editableText = computed(() => auth.can('visit') && visit.value?.status !== 'CANCELLED')

async function searchPatients(k: string) {
  const list = (await run(() => api.get<Patient[]>('/patients', { keyword: k, take: 30 }))) ?? []
  list.forEach((p) => patientCache.set(p.id, p))
  patientOptions.value = list.map((p) => ({
    label: `${p.name}　${p.gender ?? ''}　${p.phone ?? ''}`,
    value: p.id,
  }))
}
function pickPatient(id: number | null) {
  patient.value = id ? (patientCache.get(id) ?? null) : null
}
function onPatientCreated(p: Patient) {
  patientCache.set(p.id, p)
  patientOptions.value = [{ label: `${p.name}　${p.gender ?? ''}　${p.phone ?? ''}`, value: p.id }]
  patient.value = p
  if (!form.history && p.history) form.history = p.history
}

async function load() {
  const [staff, items, stockRows, clinic] = await Promise.all([
    run(() => api.get<{ id: number; name: string; isDoctor: boolean; active: boolean }[]>('/staff')),
    run(() => api.get<typeof chargeItems.value>('/charge-items')),
    auth.can('pharmacy.read')
      ? run(() => api.get<{ id: number; valid: number }[]>('/stock/drugs'))
      : Promise.resolve([]),
    run(() => api.get<ClinicSettings>('/settings/clinic')),
  ])
  doctors.value = (staff ?? [])
    .filter((s) => s.isDoctor && s.active)
    .map((s) => ({ label: s.name, value: s.id }))
  chargeItems.value = items ?? []
  stock.value = new Map((stockRows ?? []).map((s) => [s.id, s.valid]))
  if (props.id) {
    const v = await run(() => api.get<VisitDetail>(`/visits/${props.id}`))
    if (!v) return
    fill(v)
  } else {
    form.department = clinic?.department ?? ''
    form.doctorId =
      auth.me?.staffId && doctors.value.some((d) => d.value === auth.me?.staffId) ? auth.me.staffId : null
    const pid = Number(route.query.patientId)
    if (pid) {
      const p = await run(() => api.get<Patient>(`/patients/${pid}`))
      if (p) onPatientCreated(p)
    }
    if (chargeItems.value[0])
      form.ch.push({
        chargeItemId: chargeItems.value[0].id,
        quantity: 1,
        unitPrice: yuan(chargeItems.value[0].price),
      })
    form.rx.push({ drugId: null, quantity: 1, unitPrice: 0, usage: '' })
  }
}
function fill(v: VisitDetail) {
  visit.value = v
  patientCache.set(v.patient.id, v.patient)
  patientOptions.value = [{ label: v.patient.name, value: v.patient.id }]
  patient.value = v.patient
  Object.assign(form, {
    doctorId: v.doctorId,
    chiefComplaint: v.chiefComplaint ?? '',
    history: v.history ?? '',
    diagnosis: v.diagnosis ?? '',
    remark: v.remark ?? '',
    feeType: v.feeType ?? '自费',
    department: v.department ?? '',
    rxType: v.rxType ?? '普通',
    weight: v.weight ?? '',
    agentName: v.agentName ?? '',
    agentIdCard: v.agentIdCard ?? '',
    rx: v.items.map((i) => ({
      drugId: i.drugId,
      quantity: i.quantity,
      unitPrice: yuan(i.unitPrice),
      usage: i.usage ?? '',
      unit: i.drug.unit,
    })),
    ch: v.charges.map((c) => ({
      chargeItemId: c.chargeItemId,
      quantity: c.quantity,
      unitPrice: yuan(c.unitPrice),
    })),
  })
}
onMounted(load)

function onDrug(l: RxLine, d: DrugLite | null) {
  if (d) {
    l.unitPrice = yuan(d.retailPrice)
    l.unit = d.unit
  }
}
function onCharge(l: ChLine, id: number | null) {
  l.chargeItemId = id
  const c = chargeItems.value.find((x) => x.id === id)
  if (c) l.unitPrice = yuan(c.price)
}
const feeOptions = FEE_TYPES.map((f) => ({ label: f, value: f }))
const rxTypeOptions = RX_TYPES.map((f) => ({ label: f === '普通' ? '普通处方' : `${f}处方`, value: f }))
const chargeOptions = computed(() =>
  chargeItems.value
    .filter((c) => c.active)
    .map((c) => ({ label: `${c.name}（${money(c.price)}）`, value: c.id })),
)

const totals = computed(() =>
  computeVisitTotals(
    form.rx.filter((l) => l.drugId).map((l) => ({ quantity: l.quantity, unitPrice: toCents(l.unitPrice) })),
    form.ch
      .filter((l) => l.chargeItemId)
      .map((l) => ({ quantity: l.quantity, unitPrice: toCents(l.unitPrice) })),
    visit.value?.payments ?? [],
  ),
)

async function save(dispense: boolean) {
  if (!patient.value) return message.error('请选择或新建患者')
  const body = {
    patientId: patient.value.id,
    doctorId: form.doctorId,
    chiefComplaint: form.chiefComplaint,
    history: form.history,
    diagnosis: form.diagnosis,
    remark: form.remark,
    feeType: form.feeType,
    department: form.department,
    rxType: form.rxType,
    weight: form.weight,
    agentName: form.agentName,
    agentIdCard: form.agentIdCard,
    prescription: form.rx
      .filter((l) => l.drugId)
      .map((l) => ({
        drugId: l.drugId,
        quantity: l.quantity,
        unitPrice: toCents(l.unitPrice),
        usage: l.usage,
      })),
    charges: form.ch
      .filter((l) => l.chargeItemId)
      .map((l) => ({ chargeItemId: l.chargeItemId, quantity: l.quantity, unitPrice: toCents(l.unitPrice) })),
    dispense,
  }
  saving.value = true
  const v = await run(
    () =>
      visit.value
        ? api.put<VisitDetail>(`/visits/${visit.value.id}`, body)
        : api.post<VisitDetail>('/visits', body),
    dispense ? '已保存并发药' : '已保存',
  )
  saving.value = false
  if (v) {
    if (isNew.value) router.replace(`/clinic/visits/${v.id}`)
    else fill(v)
  }
}
async function dispense() {
  if (!(await confirm('按「先过期先出」自动选择批次发药，发药后处方不可修改。继续？'))) return
  const v = await run(() => api.post<VisitDetail>(`/visits/${visit.value!.id}/dispense`), '发药完成')
  if (v) fill(v)
}
async function cancelVisit() {
  if (!(await confirm('确定作废该就诊记录？'))) return
  const v = await run(() => api.post<VisitDetail>(`/visits/${visit.value!.id}/cancel`), '已作废')
  if (v) fill(v)
}
function openPay() {
  const v = visit.value!
  payTarget.value = { id: v.id, visitNo: v.visitNo, patientName: v.patient.name, ...v.totals }
}
async function afterPay() {
  payTarget.value = null
  const v = await run(() => api.get<VisitDetail>(`/visits/${visit.value!.id}`))
  if (v) fill(v)
}
</script>

<template>
  <div class="space-y-4">
    <n-card :bordered="false">
      <template #header>
        <div class="flex items-center gap-3">
          <span>{{ visit ? `就诊 ${visit.visitNo}` : '新建就诊' }}</span>
          <n-tag
            v-if="visit"
            size="small"
            :type="visit.status === 'DISPENSED' ? 'success' : visit.status === 'OPEN' ? 'warning' : 'default'"
          >
            {{ VISIT_STATUS_LABELS[visit.status] }}
          </n-tag>
          <span v-if="visit" class="text-sm font-normal text-gray-500">{{
            fmtDateTime(visit.visitDate)
          }}</span>
        </div>
      </template>
      <n-form label-placement="left" label-width="70">
        <n-grid :cols="3" :x-gap="12">
          <n-form-item-gi label="患者" :span="2" required>
            <div class="flex w-full gap-2">
              <n-select
                :value="patient?.id ?? null"
                :options="patientOptions"
                filterable
                remote
                :disabled="!editableRows"
                placeholder="输入姓名/拼音/电话搜索"
                @search="searchPatients"
                @focus="() => !patientOptions.length && searchPatients('')"
                @update:value="pickPatient"
              />
              <n-button v-if="editableRows" @click="showPatientForm = true">新建患者</n-button>
            </div>
          </n-form-item-gi>
          <n-form-item-gi label="医生"
            ><n-select v-model:value="form.doctorId" :options="doctors" clearable :disabled="!editableRows"
          /></n-form-item-gi>
        </n-grid>
        <n-alert
          v-if="patient"
          :type="patient.allergies && patient.allergies !== '无' ? 'error' : 'default'"
          :bordered="false"
          class="mb-4"
        >
          {{ patient.name }} {{ patient.gender ?? '' }}
          {{ patient.birthDate ? '出生 ' + patient.birthDate : '' }} {{ patient.phone ?? '' }} ｜ 过敏史：<b
            >{{ patient.allergies || '未登记' }}</b
          >
          ｜ 既往史：{{ patient.history || '-' }}
        </n-alert>
        <n-grid :cols="2" :x-gap="12">
          <n-form-item-gi label="主诉"
            ><n-input v-model:value="form.chiefComplaint" type="textarea" :rows="2" :disabled="!editableText"
          /></n-form-item-gi>
          <n-form-item-gi label="病史"
            ><n-input v-model:value="form.history" type="textarea" :rows="2" :disabled="!editableText"
          /></n-form-item-gi>
          <n-form-item-gi label="诊断"
            ><n-input v-model:value="form.diagnosis" :disabled="!editableText"
          /></n-form-item-gi>
          <n-form-item-gi label="备注"
            ><n-input v-model:value="form.remark" :disabled="!editableText"
          /></n-form-item-gi>
        </n-grid>
        <n-grid :cols="4" :x-gap="12">
          <n-form-item-gi label="费别"
            ><n-select v-model:value="form.feeType" :options="feeOptions" :disabled="!editableText"
          /></n-form-item-gi>
          <n-form-item-gi label="科别"
            ><n-input v-model:value="form.department" placeholder="如：全科" :disabled="!editableText"
          /></n-form-item-gi>
          <n-form-item-gi label="处方类别"
            ><n-select v-model:value="form.rxType" :options="rxTypeOptions" :disabled="!editableText"
          /></n-form-item-gi>
          <n-form-item-gi label="体重"
            ><n-input
              v-model:value="form.weight"
              placeholder="儿科必要时填写，如 12kg"
              :disabled="!editableText"
          /></n-form-item-gi>
        </n-grid>
        <n-grid v-if="form.rxType === '麻、精一'" :cols="2" :x-gap="12">
          <n-form-item-gi label="代办人"
            ><n-input v-model:value="form.agentName" placeholder="代办人姓名" :disabled="!editableText"
          /></n-form-item-gi>
          <n-form-item-gi label="代办人证件"
            ><n-input v-model:value="form.agentIdCard" placeholder="身份证明编号" :disabled="!editableText"
          /></n-form-item-gi>
        </n-grid>
      </n-form>
    </n-card>

    <n-card title="处方" :bordered="false">
      <n-table size="small" :single-line="false">
        <thead>
          <tr>
            <th class="w-72">药品</th>
            <th v-if="!editableRows">批号 / 效期</th>
            <th v-else>可用库存</th>
            <th class="w-28">数量</th>
            <th class="w-32">单价(元)</th>
            <th>用法用量</th>
            <th>金额</th>
            <th v-if="editableRows" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(l, i) in form.rx" :key="i">
            <td>
              <DrugSelect v-if="editableRows" v-model:value="l.drugId" @select="(d) => onDrug(l, d)" />
              <span v-else>{{ visit?.items[i]?.drug.name }} {{ visit?.items[i]?.drug.spec }}</span>
            </td>
            <td v-if="!editableRows">
              {{ visit?.items[i]?.batch?.batchNo ?? '未发药' }} /
              {{ visit?.items[i]?.batch?.expiryDate ?? '-' }}
            </td>
            <td v-else :class="l.drugId && (stock.get(l.drugId) ?? 0) < l.quantity ? 'text-red-600' : ''">
              {{ l.drugId ? (stock.get(l.drugId) ?? 0) : '' }} {{ l.unit ?? '' }}
            </td>
            <td>
              <n-input-number v-model:value="l.quantity" :min="1" :precision="0" :disabled="!editableRows" />
            </td>
            <td>
              <n-input-number v-model:value="l.unitPrice" :min="0" :precision="2" :disabled="!editableRows" />
            </td>
            <td>
              <n-input
                v-model:value="l.usage"
                :disabled="!editableRows"
                placeholder="如：口服 一日三次 每次1粒"
              />
            </td>
            <td class="money">{{ money(l.quantity * toCents(l.unitPrice)) }}</td>
            <td v-if="editableRows">
              <n-button size="small" quaternary type="error" @click="form.rx.splice(i, 1)">删除</n-button>
            </td>
          </tr>
        </tbody>
      </n-table>
      <n-button
        v-if="editableRows"
        dashed
        block
        class="mt-2"
        @click="form.rx.push({ drugId: null, quantity: 1, unitPrice: 0, usage: '' })"
        >+ 添加药品</n-button
      >
    </n-card>

    <n-card title="其他收费项目" :bordered="false">
      <n-table size="small" :single-line="false">
        <thead>
          <tr>
            <th class="w-72">项目</th>
            <th class="w-28">数量</th>
            <th class="w-32">单价(元)</th>
            <th>金额</th>
            <th v-if="editableRows" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(l, i) in form.ch" :key="i">
            <td>
              <n-select
                :value="l.chargeItemId"
                :options="chargeOptions"
                :disabled="!editableRows"
                @update:value="(v: number | null) => onCharge(l, v)"
              />
            </td>
            <td>
              <n-input-number v-model:value="l.quantity" :min="1" :precision="0" :disabled="!editableRows" />
            </td>
            <td>
              <n-input-number v-model:value="l.unitPrice" :min="0" :precision="2" :disabled="!editableRows" />
            </td>
            <td class="money">{{ money(l.quantity * toCents(l.unitPrice)) }}</td>
            <td v-if="editableRows">
              <n-button size="small" quaternary type="error" @click="form.ch.splice(i, 1)">删除</n-button>
            </td>
          </tr>
        </tbody>
      </n-table>
      <n-button
        v-if="editableRows"
        dashed
        block
        class="mt-2"
        @click="form.ch.push({ chargeItemId: null, quantity: 1, unitPrice: 0 })"
        >+ 添加项目</n-button
      >
    </n-card>

    <n-card :bordered="false">
      <div class="flex flex-wrap items-center gap-6">
        <div>
          药品费 <b class="money">{{ money(totals.drugFee) }}</b>
        </div>
        <div>
          其他费 <b class="money">{{ money(totals.otherFee) }}</b>
        </div>
        <div>
          合计 <b class="money text-lg text-teal-700">{{ money(totals.total) }}</b>
        </div>
        <div>
          已收 <b class="money">{{ money(totals.paid) }}</b>
        </div>
        <div>
          欠款 <b class="money" :class="totals.owed > 0 ? 'text-red-600' : ''">{{ money(totals.owed) }}</b>
        </div>
        <div class="flex-1" />
        <template v-if="auth.can('visit') && (isNew || visit?.status === 'OPEN')">
          <n-button :loading="saving" @click="save(false)">保存</n-button>
          <n-button type="primary" :loading="saving" @click="save(true)">保存并发药</n-button>
        </template>
        <n-button v-if="visit?.status === 'DISPENSED' && auth.can('visit')" @click="save(false)"
          >保存病历修改</n-button
        >
        <n-button
          v-if="visit?.status === 'OPEN' && auth.can('dispense') && !auth.can('visit')"
          type="primary"
          @click="dispense"
          >发药</n-button
        >
        <n-button v-if="visit?.status === 'OPEN' && auth.can('visit')" type="error" ghost @click="cancelVisit"
          >作废</n-button
        >
        <template v-if="visit && visit.status !== 'CANCELLED'">
          <n-button v-if="visit.items.length" @click="openPrint('prescription', visit.id)">打印处方</n-button>
          <n-button @click="openPrint('receipt', visit.id)">打印收据</n-button>
        </template>
        <n-button
          v-if="visit && visit.status !== 'CANCELLED' && visit.totals.owed > 0 && auth.can('charge')"
          type="warning"
          @click="openPay"
          >收费</n-button
        >
      </div>
      <div v-if="visit?.payments.length" class="mt-3 text-sm text-gray-600">
        收款记录：
        <span v-for="p in visit.payments" :key="p.id" class="mr-4"
          >{{ p.paidAt }} {{ PAYMENT_KIND_LABELS[p.kind] }} {{ p.method }} {{ money(p.amount) }}（{{
            p.receivedBy ?? '-'
          }}）</span
        >
      </div>
    </n-card>

    <PatientForm v-model:show="showPatientForm" @saved="onPatientCreated" />
    <PayModal :target="payTarget" @close="payTarget = null" @done="afterPay" />
  </div>
</template>
