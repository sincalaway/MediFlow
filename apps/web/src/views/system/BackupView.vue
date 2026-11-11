<script setup lang="ts">
import type { UploadFileInfo } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import { confirm, message, run } from '../../utils'

const info = ref<{
  provider: string
  dbFile: string | null
  dbSize: number | null
  dataDir: string
  counts: Record<string, number>
} | null>(null)
const file = ref<File | null>(null)
onMounted(async () => {
  info.value = (await run(() => api.get<NonNullable<typeof info.value>>('/system/info'))) ?? null
})
async function backup() {
  await run(
    () => api.download('/system/backup', undefined, 'mediflow.db'),
    '备份已下载（同时保存在数据目录 backups 下）',
  )
}
function onFile(list: UploadFileInfo[]) {
  file.value = list[0]?.file ?? null
}
async function restore() {
  if (!file.value) return message.error('请选择备份文件')
  if (
    !(await confirm('恢复将用备份文件覆盖当前全部数据（系统会先自动备份当前数据）。确定继续？', '恢复数据'))
  )
    return
  const fd = new FormData()
  fd.append('file', file.value)
  const r = await run(() => api.upload<{ autoBackup: string }>('/system/restore', fd))
  if (r) {
    message.success('恢复成功，请重新登录')
    setTimeout(() => location.reload(), 1200)
  }
}
</script>

<template>
  <div class="space-y-4">
    <n-card title="数据库信息" :bordered="false">
      <n-descriptions v-if="info" :column="2" bordered size="small" label-placement="left">
        <n-descriptions-item label="数据库类型">{{
          info.provider === 'sqlite' ? 'SQLite（单机文件）' : 'PostgreSQL'
        }}</n-descriptions-item>
        <n-descriptions-item label="文件大小">{{
          info.dbSize ? (info.dbSize / 1024).toFixed(1) + ' KB' : '-'
        }}</n-descriptions-item>
        <n-descriptions-item label="数据库文件">{{ info.dbFile ?? '-' }}</n-descriptions-item>
        <n-descriptions-item label="数据目录">{{ info.dataDir }}</n-descriptions-item>
        <n-descriptions-item label="数据量"
          >患者 {{ info.counts.patients }}，就诊 {{ info.counts.visits }}，药品 {{ info.counts.drugs }}，批次
          {{ info.counts.batches }}</n-descriptions-item
        >
      </n-descriptions>
    </n-card>
    <n-card title="备份" :bordered="false">
      <p class="mb-3 text-sm text-gray-600">
        生成数据库一致性快照（VACUUM INTO）并下载。建议每天下班前备份一次并拷贝到 U 盘或网盘。
      </p>
      <n-button type="primary" :disabled="info?.provider !== 'sqlite'" @click="backup"
        >立即备份并下载</n-button
      >
      <p v-if="info && info.provider !== 'sqlite'" class="mt-2 text-sm text-orange-600">
        PostgreSQL 部署请使用 pg_dump / pg_restore。
      </p>
    </n-card>
    <n-card title="恢复" :bordered="false">
      <n-upload :max="1" :default-upload="false" accept=".db,.sqlite" @update:file-list="onFile">
        <n-button>选择备份文件（.db）</n-button>
      </n-upload>
      <n-button class="mt-3" type="error" :disabled="!file || info?.provider !== 'sqlite'" @click="restore"
        >从备份恢复</n-button
      >
    </n-card>
  </div>
</template>
