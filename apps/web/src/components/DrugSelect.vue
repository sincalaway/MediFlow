<script setup lang="ts">
import { matchKeyword } from '@mediflow/shared'
import type { SelectOption } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { drugs, loadDrugs, type DrugLite } from '../masterCache'

const props = defineProps<{ value: number | null; placeholder?: string }>()
const emit = defineEmits<{
  (e: 'update:value', v: number | null): void
  (e: 'select', d: DrugLite | null): void
}>()

onMounted(() => loadDrugs())
const options = computed<SelectOption[]>(() =>
  drugs.value
    .filter((d) => d.active)
    .map((d) => ({ label: `${d.name}${d.spec ? ' ' + d.spec : ''}（${d.code}）`, value: d.id })),
)
function filter(pattern: string, option: SelectOption) {
  const d = drugs.value.find((x) => x.id === option.value)
  return !!d && matchKeyword(pattern, d.name, d.pinyin, d.code)
}
function onUpdate(v: number | null) {
  emit('update:value', v)
  emit('select', drugs.value.find((d) => d.id === v) ?? null)
}
</script>

<template>
  <n-select
    :value="props.value"
    :options="options"
    filterable
    :filter="filter"
    :placeholder="placeholder ?? '输入名称/拼音码'"
    clearable
    @update:value="onUpdate"
  />
</template>
