<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { PAY_METHODS } from '@mediflow/shared'
import type { DataTableColumns } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../../api'
import DateRange from '../../components/DateRange.vue'
import { loadSuppliers, suppliers } from '../../masterCache'
import { useAuth } from '../../stores/auth'
import { dateToTs, message, money, run, toCents, today, tsToDate } from '../../utils'

interface Row {
  id: number
  docNo: string | null
  paidAt: string
  amount: number
  method: string
  receivedBy: string | null
  remark: string | null
  supplier: { name: string } | null
  purchaseOrder: { orderNo: string } | null
}
const auth = useAuth()
const from = ref('2000-01-01')
const to = ref(today())
const rows = ref<Row[]>([])
const show = ref(false)
const payable = ref(new Map<number, number>())
const form = reactive({
  supplierId: null as number | null,
  amount: 0,
  method: '银行卡' as (typeof PAY_METHODS)[number],
  paidAt: dateToTs(today()),
  remark: '',
})
async function load() {
  rows.value =
    (await run(() => api.get<Row[]>('/supplier-payments', { from: from.value, to: to.value }))) ?? []
}
onMounted(async () => {
  load()
  await loadSuppliers(true)
  const p = (await run(() => api.get<{ supplierId: number; payable: number }[]>('/finance/payables'))) ?? []
  payable.value = new Map(p.map((x) => [x.supplierId, x.payable]))
})
const supplierOptions = computed(() =>
  suppliers.value.map((s) => ({
    label: `${s.name}（应付 ${money(payable.value.get(s.id) ?? 0)}）`,
    value: s.id,
  })),
)
const columns: DataTableColumns<Row> = [
  {
    title: '付款编号',
    key: 'docNo',
    render: (r) => r.docNo ?? (r.purchaseOrder ? `入库单 ${r.purchaseOrder.orderNo}` : ''),
  },
  { title: '付款日期', key: 'paidAt' },
  { title: '供药单位', key: 'supplier', render: (r) => r.supplier?.name ?? '' },
  { title: '金额', key: 'amount', render: (r) => money(r.amount) },
  { title: '方式', key: 'method' },
  { title: '经办人', key: 'receivedBy' },
  { title: '备注', key: 'remark' },
]
async function save() {
  if (!form.supplierId) return message.error('请选择供药单位')
  if (form.amount <= 0) return message.error('请填写付款金额')
  const ok = await run(
    () =>
      api.post('/supplier-payments', {
        supplierId: form.supplierId,
        amount: toCents(form.amount),
        method: form.method,
        paidAt: tsToDate(form.paidAt),
        remark: form.remark,
      }),
    '付款已登记',
  )
  if (ok) {
    show.value = false
    load()
  }
}
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex items-center gap-2">
      <DateRange v-model:from="from" v-model:to="to" />
      <n-button @click="load">查询</n-button>
      <div class="flex-1" />
      <n-button v-if="auth.can('finance')" type="primary" @click="show = true">登记付款</n-button>
    </div>
    <n-data-table :columns="columns" :data="rows" size="small" :pagination="{ pageSize: 20 }" />
    <n-modal v-model:show="show" preset="card" title="付供药单位货款" class="!w-[460px]">
      <n-form label-placement="left" label-width="80">
        <n-form-item label="供药单位" required
          ><n-select v-model:value="form.supplierId" :options="supplierOptions" filterable
        /></n-form-item>
        <n-form-item label="付款金额" required
          ><n-input-number v-model:value="form.amount" :min="0" :precision="2"
        /></n-form-item>
        <n-form-item label="付款方式"
          ><n-select v-model:value="form.method" :options="PAY_METHODS.map((m) => ({ label: m, value: m }))"
        /></n-form-item>
        <n-form-item label="付款日期"><n-date-picker v-model:value="form.paidAt" type="date" /></n-form-item>
        <n-form-item label="备注"><n-input v-model:value="form.remark" /></n-form-item>
      </n-form>
      <template #footer
        ><div class="flex justify-end gap-2">
          <n-button @click="show = false">取消</n-button
          ><n-button type="primary" @click="save">保存</n-button>
        </div></template
      >
    </n-modal>
  </n-card>
</template>
