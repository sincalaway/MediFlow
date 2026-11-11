<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import DateRange from '../../components/DateRange.vue'
import { money, monthStart, run, today } from '../../utils'

interface Day {
  date: string
  visits: number
  drugFee: number
  otherFee: number
  total: number
  received: number
  repay: number
  byMethod: Record<string, number>
}
const from = ref(monthStart())
const to = ref(today())
const data = ref<{ rows: Day[]; sum: Omit<Day, 'date'> } | null>(null)
async function load() {
  data.value =
    (await run(() =>
      api.get<NonNullable<typeof data.value>>('/finance/income', { from: from.value, to: to.value }),
    )) ?? null
}
onMounted(load)
const fmtMethods = (m: Record<string, number>) =>
  Object.entries(m)
    .map(([k, v]) => `${k} ${money(v)}`)
    .join('；')
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex items-center gap-2">
      <DateRange v-model:from="from" v-model:to="to" />
      <n-button @click="load">统计</n-button>
      <n-button quaternary @click="((from = today()), (to = today()), load())">今日</n-button>
    </div>
    <template v-if="data">
      <n-grid :cols="5" :x-gap="12" class="mb-4">
        <n-gi><n-statistic label="就诊人次" :value="data.sum.visits" /></n-gi>
        <n-gi
          ><n-statistic label="应收合计"
            ><span class="money">{{ money(data.sum.total) }}</span></n-statistic
          ></n-gi
        >
        <n-gi
          ><n-statistic label="其中药品费"
            ><span class="money">{{ money(data.sum.drugFee) }}</span></n-statistic
          ></n-gi
        >
        <n-gi
          ><n-statistic label="实收合计"
            ><span class="money text-teal-700">{{ money(data.sum.received) }}</span></n-statistic
          ></n-gi
        >
        <n-gi
          ><n-statistic label="其中欠款回收"
            ><span class="money">{{ money(data.sum.repay) }}</span></n-statistic
          ></n-gi
        >
      </n-grid>
      <n-table size="small" :single-line="false">
        <thead>
          <tr>
            <th>日期</th>
            <th>就诊人次</th>
            <th>药品费</th>
            <th>其他费</th>
            <th>应收</th>
            <th>实收</th>
            <th>其中还款</th>
            <th>按支付方式</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in data.rows" :key="r.date">
            <td>{{ r.date }}</td>
            <td>{{ r.visits }}</td>
            <td class="money">{{ money(r.drugFee) }}</td>
            <td class="money">{{ money(r.otherFee) }}</td>
            <td class="money">{{ money(r.total) }}</td>
            <td class="money">{{ money(r.received) }}</td>
            <td class="money">{{ money(r.repay) }}</td>
            <td>{{ fmtMethods(r.byMethod) }}</td>
          </tr>
          <tr class="font-semibold">
            <td>合计</td>
            <td>{{ data.sum.visits }}</td>
            <td>{{ money(data.sum.drugFee) }}</td>
            <td>{{ money(data.sum.otherFee) }}</td>
            <td>{{ money(data.sum.total) }}</td>
            <td>{{ money(data.sum.received) }}</td>
            <td>{{ money(data.sum.repay) }}</td>
            <td>{{ fmtMethods(data.sum.byMethod) }}</td>
          </tr>
        </tbody>
      </n-table>
    </template>
  </n-card>
</template>
