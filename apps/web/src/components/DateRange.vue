<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { computed } from 'vue'
import { dateToTs, tsToDate } from '../utils'

const props = defineProps<{ from: string; to: string }>()
const emit = defineEmits<{ (e: 'update:from', v: string): void; (e: 'update:to', v: string): void }>()
const range = computed<[number, number] | null>({
  get: () => [dateToTs(props.from)!, dateToTs(props.to)!] as [number, number],
  set: (v: [number, number] | null) => {
    emit('update:from', tsToDate(v?.[0]) ?? props.from)
    emit('update:to', tsToDate(v?.[1]) ?? props.to)
  },
})
</script>

<template>
  <n-date-picker v-model:value="range" type="daterange" class="!w-64" />
</template>
