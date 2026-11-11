<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { useAuth } from '../stores/auth'
import { message, run } from '../utils'

const auth = useAuth()
const router = useRouter()
const route = useRoute()
const needsSetup = ref(false)
const loading = ref(false)
const form = reactive({ username: '', password: '', password2: '' })

onMounted(async () => {
  const r = await run(() => api.get<{ needsSetup: boolean }>('/auth/setup-status'))
  needsSetup.value = !!r?.needsSetup
  if (needsSetup.value) form.username = 'admin'
})

async function submit() {
  loading.value = true
  try {
    if (needsSetup.value) {
      if (form.password.length < 6) return message.error('密码至少 6 位')
      if (form.password !== form.password2) return message.error('两次输入的密码不一致')
      const ok = await run(() => api.post('/auth/setup', { password: form.password }), '管理员密码已设置')
      if (!ok) return
      needsSetup.value = false
    }
    const user = await run(() => auth.login(form.username, form.password))
    if (!user) return
    router.replace(
      user.mustChangePassword ? { name: 'change-password' } : String(route.query.redirect || '/'),
    )
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex h-full items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100">
    <n-card class="w-[380px] shadow-lg" :bordered="false">
      <div class="mb-6 flex items-center gap-3">
        <img src="/favicon.svg" class="h-11 w-11" alt="" />
        <div>
          <div class="text-xl font-semibold text-teal-800">MediFlow 诊所管理系统</div>
          <div class="text-xs text-gray-400">病案 · 收费 · 药房 一体化</div>
        </div>
      </div>
      <n-alert v-if="needsSetup" type="info" class="mb-4" :bordered="false">
        首次运行：请为管理员账号 <b>admin</b> 设置密码（至少 6 位）。
      </n-alert>
      <n-form @submit.prevent="submit">
        <n-form-item label="用户名">
          <n-input v-model:value="form.username" :disabled="needsSetup" placeholder="用户名" />
        </n-form-item>
        <n-form-item :label="needsSetup ? '设置密码' : '密码'">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            @keyup.enter="submit"
          />
        </n-form-item>
        <n-form-item v-if="needsSetup" label="确认密码">
          <n-input
            v-model:value="form.password2"
            type="password"
            show-password-on="click"
            placeholder="再次输入密码"
            @keyup.enter="submit"
          />
        </n-form-item>
        <n-button type="primary" block :loading="loading" attr-type="submit">{{
          needsSetup ? '设置并登录' : '登录'
        }}</n-button>
      </n-form>
    </n-card>
  </div>
</template>
