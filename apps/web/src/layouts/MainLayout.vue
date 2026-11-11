<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { ROLE_LABELS } from '@mediflow/shared'
import type { MenuOption } from 'naive-ui'
import { computed, h } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { appRoutes, menuGroups } from '../router'
import { useAuth } from '../stores/auth'

const auth = useAuth()
const route = useRoute()
const router = useRouter()

const menu = computed<MenuOption[]>(() => {
  const visible = appRoutes.filter(
    (r) => r.meta?.group && (!r.meta.modules?.length || auth.can(...r.meta.modules)),
  )
  const items: MenuOption[] = [
    { key: '/', label: () => h(RouterLink, { to: '/' }, { default: () => '工作台' }) },
  ]
  for (const g of menuGroups) {
    const children = visible
      .filter((r) => r.meta?.group === g)
      .map((r) => ({
        key: r.path,
        label: () => h(RouterLink, { to: r.path }, { default: () => r.meta?.title }),
      }))
    if (children.length) items.push({ key: g, label: g, type: 'group', children })
  }
  return items
})

const active = computed(() => {
  const p = route.path
  const hit = appRoutes
    .filter((r) => r.meta?.group || r.path === '/')
    .map((r) => r.path)
    .filter((x) => x === p || (x !== '/' && p.startsWith(x + '/')))
    .sort((a, b) => b.length - a.length)[0]
  return hit ?? p
})

const userOptions = [
  { label: '修改密码', key: 'pwd' },
  { label: '退出登录', key: 'logout' },
]
function onUser(key: string) {
  if (key === 'pwd') router.push({ name: 'change-password' })
  else {
    auth.logout()
    router.push({ name: 'login' })
  }
}
</script>

<template>
  <n-layout has-sider class="h-full">
    <n-layout-sider
      bordered
      :width="210"
      :native-scrollbar="false"
      collapse-mode="width"
      show-trigger="bar"
      :collapsed-width="0"
    >
      <div class="flex items-center gap-2 px-5 py-4">
        <img src="/favicon.svg" class="h-8 w-8" alt="" />
        <div>
          <div class="text-base font-semibold text-teal-800">MediFlow</div>
          <div class="text-xs text-gray-400">诊所管理系统</div>
        </div>
      </div>
      <n-menu :options="menu" :value="active" :indent="18" />
      <div class="px-5 py-3 text-xs text-gray-400">© 2026 sincalwow</div>
    </n-layout-sider>
    <n-layout>
      <n-layout-header bordered class="flex h-14 items-center justify-between px-6">
        <div class="text-lg font-medium">{{ route.meta.title }}</div>
        <n-dropdown :options="userOptions" @select="onUser">
          <n-button quaternary>
            {{ auth.me?.displayName }}
            <n-tag size="small" type="success" class="ml-2" :bordered="false">{{
              auth.me ? ROLE_LABELS[auth.me.role] : ''
            }}</n-tag>
          </n-button>
        </n-dropdown>
      </n-layout-header>
      <n-layout-content
        content-style="padding: 20px;"
        :native-scrollbar="false"
        style="height: calc(100% - 56px)"
      >
        <router-view :key="route.fullPath" />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>
