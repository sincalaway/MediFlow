<script setup lang="ts">
import type { ClinicSettings } from '@mediflow/shared'
import { onMounted, reactive, ref } from 'vue'
import { api } from '../../api'
import { run } from '../../utils'

const form = reactive<ClinicSettings>({ name: '', address: '', phone: '', department: '', receiptNote: '' })
const saving = ref(false)
onMounted(async () => {
  const s = await run(() => api.get<ClinicSettings>('/settings/clinic'))
  if (s) Object.assign(form, s)
})
async function save() {
  saving.value = true
  const s = await run(() => api.put<ClinicSettings>('/settings/clinic', form), '已保存')
  saving.value = false
  if (s) Object.assign(form, s)
}
</script>

<template>
  <n-card title="机构信息" :bordered="false">
    <n-alert type="info" :bordered="false" class="mb-4">
      用于处方笺与收费收据抬头。机构名称应使用《医疗机构执业许可证》登记的第一名称。
    </n-alert>
    <n-form label-placement="left" label-width="100" class="max-w-xl">
      <n-form-item label="机构名称" required
        ><n-input v-model:value="form.name" placeholder="如：××市××区××诊所"
      /></n-form-item>
      <n-form-item label="默认科别"
        ><n-input v-model:value="form.department" placeholder="如：全科"
      /></n-form-item>
      <n-form-item label="地址"><n-input v-model:value="form.address" /></n-form-item>
      <n-form-item label="电话"><n-input v-model:value="form.phone" /></n-form-item>
      <n-form-item label="收据备注"
        ><n-input v-model:value="form.receiptNote" type="textarea" :rows="2" placeholder="打印在收据底部"
      /></n-form-item>
      <n-form-item label=" "
        ><n-button type="primary" :loading="saving" @click="save">保存</n-button></n-form-item
      >
    </n-form>
  </n-card>
</template>
