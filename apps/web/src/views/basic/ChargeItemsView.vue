<script setup lang="ts">
import CrudPage, { type Field } from '../../components/CrudPage.vue'

const fields: Field[] = [
  { key: 'code', label: '项目编号', placeholder: '留空自动生成', width: 100 },
  { key: 'name', label: '项目名称', required: true, width: 200 },
  { key: 'price', label: '价格', type: 'money', width: 100 },
  { key: 'unit', label: '单位', width: 80 },
  { key: 'active', label: '启用', type: 'bool', width: 60 },
]
</script>

<template>
  <CrudPage
    endpoint="/charge-items"
    :fields="fields"
    write-module="basic.chargeItem"
    entity-name="收费项目"
  />
</template>
