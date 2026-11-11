<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { useAuth } from '../stores/auth'
import { message, run } from '../utils'

const auth = useAuth()
const router = useRouter()
const form = reactive({ oldPassword: '', newPassword: '', confirm: '' })

function logout() {
  auth.logout()
  router.replace('/login')
}

async function submit() {
  if (form.newPassword.length < 6) return message.error('新密码至少 6 位')
  if (form.newPassword !== form.confirm) return message.error('两次输入的新密码不一致')
  const ok = await run(
    () => api.post('/auth/change-password', { oldPassword: form.oldPassword, newPassword: form.newPassword }),
    '密码已修改',
  )
  if (!ok) return
  await auth.load()
  router.replace('/')
}
</script>

<template>
  <div class="flex h-full items-center justify-center bg-slate-100">
    <n-card title="修改密码" class="w-[400px]">
      <n-alert v-if="auth.me?.mustChangePassword" type="warning" class="mb-4" :bordered="false">
        这是初始密码，请先设置新密码后再使用系统。
      </n-alert>
      <n-form @submit.prevent="submit">
        <n-form-item label="原密码"><n-input v-model:value="form.oldPassword" type="password" /></n-form-item>
        <n-form-item label="新密码"
          ><n-input v-model:value="form.newPassword" type="password" placeholder="至少 6 位"
        /></n-form-item>
        <n-form-item label="确认新密码"
          ><n-input v-model:value="form.confirm" type="password" @keyup.enter="submit"
        /></n-form-item>
        <div class="flex gap-2">
          <n-button type="primary" attr-type="submit">保存</n-button>
          <n-button v-if="!auth.me?.mustChangePassword" @click="router.back()">返回</n-button>
          <n-button v-else quaternary @click="logout">退出登录</n-button>
        </div>
      </n-form>
    </n-card>
  </div>
</template>
