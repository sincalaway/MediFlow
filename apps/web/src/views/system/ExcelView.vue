<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import type { UploadFileInfo } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import { message, run } from '../../utils'

const sheets = ref<{ key: string; title: string; importable: boolean }[]>([])
const selected = ref<string[]>([])
const importKey = ref<string | null>(null)
const file = ref<File | null>(null)
const result = ref<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(
  null,
)
onMounted(async () => {
  sheets.value = (await run(() => api.get<typeof sheets.value>('/system/excel/sheets'))) ?? []
  selected.value = sheets.value.map((s) => s.key)
})
async function exportXlsx() {
  await run(() => api.download('/system/excel/export', { sheets: selected.value.join(',') }, 'mediflow.xlsx'))
}
function onFile(list: UploadFileInfo[]) {
  file.value = list[0]?.file ?? null
}
async function importXlsx() {
  if (!importKey.value || !file.value) return message.error('请选择数据类型和文件')
  const fd = new FormData()
  fd.append('sheet', importKey.value)
  fd.append('file', file.value)
  result.value =
    (await run(() => api.upload<NonNullable<typeof result.value>>('/system/excel/import', fd))) ?? null
  if (result.value)
    message.success(
      `导入完成：新增 ${result.value.created}，更新 ${result.value.updated}，失败 ${result.value.errors.length}`,
    )
}
</script>

<template>
  <div class="space-y-4">
    <n-card title="导出 Excel" :bordered="false">
      <n-checkbox-group v-model:value="selected" class="mb-3">
        <n-space><n-checkbox v-for="s in sheets" :key="s.key" :value="s.key" :label="s.title" /></n-space>
      </n-checkbox-group>
      <n-button type="primary" :disabled="!selected.length" @click="exportXlsx">导出</n-button>
      <p class="mt-2 text-sm text-gray-500">
        导出的文件也可作为导入模板：保留表头，按「编号」新增或更新（编号留空则自动生成）。金额单位为元。
      </p>
    </n-card>
    <n-card title="导入 Excel（主数据）" :bordered="false">
      <n-space vertical>
        <n-select
          v-model:value="importKey"
          :options="sheets.filter((s) => s.importable).map((s) => ({ label: s.title, value: s.key }))"
          placeholder="数据类型"
          class="!w-56"
        />
        <n-upload :max="1" :default-upload="false" accept=".xlsx" @update:file-list="onFile"
          ><n-button>选择 .xlsx 文件</n-button></n-upload
        >
        <n-button type="primary" @click="importXlsx">开始导入</n-button>
      </n-space>
      <div v-if="result" class="mt-4">
        <n-alert :type="result.errors.length ? 'warning' : 'success'" :bordered="false"
          >新增 {{ result.created }} 条，更新 {{ result.updated }} 条，失败
          {{ result.errors.length }} 条</n-alert
        >
        <ul class="mt-2 text-sm text-red-600">
          <li v-for="e in result.errors" :key="e.row">第 {{ e.row }} 行：{{ e.message }}</li>
        </ul>
      </div>
    </n-card>
  </div>
</template>
