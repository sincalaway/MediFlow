<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { dateZhCN, zhCN, type GlobalThemeOverrides } from 'naive-ui'

const theme: GlobalThemeOverrides = {
  common: {
    primaryColor: '#0f766e',
    primaryColorHover: '#14b8a6',
    primaryColorPressed: '#115e59',
    primaryColorSuppl: '#0d9488',
  },
}
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="theme" class="h-full">
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
