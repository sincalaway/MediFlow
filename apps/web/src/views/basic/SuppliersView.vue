<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import CrudPage, { type Field } from '../../components/CrudPage.vue'

const fields: Field[] = [
  { key: 'code', label: '单位编号', placeholder: '留空自动生成', width: 90 },
  { key: 'name', label: '单位名称', required: true, width: 220 },
  { key: 'contact', label: '联系人', width: 90 },
  { key: 'phone', label: '联系电话', width: 130 },
  { key: 'address', label: '地址', width: 220 },
  { key: 'active', label: '启用', type: 'bool', width: 60 },
  { key: 'remark', label: '备注', type: 'textarea', inTable: false },
]
</script>

<template>
  <CrudPage endpoint="/suppliers" :fields="fields" write-module="basic.supplier" entity-name="供药单位" />
</template>
