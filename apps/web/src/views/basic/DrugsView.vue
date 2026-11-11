<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { pinyinCode } from '@mediflow/shared'
import CrudPage, { type Field } from '../../components/CrudPage.vue'

const opt = (xs: string[]) => xs.map((x) => ({ label: x, value: x }))
const fields: Field[] = [
  { key: 'code', label: '药品编号', placeholder: '留空自动生成', width: 90 },
  { key: 'name', label: '药品名称', required: true, width: 180 },
  { key: 'pinyin', label: '检索码', placeholder: '根据名称自动生成', width: 110 },
  {
    key: 'category',
    label: '药品类别',
    type: 'select',
    options: opt(['西药', '中成药', '中药饮片', '医疗器械', '其他']),
    width: 90,
  },
  { key: 'spec', label: '规格型号', width: 120 },
  {
    key: 'dosageForm',
    label: '剂型',
    type: 'select',
    options: opt(['片剂', '胶囊', '颗粒', '散剂', '丸剂', '注射液', '口服液', '糖浆', '软膏', '袋', '其他']),
    width: 80,
  },
  { key: 'unit', label: '单位', width: 60 },
  { key: 'manufacturer', label: '生产厂家', width: 160 },
  { key: 'retailPrice', label: '零售价', type: 'money', width: 90 },
  { key: 'stockMin', label: '库存下限', type: 'int', width: 80 },
  { key: 'stockMax', label: '库存上限', type: 'int', width: 80 },
  { key: 'active', label: '启用', type: 'bool', width: 60 },
  { key: 'remark', label: '备注', type: 'textarea', inTable: false },
]

function onChange(key: string, value: unknown, form: Record<string, unknown>) {
  if (key === 'name') form.pinyin = pinyinCode(String(value ?? ''))
}
</script>

<template>
  <CrudPage
    endpoint="/drugs"
    :fields="fields"
    write-module="basic.drug"
    entity-name="药品"
    @change="onChange"
  />
</template>
