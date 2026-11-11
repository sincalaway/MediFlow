<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
/* 通用主数据维护页：列表 + 搜索 + 弹窗表单（金额字段以元录入，以分提交） */
import type { ModuleKey } from '@mediflow/shared'
import type { DataTableColumns, SelectOption } from 'naive-ui'
import { computed, h, onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuth } from '../stores/auth'
import { confirm, money, run, toCents, yuan } from '../utils'

export interface Field {
  key: string
  label: string
  type?: 'text' | 'money' | 'int' | 'bool' | 'select' | 'textarea'
  options?: SelectOption[]
  required?: boolean
  inTable?: boolean
  inForm?: boolean
  width?: number
  placeholder?: string
  default?: unknown
}

const props = defineProps<{ endpoint: string; fields: Field[]; writeModule: ModuleKey; entityName: string }>()
const emit = defineEmits<{
  (e: 'change', name: string, value: unknown, form: Record<string, unknown>): void
}>()
type Row = Record<string, unknown> & { id: number }

const auth = useAuth()
const canWrite = computed(() => auth.can(props.writeModule))
const rows = ref<Row[]>([])
const loading = ref(false)
const keyword = ref('')
const show = ref(false)
const editing = ref<Row | null>(null)
const form = ref<Record<string, unknown>>({})

async function load() {
  loading.value = true
  rows.value = (await run(() => api.get<Row[]>(props.endpoint, { keyword: keyword.value }))) ?? []
  loading.value = false
}
onMounted(load)

function render(f: Field, v: unknown) {
  if (f.type === 'money') return money(v as number)
  if (f.type === 'bool') return v ? '是' : '否'
  if (f.type === 'select') return (f.options?.find((o) => o.value === v)?.label as string) ?? (v as string)
  return (v as string) ?? ''
}

const columns = computed<DataTableColumns<Row>>(() => [
  ...props.fields
    .filter((f) => f.inTable !== false)
    .map((f) => ({
      title: f.label,
      key: f.key,
      width: f.width,
      ellipsis: { tooltip: true },
      render: (r: Row) => render(f, r[f.key]),
    })),
  ...(canWrite.value
    ? [
        {
          title: '操作',
          key: '_op',
          width: 130,
          fixed: 'right' as const,
          render: (r: Row) =>
            h('div', { class: 'flex gap-2' }, [
              h('a', { class: 'cursor-pointer text-teal-700', onClick: () => open(r) }, '编辑'),
              h('a', { class: 'cursor-pointer text-red-600', onClick: () => remove(r) }, '删除'),
            ]),
        },
      ]
    : []),
])

function open(r?: Row) {
  editing.value = r ?? null
  const f: Record<string, unknown> = {}
  for (const fd of props.fields) {
    const v = r
      ? r[fd.key]
      : (fd.default ?? (fd.type === 'bool' ? true : fd.type === 'int' || fd.type === 'money' ? 0 : null))
    f[fd.key] = fd.type === 'money' ? yuan(v as number) : v
  }
  form.value = f
  show.value = true
}

async function save() {
  const body: Record<string, unknown> = {}
  for (const fd of props.fields) {
    if (fd.inForm === false) continue
    let v = form.value[fd.key]
    if (fd.type === 'money') v = toCents(v as number)
    if (typeof v === 'string') v = v.trim()
    if (v === '' || v === undefined) v = fd.key === 'code' || fd.key === 'pinyin' ? undefined : null
    body[fd.key] = v
  }
  const r = editing.value
    ? await run(() => api.put(`${props.endpoint}/${editing.value!.id}`, body), '已保存')
    : await run(() => api.post(props.endpoint, body), '已新增')
  if (r) {
    show.value = false
    load()
  }
}

async function remove(r: Row) {
  if (!(await confirm(`确定删除该${props.entityName}？已被业务单据引用的记录无法删除，可改为「停用」。`)))
    return
  if (await run(() => api.del(`${props.endpoint}/${r.id}`), '已删除')) load()
}

defineExpose({ form, load })
</script>

<template>
  <n-card :bordered="false">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <n-input
        v-model:value="keyword"
        placeholder="名称 / 编号 / 拼音检索码"
        clearable
        class="!w-64"
        @keyup.enter="load"
        @clear="load"
      />
      <n-button @click="load">查询</n-button>
      <div class="flex-1" />
      <n-button v-if="canWrite" type="primary" @click="open()">新增{{ entityName }}</n-button>
    </div>
    <n-data-table
      :columns="columns"
      :data="rows"
      :loading="loading"
      :row-key="(r: Row) => r.id"
      size="small"
      :pagination="{ pageSize: 20 }"
      :scroll-x="900"
    />
    <n-modal
      v-model:show="show"
      preset="card"
      :title="(editing ? '编辑' : '新增') + entityName"
      class="!w-[640px]"
    >
      <n-form label-placement="left" label-width="90">
        <n-grid :cols="2" :x-gap="12">
          <n-form-item-gi
            v-for="f in fields.filter((x) => x.inForm !== false)"
            :key="f.key"
            :span="f.type === 'textarea' ? 2 : 1"
            :label="f.label"
            :required="f.required"
          >
            <n-input-number
              v-if="f.type === 'money'"
              v-model:value="form[f.key] as number"
              :min="0"
              :precision="2"
              class="w-full"
            >
              <template #prefix>¥</template>
            </n-input-number>
            <n-input-number
              v-else-if="f.type === 'int'"
              v-model:value="form[f.key] as number"
              :min="0"
              :precision="0"
              class="w-full"
            />
            <n-switch v-else-if="f.type === 'bool'" v-model:value="form[f.key] as boolean" />
            <n-select
              v-else-if="f.type === 'select'"
              v-model:value="form[f.key] as string"
              :options="f.options"
              clearable
            />
            <n-input
              v-else-if="f.type === 'textarea'"
              v-model:value="form[f.key] as string"
              type="textarea"
              :rows="2"
            />
            <n-input
              v-else
              v-model:value="form[f.key] as string"
              :placeholder="f.placeholder"
              @update:value="(v: string) => emit('change', f.key, v, form)"
            />
          </n-form-item-gi>
        </n-grid>
      </n-form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <n-button @click="show = false">取消</n-button>
          <n-button type="primary" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>
  </n-card>
</template>
