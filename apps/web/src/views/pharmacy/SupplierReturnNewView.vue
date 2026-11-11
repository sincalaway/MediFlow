<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'
import { loadSuppliers, suppliers } from '../../masterCache'
import { useAuth } from '../../stores/auth'
import { dateToTs, message, money, run, toCents, today, tsToDate, yuan } from '../../utils'

interface Batch {
  id: number
  batchNo: string
  expiryDate: string
  stock: number
  costPrice: number
  supplierId: number | null
  state: string
  drug: { name: string; spec: string | null; unit: string | null; pinyin: string }
}
interface Line {
  batchId: number | null
  quantity: number
  unitPrice: number
}
const auth = useAuth()
const router = useRouter()
const batches = ref<Batch[]>([])
const form = reactive({
  supplierId: null as number | null,
  returnDate: dateToTs(today()),
  handler: auth.me?.displayName ?? '',
  remark: '',
  lines: [{ batchId: null, quantity: 1, unitPrice: 0 }] as Line[],
})

onMounted(async () => {
  await loadSuppliers(true)
  batches.value = (await run(() => api.get<Batch[]>('/stock/batches', { filter: 'all' }))) ?? []
})
const supplierOptions = computed(() => suppliers.value.map((s) => ({ label: s.name, value: s.id })))
const batchOptions = computed(() =>
  batches.value
    .filter((b) => !form.supplierId || b.supplierId == null || b.supplierId === form.supplierId)
    .map((b) => ({
      label: `${b.drug.name} ${b.drug.spec ?? ''} | 批号 ${b.batchNo} | 效期 ${b.expiryDate}${b.state === 'expired' ? '（已过期）' : ''} | 库存 ${b.stock}`,
      value: b.id,
    })),
)
const batchOf = (id: number | null) => batches.value.find((b) => b.id === id)
function onBatch(l: Line, id: number | null) {
  l.batchId = id
  const b = batchOf(id)
  if (b) l.unitPrice = yuan(b.costPrice)
}
const total = computed(() => form.lines.reduce((s, l) => s + l.quantity * toCents(l.unitPrice), 0))

async function save() {
  if (!form.supplierId) return message.error('请选择供药单位')
  const lines = form.lines.filter((l) => l.batchId)
  if (!lines.length) return message.error('请选择退货批次')
  for (const l of lines) {
    const b = batchOf(l.batchId)!
    if (l.quantity > b.stock)
      return message.error(`${b.drug.name} 批号 ${b.batchNo} 退货数量超过库存 ${b.stock}`)
  }
  const r = await run(() =>
    api.post<{ returnNo: string }>('/supplier-returns', {
      supplierId: form.supplierId,
      returnDate: tsToDate(form.returnDate),
      handler: form.handler,
      remark: form.remark,
      lines: lines.map((l) => ({
        batchId: l.batchId,
        quantity: l.quantity,
        unitPrice: toCents(l.unitPrice),
      })),
    }),
  )
  if (r) {
    message.success(`退货单 ${r.returnNo} 已保存`)
    router.push('/pharmacy/returns')
  }
}
</script>

<template>
  <n-card :bordered="false" title="新建退货单">
    <n-form label-placement="left" label-width="80" class="max-w-4xl">
      <n-grid :cols="3" :x-gap="12">
        <n-form-item-gi label="供药单位" required
          ><n-select v-model:value="form.supplierId" :options="supplierOptions" filterable
        /></n-form-item-gi>
        <n-form-item-gi label="退货日期"
          ><n-date-picker v-model:value="form.returnDate" type="date"
        /></n-form-item-gi>
        <n-form-item-gi label="经办人"><n-input v-model:value="form.handler" /></n-form-item-gi>
      </n-grid>
    </n-form>
    <n-table size="small" :single-line="false" class="mb-3">
      <thead>
        <tr>
          <th>批次（只列出有库存的批次）</th>
          <th class="w-28">数量</th>
          <th class="w-32">单价(元)</th>
          <th>金额</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="(l, i) in form.lines" :key="i">
          <td>
            <n-select
              :value="l.batchId"
              :options="batchOptions"
              filterable
              @update:value="(v: number | null) => onBatch(l, v)"
            />
          </td>
          <td>
            <n-input-number
              v-model:value="l.quantity"
              :min="1"
              :max="batchOf(l.batchId)?.stock"
              :precision="0"
            />
          </td>
          <td><n-input-number v-model:value="l.unitPrice" :min="0" :precision="2" /></td>
          <td class="money">{{ money(l.quantity * toCents(l.unitPrice)) }}</td>
          <td>
            <n-button size="small" quaternary type="error" @click="form.lines.splice(i, 1)">删除</n-button>
          </td>
        </tr>
      </tbody>
    </n-table>
    <n-button dashed block class="mb-4" @click="form.lines.push({ batchId: null, quantity: 1, unitPrice: 0 })"
      >+ 添加一行</n-button
    >
    <div class="mb-4">
      退货总额：<b class="money text-lg">{{ money(total) }}</b>
    </div>
    <n-input v-model:value="form.remark" placeholder="备注（如：过期退回）" class="mb-4 max-w-xl" />
    <div class="flex gap-2">
      <n-button type="primary" @click="save">保存退货</n-button
      ><n-button @click="router.back()">取消</n-button>
    </div>
  </n-card>
</template>
