<!-- MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuth } from '../stores/auth'
import { money, today } from '../utils'

const auth = useAuth()
const stats = ref({
  visits: 0,
  received: 0,
  shortage: 0,
  overstock: 0,
  near: 0,
  expired: 0,
  debts: 0,
  debtAmount: 0,
})

onMounted(async () => {
  const t = today()
  const jobs: Promise<unknown>[] = []
  if (auth.can('visit.read'))
    jobs.push(api.get<unknown[]>('/visits', { from: t, to: t }).then((r) => (stats.value.visits = r.length)))
  if (auth.can('finance'))
    jobs.push(
      api
        .get<{ sum: { received: number } }>('/finance/income', { from: t, to: t })
        .then((r) => (stats.value.received = r.sum.received)),
    )
  if (auth.can('pharmacy.read')) {
    jobs.push(api.get<unknown[]>('/stock/shortage').then((r) => (stats.value.shortage = r.length)))
    jobs.push(api.get<unknown[]>('/stock/overstock').then((r) => (stats.value.overstock = r.length)))
    jobs.push(
      api.get<unknown[]>('/stock/batches', { filter: 'near' }).then((r) => (stats.value.near = r.length)),
    )
    jobs.push(
      api
        .get<unknown[]>('/stock/batches', { filter: 'expired' })
        .then((r) => (stats.value.expired = r.length)),
    )
  }
  if (auth.can('charge', 'patient'))
    jobs.push(
      api.get<{ owed: number }[]>('/finance/patient-debts').then((r) => {
        stats.value.debts = r.length
        stats.value.debtAmount = r.reduce((s, x) => s + x.owed, 0)
      }),
    )
  await Promise.allSettled(jobs)
})
</script>

<template>
  <div class="space-y-4">
    <n-card :bordered="false">
      <div class="text-lg">您好，{{ auth.me?.displayName }}！今天是 {{ today() }}。</div>
    </n-card>
    <n-grid :cols="4" :x-gap="16" :y-gap="16" responsive="screen" item-responsive>
      <n-gi v-if="auth.can('visit.read')" span="4 m:2 l:1">
        <n-card :bordered="false"><n-statistic label="今日就诊" :value="stats.visits" /></n-card>
      </n-gi>
      <n-gi v-if="auth.can('finance')" span="4 m:2 l:1">
        <n-card :bordered="false"
          ><n-statistic label="今日实收"
            ><span class="money">{{ money(stats.received) }}</span></n-statistic
          ></n-card
        >
      </n-gi>
      <n-gi v-if="auth.can('charge', 'patient')" span="4 m:2 l:1">
        <n-card :bordered="false">
          <n-statistic label="患者欠款"
            ><router-link to="/clinic/debts" class="money"
              >{{ stats.debts }} 笔 / {{ money(stats.debtAmount) }}</router-link
            ></n-statistic
          >
        </n-card>
      </n-gi>
      <template v-if="auth.can('pharmacy.read')">
        <n-gi span="4 m:2 l:1">
          <n-card :bordered="false"
            ><n-statistic label="缺货药品"
              ><router-link to="/pharmacy/shortage">{{ stats.shortage }}</router-link></n-statistic
            ></n-card
          >
        </n-gi>
        <n-gi span="4 m:2 l:1">
          <n-card :bordered="false"
            ><n-statistic label="超储药品"
              ><router-link to="/pharmacy/overstock">{{ stats.overstock }}</router-link></n-statistic
            ></n-card
          >
        </n-gi>
        <n-gi span="4 m:2 l:1">
          <n-card :bordered="false"
            ><n-statistic label="近效期批次（30 天）"
              ><router-link to="/pharmacy/stock?filter=near">{{ stats.near }}</router-link></n-statistic
            ></n-card
          >
        </n-gi>
        <n-gi span="4 m:2 l:1">
          <n-card :bordered="false"
            ><n-statistic label="已过期仍有库存批次"
              ><router-link to="/pharmacy/stock?filter=expired">{{ stats.expired }}</router-link></n-statistic
            ></n-card
          >
        </n-gi>
      </template>
    </n-grid>
  </div>
</template>
