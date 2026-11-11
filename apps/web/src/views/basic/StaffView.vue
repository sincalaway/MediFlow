<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import CrudPage, { type Field } from '../../components/CrudPage.vue'

const fields: Field[] = [
  { key: 'code', label: '人员编号', placeholder: '留空自动生成', width: 90 },
  { key: 'name', label: '姓名', required: true, width: 100 },
  {
    key: 'gender',
    label: '性别',
    type: 'select',
    options: [
      { label: '男', value: '男' },
      { label: '女', value: '女' },
    ],
    width: 60,
  },
  { key: 'title', label: '职业/职称', width: 100 },
  { key: 'isDoctor', label: '看诊医生', type: 'bool', default: false, width: 80 },
  { key: 'phone', label: '联系电话', width: 130 },
  { key: 'address', label: '住址', width: 200 },
  { key: 'active', label: '在职', type: 'bool', width: 60 },
  { key: 'remark', label: '备注', type: 'textarea', inTable: false },
]
</script>

<template>
  <CrudPage endpoint="/staff" :fields="fields" write-module="basic.staff" entity-name="人员" />
</template>
