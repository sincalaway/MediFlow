<script setup lang="ts">
import {
  ageText,
  formatMoney,
  mergeRxLines,
  moneyUpper,
  PAYMENT_KIND_LABELS,
  type ClinicSettings,
} from '@mediflow/shared'
import { computed, nextTick, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { run } from '../../utils'
import PrintToolbar from './PrintToolbar.vue'
import { loadPrintData, recordNo, ymd, type PrintVisit } from './printData'

/** 门诊收费收据：A5 横向（针式/激光）或 80mm 热敏小票 */
const props = defineProps<{ id: string }>()
const route = useRoute()
const visit = ref<PrintVisit | null>(null)
const clinic = ref<ClinicSettings | null>(null)
const SIZE_KEY = 'mediflow_receipt_size'
const size = ref<'a5' | 'roll'>(localStorage.getItem(SIZE_KEY) === 'roll' ? 'roll' : 'a5')
const setSize = (s: 'a5' | 'roll') => {
  size.value = s
  localStorage.setItem(SIZE_KEY, s)
  void nextTick(measure)
}
const printedAt = new Date()

// @page 不能按 class 切换，按纸张动态注入
const pageStyle = document.createElement('style')
document.head.appendChild(pageStyle)
// 热敏小票为连续纸，浏览器不支持 auto 高度，按内容实际高度设定纸长
const receiptEl = ref<HTMLElement | null>(null)
const rollMm = ref(200)
watchEffect(() => {
  pageStyle.textContent = `@page { size: ${size.value === 'a5' ? '210mm 148mm' : `80mm ${rollMm.value}mm`}; margin: 0 }`
})
function measure() {
  if (receiptEl.value) rollMm.value = Math.ceil((receiptEl.value.offsetHeight * 25.4) / 96) + 2
}
window.addEventListener('beforeprint', measure)
onUnmounted(() => window.removeEventListener('beforeprint', measure))
onUnmounted(() => pageStyle.remove())

onMounted(async () => {
  const d = await run(() => loadPrintData(props.id))
  if (!d) return
  visit.value = d.visit
  clinic.value = d.clinic
  await nextTick()
  measure()
  if (route.query.auto === '1' && d.visit.status !== 'CANCELLED') {
    await nextTick()
    setTimeout(() => window.print(), 300)
  }
})

interface Row {
  name: string
  spec: string
  qty: string
  price: number
  amount: number
}
const rows = computed<Row[]>(() => {
  const v = visit.value
  if (!v) return []
  const drugs = mergeRxLines(
    v.items.map((i) => ({
      drugId: i.drugId,
      name: i.drug.name,
      spec: i.drug.spec,
      unit: i.drug.unit,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
  ).map((l) => ({
    name: l.name,
    spec: l.spec ?? '',
    qty: `${l.quantity}${l.unit ?? ''}`,
    price: l.unitPrice,
    amount: l.amount,
  }))
  const others = v.charges.map((c) => ({
    name: c.chargeItem.name,
    spec: '',
    qty: String(c.quantity),
    price: c.unitPrice,
    amount: c.quantity * c.unitPrice,
  }))
  return [...drugs, ...others]
})
const age = computed(() =>
  visit.value ? ageText(visit.value.patient.birthDate, ymd(visit.value.visitDate)) : '',
)
const cashier = computed(() => {
  const p = visit.value?.payments
  return p?.length ? (p[p.length - 1]!.receivedBy ?? '') : ''
})
const money = (c: number) => formatMoney(c)
const dt = (d: Date) =>
  `${ymd(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
</script>

<template>
  <div class="print-root" :class="size">
    <PrintToolbar
      title="收费收据"
      :hint="size === 'a5' ? 'A5 横向（210×148mm），边距选「无」' : '80mm 热敏小票，边距选「无」'"
    >
      <button class="sz" :class="{ on: size === 'a5' }" @click="setSize('a5')">A5</button>
      <button class="sz" :class="{ on: size === 'roll' }" @click="setSize('roll')">80mm 小票</button>
    </PrintToolbar>
    <div v-if="visit?.status === 'CANCELLED'" class="empty">该就诊已作废，不能打印收据。</div>
    <section v-else-if="visit" ref="receiptEl" class="receipt">
      <h1>{{ clinic?.name || '（请填写机构名称）' }}</h1>
      <h2>门诊收费收据</h2>
      <div class="meta">
        <span>NO：{{ visit.visitNo }}</span>
        <span>日期：{{ ymd(visit.visitDate) }}</span>
        <span>门诊号：{{ recordNo(visit.patient.id) }}</span>
      </div>
      <div class="meta">
        <span>姓名：{{ visit.patient.name }}</span>
        <span>性别：{{ visit.patient.gender ?? '' }}</span>
        <span>年龄：{{ age }}</span>
        <span>费别：{{ visit.feeType ?? '自费' }}</span>
        <span v-if="visit.department || clinic?.department"
          >科别：{{ visit.department || clinic?.department }}</span
        >
        <span>医生：{{ visit.doctor?.name ?? '' }}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="l">项目</th>
            <th v-if="size === 'a5'" class="l">规格</th>
            <th>数量</th>
            <th>单价</th>
            <th>金额</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td class="l">{{ r.name }}</td>
            <td v-if="size === 'a5'" class="l">{{ r.spec }}</td>
            <td>{{ r.qty }}</td>
            <td>{{ money(r.price) }}</td>
            <td>{{ money(r.amount) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="sum">
        <div>药品费 {{ money(visit.totals.drugFee) }}　其他费 {{ money(visit.totals.otherFee) }}</div>
        <div class="total">
          合计（大写）：{{ moneyUpper(visit.totals.total) }}　<b>{{ money(visit.totals.total) }}</b>
        </div>
        <div>
          实收 {{ money(visit.totals.paid) }}
          <template v-for="p in visit.payments" :key="p.id"
            >　{{ p.paidAt }} {{ PAYMENT_KIND_LABELS[p.kind] }} {{ p.method }} {{ money(p.amount) }}</template
          >
        </div>
        <div v-if="visit.totals.owed > 0" class="owed">欠款 {{ money(visit.totals.owed) }}</div>
      </div>
      <div class="foot">
        <span>收款人：{{ cashier }}</span>
        <span>打印时间：{{ dt(printedAt) }}</span>
      </div>
      <div v-if="clinic?.address || clinic?.phone" class="addr">
        {{ clinic?.address }} {{ clinic?.phone ? '电话 ' + clinic.phone : '' }}
      </div>
      <div v-if="clinic?.receiptNote" class="addr">{{ clinic.receiptNote }}</div>
    </section>
  </div>
</template>

<style scoped>
.print-root {
  min-height: 100%;
  background: #e5e7eb;
  padding-bottom: 24px;
}
.sz {
  border: 1px solid #fff;
  border-radius: 4px;
  padding: 2px 10px;
  background: transparent;
  color: #fff;
  cursor: pointer;
}
.sz.on {
  background: rgba(255, 255, 255, 0.25);
}
.empty {
  padding: 40px;
  text-align: center;
  color: #666;
}
.receipt {
  margin: 16px auto;
  background: #fff;
  color: #000;
  box-sizing: border-box;
  font-family: SimSun, 'Songti SC', 'Noto Serif CJK SC', serif;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
}
.a5 .receipt {
  width: 210mm;
  min-height: 148mm;
  padding: 8mm 12mm;
  font-size: 10.5pt;
}
.roll .receipt {
  width: 80mm;
  padding: 4mm 3mm;
  font-size: 9pt;
}
h1 {
  margin: 0;
  text-align: center;
  font-size: 1.5em;
}
h2 {
  margin: 1mm 0 2mm;
  text-align: center;
  font-size: 1.25em;
  letter-spacing: 0.3em;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 5mm;
}
.roll .meta {
  gap: 0 3mm;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 2mm 0;
}
th,
td {
  padding: 0.6mm 1mm;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.a5 th,
.a5 td {
  border: 0.5px solid #000;
}
.roll thead th {
  border-bottom: 0.5px dashed #000;
}
.roll tbody tr:last-child td {
  border-bottom: 0.5px dashed #000;
}
th.l,
td.l {
  text-align: left;
}
.total {
  margin: 1mm 0;
}
.total b {
  font-size: 1.15em;
}
.owed {
  font-weight: bold;
}
.foot {
  display: flex;
  justify-content: space-between;
  margin-top: 3mm;
}
.roll .foot {
  flex-direction: column;
}
.addr {
  margin-top: 1mm;
  font-size: 0.85em;
  text-align: center;
}
@media print {
  .print-root {
    background: none;
    padding: 0;
  }
  .receipt {
    margin: 0;
    box-shadow: none;
  }
  .a5 .receipt {
    height: 148mm;
    overflow: hidden;
  }
}
</style>
