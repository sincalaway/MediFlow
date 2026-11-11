<script setup lang="ts">
import { PAY_METHODS } from '@mediflow/shared'
import { ref, watch } from 'vue'
import { api } from '../api'
import { dateToTs, money, run, toCents, today, tsToDate, yuan } from '../utils'

export interface PayTarget {
  id: number
  visitNo: string
  patientName: string
  total: number
  paid: number
  owed: number
}
const props = defineProps<{ target: PayTarget | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done'): void }>()
const amount = ref(0)
const method = ref<(typeof PAY_METHODS)[number]>('现金')
const paidAt = ref<number | null>(dateToTs(today()))
const remark = ref('')
watch(
  () => props.target,
  (t) => {
    if (t) {
      amount.value = yuan(t.owed)
      paidAt.value = dateToTs(today())
      remark.value = ''
    }
  },
)
async function submit() {
  const t = props.target!
  const ok = await run(
    () =>
      api.post(`/visits/${t.id}/payments`, {
        amount: toCents(amount.value),
        method: method.value,
        paidAt: tsToDate(paidAt.value),
        remark: remark.value,
      }),
    '收款成功',
  )
  if (ok) emit('done')
}
</script>

<template>
  <n-modal :show="!!target" preset="card" title="收费 / 还款" class="!w-[440px]" @update:show="emit('close')">
    <template v-if="target">
      <div class="mb-3 space-y-1 text-sm">
        <div>
          就诊编号：{{ target.visitNo }}　患者：<b>{{ target.patientName }}</b>
        </div>
        <div>
          应收 {{ money(target.total) }}，已收 {{ money(target.paid) }}，<span class="text-red-600"
            >欠款 {{ money(target.owed) }}</span
          >
        </div>
      </div>
      <n-form label-placement="left" label-width="70">
        <n-form-item label="收款金额"
          ><n-input-number v-model:value="amount" :min="0.01" :max="yuan(target.owed)" :precision="2"
        /></n-form-item>
        <n-form-item label="支付方式"
          ><n-select v-model:value="method" :options="PAY_METHODS.map((m) => ({ label: m, value: m }))"
        /></n-form-item>
        <n-form-item label="收款日期"><n-date-picker v-model:value="paidAt" type="date" /></n-form-item>
        <n-form-item label="备注"><n-input v-model:value="remark" /></n-form-item>
      </n-form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="emit('close')">取消</n-button
        ><n-button type="primary" @click="submit">确认收款</n-button>
      </div>
    </template>
  </n-modal>
</template>
