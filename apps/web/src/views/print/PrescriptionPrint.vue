<script setup lang="ts">
import {
  ageText,
  FEE_TYPES,
  formatMoney,
  RX_TYPE_STYLE,
  splitPrescription,
  type ClinicSettings,
} from '@mediflow/shared'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { run } from '../../utils'
import PrintToolbar from './PrintToolbar.vue'
import { loadPrintData, recordNo, ymd, ymdCn, type PrintVisit } from './printData'

/**
 * 处方笺，依据《处方管理办法》（卫生部令第53号）附件1「处方标准」：
 * 前记（机构名称、费别、姓名、性别、年龄、门诊病历号、科别、临床诊断、开具日期；
 * 麻、精一另含患者身份证号及代办人信息）、正文（Rp，药品名称、剂型、规格、数量、用法用量）、
 * 后记（医师签名、药品金额、审核/调配/核对/发药药师签名）。
 * 纸色与右上角标注按处方类别；西药/中成药每张 ≤5 种；中药饮片单独开具；空白处划斜线。
 * 第二十八条：计算机开具的处方须打印纸质处方，格式与手写处方一致，经签名或加盖签章后有效。
 */
const props = defineProps<{ id: string }>()
const route = useRoute()
const visit = ref<PrintVisit | null>(null)
const clinic = ref<ClinicSettings | null>(null)

onMounted(async () => {
  const d = await run(() => loadPrintData(props.id))
  if (!d) return
  visit.value = d.visit
  clinic.value = d.clinic
  if (route.query.auto === '1' && sheets.value.length) {
    await nextTick()
    setTimeout(() => window.print(), 300)
  }
})

const style = computed(() => RX_TYPE_STYLE[visit.value?.rxType ?? '普通'])
const sheets = computed(() =>
  splitPrescription(
    (visit.value?.items ?? []).map((i) => ({
      drugId: i.drugId,
      name: i.drug.name,
      category: i.drug.category,
      dosageForm: i.drug.dosageForm,
      spec: i.drug.spec,
      unit: i.drug.unit,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      usage: i.usage,
    })),
  ),
)
const age = computed(() =>
  visit.value ? ageText(visit.value.patient.birthDate, ymd(visit.value.visitDate)) : '',
)
const clinicName = computed(() => clinic.value?.name || '（请在 系统管理 → 机构信息 中填写机构名称）')
const department = computed(() => visit.value?.department || clinic.value?.department || '')
const rxNo = (i: number) =>
  sheets.value.length > 1 ? `${visit.value!.visitNo}-${i + 1}` : visit.value!.visitNo
const money = (c: number) => formatMoney(c)
</script>

