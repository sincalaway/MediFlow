// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import { formatMoney, toDateStr } from '@mediflow/shared'
import dayjs from 'dayjs'
import { createDiscreteApi } from 'naive-ui'
import { ApiError } from './api'

export const { message, dialog } = createDiscreteApi(['message', 'dialog'])

export const money = (cents: number | null | undefined) => formatMoney(cents ?? 0)
export const yuan = (cents: number | null | undefined) => (cents ?? 0) / 100
export const toCents = (yuanValue: number | null | undefined) => Math.round((yuanValue ?? 0) * 100)
export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? dayjs(d).format('YYYY-MM-DD HH:mm') : ''
export const fmtDate = (d: string | Date | null | undefined) => (d ? dayjs(d).format('YYYY-MM-DD') : '')
export const today = () => toDateStr()
export const monthStart = () => dayjs().startOf('month').format('YYYY-MM-DD')

/** 日期选择器（时间戳）与 YYYY-MM-DD 互转 */
export const tsToDate = (ts: number | null | undefined) =>
  ts == null ? undefined : dayjs(ts).format('YYYY-MM-DD')
export const dateToTs = (d: string | null | undefined) => (d ? dayjs(d).valueOf() : null)

export function showError(e: unknown) {
  const msg = e instanceof ApiError || e instanceof Error ? e.message : String(e)
  message.error(msg, { duration: 5000 })
}

/** 包装异步操作：失败时弹出错误提示 */
export async function run<T>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> {
  try {
    const r = await fn()
    if (okMsg) message.success(okMsg)
    return r
  } catch (e) {
    showError(e)
    return undefined
  }
}

export function confirm(content: string, title = '请确认'): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.warning({
      title,
      content,
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => resolve(false),
    })
  })
}
