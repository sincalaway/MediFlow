<script setup lang="ts">
import { PAY_METHODS } from '@mediflow/shared'
import { computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'
import DrugSelect from '../../components/DrugSelect.vue'
import { loadSuppliers, suppliers } from '../../masterCache'
import { useAuth } from '../../stores/auth'
import { dateToTs, message, money, run, toCents, today, tsToDate } from '../../utils'

interface Line {
  drugId: number | null
  batchNo: string
  mfgDate: number | null
  expiryDate: number | null
  quantity: number
  costPrice: number
}
const auth = useAuth()
const router = useRouter()
const form = reactive({
  supplierId: null as number | null,
  orderDate: dateToTs(today()),
  handler: auth.me?.displayName ?? '',
  remark: '',
  paidNow: 0,
  payMethod: '银行卡' as (typeof PAY_METHODS)[number],
  lines: [] as Line[],
})
const newLine = (): Line => ({
  drugId: null,
  batchNo: '',
  mfgDate: null,
  expiryDate: null,
  quantity: 1,
  costPrice: 0,
})
form.lines.push(newLine())
onMounted(() => loadSuppliers(true))

const supplierOptions = computed(() =>
  suppliers.value.filter((s) => s.active).map((s) => ({ label: s.name, value: s.id })),
)
const total = computed(() => form.lines.reduce((s, l) => s + (l.quantity || 0) * toCents(l.costPrice), 0))

async function save() {
  if (!form.supplierId) return message.error('请选择供药单位')
  const lines = form.lines.filter((l) => l.drugId)
  if (!lines.length) return message.error('请至少录入一行药品')
  for (const [i, l] of lines.entries()) {
    if (!l.expiryDate) return message.error(`第 ${i + 1} 行缺少有效期`)
  }
  const body = {
    supplierId: form.supplierId,
    orderDate: tsToDate(form.orderDate),
    handler: form.handler,
    remark: form.remark,
    paidNow: toCents(form.paidNow),
    payMethod: form.payMethod,
    lines: lines.map((l) => ({
      drugId: l.drugId,
      batchNo: l.batchNo || null,
      mfgDate: tsToDate(l.mfgDate) ?? null,
      expiryDate: tsToDate(l.expiryDate),
      quantity: l.quantity,
      costPrice: toCents(l.costPrice),
    })),
  }
  const r = await run(() => api.post<{ orderNo: string }>('/purchase-orders', body))
  if (r) {
    message.success(`入库单 ${r.orderNo} 已保存，库存已更新`)
    router.push('/pharmacy/purchase')
  }
}
</script>

<template>
  <n-card :bordered="false" title="新建入库单">
    <n-form label-placement="left" label-width="80" class="max-w-4xl">
      <n-grid :cols="3" :x-gap="12">
        <n-form-item-gi label="供药单位" required
          ><n-select v-model:value="form.supplierId" :options="supplierOptions" filterable
        /></n-form-item-gi>
        <n-form-item-gi label="入库日期"
          ><n-date-picker v-model:value="form.orderDate" type="date"
        /></n-form-item-gi>
        <n-form-item-gi label="经办人"><n-input v-model:value="form.handler" /></n-form-item-gi>
      </n-grid>
    </n-form>
    <n-table size="small" :single-line="false" class="mb-3">
      <thead>
        <tr>
          <th class="w-64">药品</th>
          <th>批号</th>
          <th>生产日期</th>
          <th>有效期至 *</th>
          <th class="w-24">数量</th>
          <th class="w-32">进价(元)</th>
          <th>金额</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="(l, i) in form.lines" :key="i">
          <td><DrugSelect v-model:value="l.drugId" /></td>
          <td><n-input v-model:value="l.batchNo" placeholder="留空用生产日期" /></td>
          <td><n-date-picker v-model:value="l.mfgDate" type="date" clearable /></td>
          <td><n-date-picker v-model:value="l.expiryDate" type="date" /></td>
          <td><n-input-number v-model:value="l.quantity" :min="1" :precision="0" /></td>
          <td><n-input-number v-model:value="l.costPrice" :min="0" :precision="2" /></td>
          <td class="money">{{ money((l.quantity || 0) * toCents(l.costPrice)) }}</td>
          <td>
            <n-button size="small" quaternary type="error" @click="form.lines.splice(i, 1)">删除</n-button>
          </td>
        </tr>
      </tbody>
    </n-table>
    <n-button dashed block class="mb-4" @click="form.lines.push(newLine())">+ 添加一行</n-button>
    <n-form label-placement="left" label-width="80" class="max-w-4xl">
      <n-grid :cols="3" :x-gap="12">
        <n-form-item-gi label="合计金额"
          ><b class="money text-lg">{{ money(total) }}</b></n-form-item-gi
        >
        <n-form-item-gi label="当场付款"
          ><n-input-number v-model:value="form.paidNow" :min="0" :precision="2"
        /></n-form-item-gi>
        <n-form-item-gi label="付款方式"
          ><n-select
            v-model:value="form.payMethod"
            :options="PAY_METHODS.map((m) => ({ label: m, value: m }))"
        /></n-form-item-gi>
        <n-form-item-gi :span="3" label="备注"><n-input v-model:value="form.remark" /></n-form-item-gi>
      </n-grid>
    </n-form>
    <div class="flex gap-2">
      <n-button type="primary" @click="save">保存入库</n-button>
      <n-button @click="router.back()">取消</n-button>
    </div>
  </n-card>
</template>