<template>
  <div class="print-root">
    <PrintToolbar
      title="处方笺"
      :hint="`A5 纵向，${style.paperName}纸${style.mark ? '，右上角标注「' + style.mark + '」' : ''}；打印对话框中请勾选「背景图形」，边距选「无」`"
    />
    <div v-if="visit && !sheets.length" class="empty">该就诊没有处方药品。</div>
    <div v-if="visit && visit.status === 'CANCELLED'" class="empty">该就诊已作废，不能打印处方。</div>
    <template v-else-if="visit">
      <section v-for="(s, si) in sheets" :key="si" class="sheet" :style="{ background: style.paper }">
        <div v-if="style.mark" class="mark">{{ style.mark }}</div>
        <div class="no">NO: {{ rxNo(si) }}</div>
        <h1 class="title">
          <span class="clinic">{{ clinicName }}</span
          ><span class="kai">处方笺</span>
        </h1>
        <div v-if="sheets.length > 1" class="pageno">第 {{ si + 1 }} 张 / 共 {{ sheets.length }} 张</div>

        <div class="front">
          <div class="row">
            <span class="cell grow"
              >费别：<template v-for="f in FEE_TYPES" :key="f"
                ><span class="opt">{{ (visit.feeType ?? '自费') === f ? '☑' : '☐' }}{{ f }}</span></template
              ></span
            >
            <span class="cell"
              >门诊病历号：<u>{{ recordNo(visit.patient.id) }}</u></span
            >
          </div>
          <div class="row">
            <span class="cell"
              >科别：<u class="w">{{ department }}</u></span
            >
            <span class="cell"
              >开具日期：<u>{{ ymdCn(visit.visitDate) }}</u></span
            >
          </div>
          <div class="row">
            <span class="cell"
              >姓名：<u class="w">{{ visit.patient.name }}</u></span
            >
            <span class="cell"
              >性别：<u class="s">{{ visit.patient.gender ?? '' }}</u></span
            >
            <span class="cell"
              >年龄：<u class="s">{{ age }}</u></span
            >
            <span v-if="visit.weight" class="cell"
              >体重：<u class="s">{{ visit.weight }}</u></span
            >
          </div>
          <div class="row">
            <span class="cell grow"
              >临床诊断：<u class="fill">{{ visit.diagnosis ?? '' }}</u></span
            >
          </div>
          <div class="row">
            <span class="cell grow"
              >住址/电话：<u class="fill"
                >{{ visit.patient.address ?? '' }} {{ visit.patient.phone ?? '' }}</u
              ></span
            >
          </div>
          <div class="row">
            <span class="cell grow"
              >过敏史：<u class="fill">{{ visit.patient.allergies || '无' }}</u></span
            >
          </div>
          <template v-if="visit.rxType === '麻、精一'">
            <div class="row">
              <span class="cell grow"
                >患者身份证明编号：<u class="fill">{{ visit.patient.idCard ?? '' }}</u></span
              >
            </div>
            <div class="row">
              <span class="cell"
                >代办人姓名：<u class="w">{{ visit.agentName ?? '' }}</u></span
              >
              <span class="cell grow"
                >身份证明编号：<u class="fill">{{ visit.agentIdCard ?? '' }}</u></span
              >
            </div>
          </template>
        </div>

        <div class="body">
          <div class="rp">Rp</div>
          <ol v-if="s.kind === 'western'" class="lines">
            <li v-for="(l, li) in s.lines" :key="li">
              <div class="drug">
                <span class="name">{{ l.name }}</span>
                <span v-if="l.dosageForm" class="meta">{{ l.dosageForm }}</span>
                <span v-if="l.spec" class="meta">{{ l.spec }}</span>
                <span class="qty">×{{ l.quantity }}{{ l.unit ?? '' }}</span>
              </div>
              <div class="usage">用法用量：{{ l.usage ?? '' }}</div>
            </li>
          </ol>
          <div v-else class="herbal">
            <span v-for="(l, li) in s.lines" :key="li" class="herb"
              >{{ l.name }} {{ l.quantity }}{{ l.unit ?? 'g'
              }}<small v-if="l.usage">（{{ l.usage }}）</small></span
            >
          </div>
          <svg class="slash" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
            <line
              x1="8"
              y1="4"
              x2="92"
              y2="96"
              stroke="#000"
              stroke-width="0.6"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div class="back">
          <div class="row">
            <span class="cell"
              >医师：<u class="w">{{ visit.doctor?.name ?? '' }}</u></span
            >
            <span class="cell">签名/签章：<u class="w"></u></span>
            <span class="cell"
              >药品金额：<u class="w">{{ money(s.amount) }}</u></span
            >
          </div>
          <div class="row">
            <span class="cell">审核药师：<u class="s"></u></span>
            <span class="cell">调配药师/士：<u class="s"></u></span>
          </div>
          <div class="row">
            <span class="cell">核对药师：<u class="s"></u></span>
            <span class="cell">发药药师：<u class="s"></u></span>
          </div>
          <div class="note">
            注：处方开具当日有效；电脑打印处方经医师签名或加盖专用签章后有效。{{
              visit.rxType === '急诊' ? '急诊处方一般不得超过 3 日用量。' : '处方一般不得超过 7 日用量。'
            }}
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.print-root {
  min-height: 100%;
  background: #e5e7eb;
  padding-bottom: 24px;
}
.empty {
  padding: 40px;
  text-align: center;
  color: #666;
}
.sheet {
  position: relative;
  width: 148mm;
  height: 210mm;
  margin: 16px auto;
  padding: 8mm 9mm 7mm;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  color: #000;
  font-family: SimSun, 'Songti SC', 'Noto Serif CJK SC', serif;
  font-size: 10.5pt; /* 五号 */
  line-height: 1.55;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  overflow: hidden;
}
.mark {
  position: absolute;
  top: 6mm;
  right: 8mm;
  border: 1.5px solid #000;
  padding: 0 6px;
  font-family: SimHei, 'Heiti SC', 'Noto Sans CJK SC', sans-serif;
  font-size: 16pt; /* 三号 */
  font-weight: bold;
  line-height: 1.4;
}
.no {
  font-size: 9pt;
}
.title {
  margin: 2mm 0 1mm;
  text-align: center;
  font-weight: normal;
  font-size: 22pt; /* 二号 */
  line-height: 1.3;
}
.title .clinic {
  font-size: 15pt;
  margin-right: 4px;
}
.kai {
  font-family: KaiTi, STKaiti, 'Kaiti SC', 'AR PL UKai CN', serif;
}
.pageno {
  text-align: center;
  font-size: 9pt;
}
.front {
  border-bottom: 1.5px solid #000;
  padding-bottom: 1.5mm;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0 4mm;
}
.cell {
  white-space: nowrap;
}
.cell.grow {
  flex: 1;
  display: flex;
  min-width: 0;
}
u {
  display: inline-block;
  min-width: 8mm;
  text-decoration: none;
  border-bottom: 0.5px solid #000;
  padding: 0 2px;
  line-height: 1.3;
}
u.w {
  min-width: 22mm;
}
u.s {
  min-width: 12mm;
}
u.fill {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.opt {
  margin-right: 2.5mm;
}
.body {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding-top: 1mm;
  min-height: 0;
}
.rp {
  font-family: 'Times New Roman', Times, serif;
  font-size: 22pt;
  font-weight: bold;
  line-height: 1.1;
}
.lines {
  margin: 1mm 0 0 6mm;
  padding: 0 0 0 4mm;
}
.lines li {
  margin-bottom: 2mm;
}
.drug {
  display: flex;
  gap: 3mm;
  align-items: baseline;
}
.drug .name {
  font-weight: bold;
}
.drug .qty {
  margin-left: auto;
}
.usage {
  padding-left: 4mm;
  font-size: 10pt;
}
.herbal {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5mm 2mm;
  margin: 1mm 0 0 8mm;
}
.herb small {
  font-size: 8pt;
}
.slash {
  flex: 1;
  width: 100%;
  min-height: 8mm;
}
.back {
  border-top: 1.5px solid #000;
  padding-top: 1.5mm;
}
.note {
  margin-top: 1mm;
  font-size: 8pt;
}
@media print {
  @page {
    size: 148mm 210mm;
    margin: 0;
  }
  .print-root {
    background: none;
    padding: 0;
  }
  .sheet {
    margin: 0;
    box-shadow: none;
    page-break-after: always;
    break-after: page;
  }
  .sheet:last-child {
    page-break-after: auto;
    break-after: auto;
  }
}
</style>
