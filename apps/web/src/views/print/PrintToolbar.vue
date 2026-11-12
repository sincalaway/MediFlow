<script setup lang="ts">
defineProps<{ title: string; hint?: string }>()
const doPrint = () => window.print()
const doClose = () => window.close()
</script>

<template>
  <div class="print-toolbar">
    <b>{{ title }}</b>
    <span class="hint">{{ hint }}</span>
    <slot />
    <button class="btn primary" @click="doPrint">打印</button>
    <button class="btn" @click="doClose">关闭</button>
  </div>
</template>

<style scoped>
.print-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #0f766e;
  color: #fff;
  font-size: 14px;
}
.hint {
  flex: 1;
  opacity: 0.85;
  font-size: 12px;
}
.btn {
  border: 1px solid #fff;
  border-radius: 4px;
  padding: 4px 14px;
  background: transparent;
  color: #fff;
  cursor: pointer;
}
.btn.primary {
  background: #fff;
  color: #0f766e;
}
@media print {
  .print-toolbar {
    display: none;
  }
}
</style>
