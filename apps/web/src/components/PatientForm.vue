<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { api, ApiError } from '../api'
import { confirm, dateToTs, message, run, tsToDate } from '../utils'

export interface Patient {
  id: number
  name: string
  gender: string | null
  birthDate: string | null
  phone: string | null
  idCard: string | null
  address: string | null
  allergies: string | null
  history: string | null
  remark: string | null
}
const props = defineProps<{ show: boolean; patient?: Patient | null }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'saved', p: Patient): void }>()
const blank = () => ({
  name: '',
  gender: null as string | null,
  birth: null as number | null,
  phone: '',
  idCard: '',
  address: '',
  allergies: '',
  history: '',
  remark: '',
})
const form = ref(blank())
watch(
  () => props.show,
  (s) => {
    if (!s) return
    const p = props.patient
    form.value = p
      ? {
          name: p.name,
          gender: p.gender,
          birth: dateToTs(p.birthDate),
          phone: p.phone ?? '',
          idCard: p.idCard ?? '',
          address: p.address ?? '',
          allergies: p.allergies ?? '',
          history: p.history ?? '',
          remark: p.remark ?? '',
        }
      : blank()
  },
)
async function save(force = false) {
  const f = form.value
  if (!f.name.trim()) return message.error('请填写姓名')
  const body = {
    name: f.name,
    gender: f.gender,
    birthDate: tsToDate(f.birth) ?? null,
    phone: f.phone,
    idCard: f.idCard,
    address: f.address,
    allergies: f.allergies,
    history: f.history,
    remark: f.remark,
  }
  try {
    const p = props.patient
      ? await api.put<Patient>(`/patients/${props.patient.id}`, body)
      : await api.post<Patient>(`/patients${force ? '?force=1' : ''}`, body)
    message.success('患者档案已保存')
    emit('saved', p)
    emit('update:show', false)
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && !force) {
      if (await confirm(`${e.message}。仍要新建一份档案吗？（建议直接搜索使用已有档案）`)) return save(true)
      return
    }
    run(() => Promise.reject(e))
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="patient ? '编辑患者档案' : '新建患者档案'"
    class="!w-[620px]"
    @update:show="emit('update:show', $event)"
  >
    <n-form label-placement="left" label-width="80">
      <n-grid :cols="2" :x-gap="12">
        <n-form-item-gi label="姓名" required><n-input v-model:value="form.name" /></n-form-item-gi>
        <n-form-item-gi label="性别">
          <n-radio-group v-model:value="form.gender"
            ><n-radio value="男">男</n-radio><n-radio value="女">女</n-radio></n-radio-group
          >
        </n-form-item-gi>
        <n-form-item-gi label="出生日期"
          ><n-date-picker v-model:value="form.birth" type="date" clearable
        /></n-form-item-gi>
        <n-form-item-gi label="联系电话"><n-input v-model:value="form.phone" /></n-form-item-gi>
        <n-form-item-gi label="身份证号"><n-input v-model:value="form.idCard" /></n-form-item-gi>
        <n-form-item-gi label="住址"><n-input v-model:value="form.address" /></n-form-item-gi>
        <n-form-item-gi :span="2" label="药物过敏史"
          ><n-input v-model:value="form.allergies" placeholder="如：青霉素过敏；无则填「无」"
        /></n-form-item-gi>
        <n-form-item-gi :span="2" label="既往病史"
          ><n-input v-model:value="form.history" type="textarea" :rows="2"
        /></n-form-item-gi>
        <n-form-item-gi :span="2" label="备注"><n-input v-model:value="form.remark" /></n-form-item-gi>
      </n-grid>
    </n-form>
    <template #footer>
      <div class="flex justify-end gap-2">
        <n-button @click="emit('update:show', false)">取消</n-button
        ><n-button type="primary" @click="save()">保存</n-button>
      </div>
    </template>
  </n-modal>
</template>
