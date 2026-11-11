<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { ROLE_LABELS, ROLES, type Role } from '@mediflow/shared'
import type { DataTableColumns } from 'naive-ui'
import { h, onMounted, ref } from 'vue'
import { api } from '../../api'
import { confirm, fmtDateTime, run } from '../../utils'

interface UserRow {
  id: number
  username: string
  displayName: string
  role: Role
  active: boolean
  staffId: number | null
  lastLoginAt: string | null
  mustChangePassword: boolean
}
const rows = ref<UserRow[]>([])
const staff = ref<{ label: string; value: number }[]>([])
const show = ref(false)
const editing = ref<UserRow | null>(null)
const form = ref({
  username: '',
  displayName: '',
  role: 'doctor' as Role,
  password: '',
  staffId: null as number | null,
  active: true,
})
const roleOptions = ROLES.map((r) => ({ label: ROLE_LABELS[r], value: r }))

async function load() {
  rows.value = (await run(() => api.get<UserRow[]>('/users'))) ?? []
  const s = (await run(() => api.get<{ id: number; name: string; code: string }[]>('/staff'))) ?? []
  staff.value = s.map((x) => ({ label: `${x.name}（${x.code}）`, value: x.id }))
}
onMounted(load)

const columns: DataTableColumns<UserRow> = [
  { title: '用户名', key: 'username' },
  { title: '姓名', key: 'displayName' },
  { title: '角色', key: 'role', render: (r) => ROLE_LABELS[r.role] },
  {
    title: '状态',
    key: 'active',
    render: (r) => (r.active ? '启用' : '停用') + (r.mustChangePassword ? '（待改密）' : ''),
  },
  { title: '最后登录', key: 'lastLoginAt', render: (r) => fmtDateTime(r.lastLoginAt) },
  {
    title: '操作',
    key: 'op',
    render: (r) =>
      h('div', { class: 'flex gap-2' }, [
        h('a', { class: 'cursor-pointer text-teal-700', onClick: () => open(r) }, '编辑'),
        h('a', { class: 'cursor-pointer text-red-600', onClick: () => remove(r) }, '删除'),
      ]),
  },
]

function open(r?: UserRow) {
  editing.value = r ?? null
  form.value = r
    ? {
        username: r.username,
        displayName: r.displayName,
        role: r.role,
        password: '',
        staffId: r.staffId,
        active: r.active,
      }
    : { username: '', displayName: '', role: 'doctor', password: '', staffId: null, active: true }
  show.value = true
}

async function save() {
  const ok = editing.value
    ? await run(() => api.put(`/users/${editing.value!.id}`, form.value), '已保存')
    : await run(() => api.post('/users', form.value), '已创建，用户首次登录需修改密码')
  if (ok) {
    show.value = false
    load()
  }
}

async function remove(r: UserRow) {
  if (await confirm(`确定删除用户 ${r.username}？`))
    if (await run(() => api.del(`/users/${r.id}`), '已删除')) load()
}
</script>

<template>
  <n-card :bordered="false">
    <n-alert type="info" :bordered="false" class="mb-3">
      角色权限：管理员 = 全部功能；医生 = 患者档案、就诊/处方、发药、查看库存；药剂师 =
      药品与供药单位、入库/退货/库存、发药；收费员 =
      收费、患者欠款、财务报表、收费项目。新建或重置密码的用户首次登录必须修改密码。
    </n-alert>
    <div class="mb-3 flex justify-end"><n-button type="primary" @click="open()">新增用户</n-button></div>
    <n-data-table :columns="columns" :data="rows" size="small" />
    <n-modal v-model:show="show" preset="card" :title="editing ? '编辑用户' : '新增用户'" class="!w-[480px]">
      <n-form label-placement="left" label-width="80">
        <n-form-item label="用户名" required
          ><n-input v-model:value="form.username" :disabled="!!editing"
        /></n-form-item>
        <n-form-item label="姓名" required><n-input v-model:value="form.displayName" /></n-form-item>
        <n-form-item label="角色" required
          ><n-select v-model:value="form.role" :options="roleOptions"
        /></n-form-item>
        <n-form-item label="关联人员"
          ><n-select v-model:value="form.staffId" :options="staff" clearable filterable
        /></n-form-item>
        <n-form-item :label="editing ? '重置密码' : '初始密码'" :required="!editing">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            :placeholder="editing ? '留空则不修改' : '至少 6 位'"
          />
        </n-form-item>
        <n-form-item label="启用"><n-switch v-model:value="form.active" /></n-form-item>
      </n-form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <n-button @click="show = false">取消</n-button
          ><n-button type="primary" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>
  </n-card>
</template>
