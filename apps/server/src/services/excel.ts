/* eslint-disable @typescript-eslint/no-explicit-any */
import { centsToYuan, toDateStr, yuanToCents } from '@mediflow/shared'
import ExcelJS from 'exceljs'
import type { FastifyInstance } from 'fastify'
import { MASTER_DEFS, upsertMaster } from '../routes/master'

export type SheetKey = 'drugs' | 'suppliers' | 'staff' | 'charge-items' | 'patients'

interface Col {
  key: string
  header: string
  money?: boolean
  bool?: boolean
  int?: boolean
  width?: number
}

export const EXCEL_SHEETS: { key: SheetKey; title: string; importable: boolean; cols: Col[] }[] = [
  {
    key: 'drugs',
    title: '药品信息',
    importable: true,
    cols: [
      { key: 'code', header: '药品编号' },
      { key: 'name', header: '药品名称', width: 24 },
      { key: 'pinyin', header: '检索码' },
      { key: 'category', header: '药品类别' },
      { key: 'spec', header: '规格型号', width: 16 },
      { key: 'dosageForm', header: '剂型' },
      { key: 'unit', header: '单位' },
      { key: 'manufacturer', header: '生产厂家', width: 24 },
      { key: 'stockMin', header: '库存下限', int: true },
      { key: 'stockMax', header: '库存上限', int: true },
      { key: 'retailPrice', header: '零售价(元)', money: true },
      { key: 'remark', header: '备注' },
      { key: 'active', header: '启用', bool: true },
    ],
  },
  {
    key: 'suppliers',
    title: '供药单位',
    importable: true,
    cols: [
      { key: 'code', header: '单位编号' },
      { key: 'name', header: '单位名称', width: 28 },
      { key: 'contact', header: '联系人' },
      { key: 'phone', header: '联系电话', width: 16 },
      { key: 'address', header: '地址', width: 30 },
      { key: 'remark', header: '备注' },
      { key: 'active', header: '启用', bool: true },
    ],
  },
  {
    key: 'staff',
    title: '人员信息',
    importable: true,
    cols: [
      { key: 'code', header: '人员编号' },
      { key: 'name', header: '姓名' },
      { key: 'gender', header: '性别' },
      { key: 'title', header: '职业' },
      { key: 'isDoctor', header: '是否医生', bool: true },
      { key: 'phone', header: '联系电话', width: 16 },
      { key: 'address', header: '住址', width: 30 },
      { key: 'remark', header: '备注' },
      { key: 'active', header: '启用', bool: true },
    ],
  },
  {
    key: 'charge-items',
    title: '收费项目',
    importable: true,
    cols: [
      { key: 'code', header: '项目编号' },
      { key: 'name', header: '项目名称', width: 20 },
      { key: 'price', header: '价格(元)', money: true },
      { key: 'unit', header: '单位' },
      { key: 'active', header: '启用', bool: true },
    ],
  },
  {
    key: 'patients',
    title: '患者档案',
    importable: false,
    cols: [
      { key: 'id', header: 'ID' },
      { key: 'name', header: '姓名' },
      { key: 'gender', header: '性别' },
      { key: 'birthDate', header: '出生日期' },
      { key: 'phone', header: '联系电话', width: 16 },
      { key: 'allergies', header: '过敏史', width: 20 },
      { key: 'history', header: '既往史', width: 20 },
      { key: 'address', header: '住址', width: 30 },
    ],
  },
]

const MODEL: Record<SheetKey, string> = {
  drugs: 'drug',
  suppliers: 'supplier',
  staff: 'staff',
  'charge-items': 'chargeItem',
  patients: 'patient',
}

export async function exportWorkbook(app: FastifyInstance, keys: SheetKey[]) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MediFlow'
  for (const def of EXCEL_SHEETS.filter((s) => keys.includes(s.key))) {
    const ws = wb.addWorksheet(def.title)
    ws.columns = def.cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 12 }))
    ws.getRow(1).font = { bold: true }
    const rows = await (app.prisma as any)[MODEL[def.key]].findMany({ orderBy: { id: 'asc' } })
    for (const r of rows) {
      const o: Record<string, unknown> = {}
      for (const c of def.cols) {
        const v = r[c.key]
        o[c.key] = c.money ? centsToYuan(v ?? 0) : c.bool ? (v ? '是' : '否') : v
      }
      ws.addRow(o)
    }
  }
  return wb
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('text' in v && typeof (v as any).text === 'string') return (v as any).text
    if ('result' in v) return String((v as any).result ?? '')
    if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('')
    if (v instanceof Date) return toDateStr(v)
  }
  return String(v).trim()
}

/** 按编号新增或更新，逐行校验，返回成功与失败明细 */
export async function importSheet(app: FastifyInstance, key: SheetKey, ws: ExcelJS.Worksheet) {
  const def = EXCEL_SHEETS.find((s) => s.key === key)!
  const master = MASTER_DEFS.find((m) => m.path === key)!
  const header = (ws.getRow(1).values as ExcelJS.CellValue[]).map(cellText)
  const colIndex = new Map<string, number>()
  for (const c of def.cols) {
    const idx = header.indexOf(c.header)
    if (idx > 0) colIndex.set(c.key, idx)
  }
  if (!colIndex.has('name'))
    throw Object.assign(new Error(`表头缺少「${def.cols.find((c) => c.key === 'name')!.header}」列`), {
      statusCode: 400,
    })
  let created = 0
  let updated = 0
  const errors: { row: number; message: string }[] = []
  const delegate = (app.prisma as any)[MODEL[key]]
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const data: Record<string, unknown> = {}
    let empty = true
    for (const c of def.cols) {
      const idx = colIndex.get(c.key)
      if (!idx) continue
      const t = cellText(row.getCell(idx).value)
      if (t) empty = false
      if (c.money) data[c.key] = t ? yuanToCents(t) : 0
      else if (c.int) data[c.key] = t ? Math.trunc(Number(t)) : 0
      else if (c.bool) data[c.key] = t ? ['是', 'true', '1', 'Y', 'y'].includes(t) : c.key === 'active'
      else data[c.key] = t || (c.key === 'code' || c.key === 'pinyin' ? undefined : null)
    }
    if (empty) continue
    try {
      const existing = data.code ? await delegate.findUnique({ where: { code: data.code } }) : null
      await upsertMaster(app, master, data, existing?.id)
      if (existing) updated++
      else created++
    } catch (e: any) {
      errors.push({ row: r, message: e?.issues?.[0]?.message ?? e?.message ?? String(e) })
    }
  }
  return { created, updated, errors }
}
