// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import type { FastifyPluginAsync } from 'fastify'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { guard } from '../auth'
import { sqliteFilePath } from '../db/client'
import { badRequest } from '../errors'
import { EXCEL_SHEETS, exportWorkbook, importSheet, type SheetKey } from '../services/excel'

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export const systemRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma
  const admin = { preHandler: guard('system') }

  app.get('/system/audit-logs', admin, async (req) => {
    const q = req.query as { page?: string; pageSize?: string; keyword?: string; from?: string; to?: string }
    const page = Math.max(1, Number(q.page) || 1)
    const pageSize = Math.min(200, Number(q.pageSize) || 50)
    const where: any = {}
    if (q.keyword)
      where.OR = [
        { username: { contains: q.keyword } },
        { path: { contains: q.keyword } },
        { entity: { contains: q.keyword } },
      ]
    if (q.from || q.to)
      where.at = {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00`) } : {}),
        ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999`) } : {}),
      }
    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return { total, rows }
  })

  app.get('/system/info', admin, async () => {
    const file = sqliteFilePath(app.serverOptions.databaseUrl)
    return {
      provider: app.dbProvider,
      dbFile: file,
      dbSize: file && existsSync(file) ? statSync(file).size : null,
      dataDir: app.serverOptions.dataDir,
      counts: {
        patients: await db.patient.count(),
        visits: await db.visit.count(),
        drugs: await db.drug.count(),
        batches: await db.drugBatch.count(),
      },
    }
  })

  /** 备份（SQLite）：VACUUM INTO 生成一致性快照并下载，同时保留在 数据目录/backups */
  app.get('/system/backup', admin, async (_req, reply) => {
    if (app.dbProvider !== 'sqlite') throw badRequest('PostgreSQL 请使用 pg_dump 进行备份')
    const dir = join(app.serverOptions.dataDir, 'backups')
    mkdirSync(dir, { recursive: true })
    const name = `mediflow-${stamp()}.db`
    const target = join(dir, name)
    await db.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Disposition', `attachment; filename="${name}"`)
    return reply.send(createReadStream(target))
  })

  /** 恢复（SQLite）：校验上传文件 → 自动备份当前库 → 替换数据库文件 */
  app.post('/system/restore', admin, async (req) => {
    if (app.dbProvider !== 'sqlite') throw badRequest('PostgreSQL 请使用 pg_restore 进行恢复')
    const dbFile = sqliteFilePath(app.serverOptions.databaseUrl)
    if (!dbFile) throw badRequest('无法确定数据库文件')
    const file = await req.file()
    if (!file) throw badRequest('请上传备份文件')
    const buf = await file.toBuffer()
    if (buf.subarray(0, 16).toString('latin1') !== 'SQLite format 3\u0000')
      throw badRequest('不是有效的 SQLite 备份文件')
    const dir = join(app.serverOptions.dataDir, 'backups')
    mkdirSync(dir, { recursive: true })
    const tmp = join(dir, `restore-upload-${stamp()}.db`)
    writeFileSync(tmp, buf)
    const probe = new PrismaClient({ datasourceUrl: `file:${tmp}` })
    try {
      const rows = await probe.$queryRawUnsafe<any[]>(
        `SELECT "value" FROM "Meta" WHERE "key" = 'schema_version'`,
      )
      if (!rows.length) throw new Error()
      await probe.user.count()
    } catch {
      rmSync(tmp, { force: true })
      throw badRequest('备份文件不是 MediFlow 数据库')
    } finally {
      await probe.$disconnect()
    }
    const before = join(dir, `auto-before-restore-${stamp()}.db`)
    await db.$executeRawUnsafe(`VACUUM INTO '${before.replace(/'/g, "''")}'`)
    await db.$disconnect()
    try {
      for (const ext of ['-wal', '-shm', '-journal']) rmSync(dbFile + ext, { force: true })
      copyFileSync(tmp, dbFile)
    } finally {
      rmSync(tmp, { force: true })
      await db.$connect()
    }
    return { ok: true, autoBackup: before }
  })

  // ---- Excel 导入导出 ----
  app.get('/system/excel/sheets', admin, async () =>
    EXCEL_SHEETS.map((s) => ({ key: s.key, title: s.title, importable: s.importable })),
  )

  app.get('/system/excel/export', admin, async (req, reply) => {
    const keys = String((req.query as any).sheets || EXCEL_SHEETS.map((s) => s.key).join(','))
      .split(',')
      .filter(Boolean) as SheetKey[]
    const wb = await exportWorkbook(app, keys)
    const buf = await wb.xlsx.writeBuffer()
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="mediflow-${stamp()}.xlsx"`)
    return reply.send(Buffer.from(buf as ArrayBuffer))
  })

  app.post('/system/excel/import', admin, async (req) => {
    const file = await req.file()
    if (!file) throw badRequest('请上传 Excel 文件')
    const key = ((file.fields.sheet as any)?.value ?? (req.query as any).sheet) as SheetKey
    const def = EXCEL_SHEETS.find((s) => s.key === key && s.importable)
    if (!def) throw badRequest('请选择要导入的数据类型')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await file.toBuffer()) as any)
    const ws = wb.getWorksheet(def.title) ?? wb.worksheets[0]
    if (!ws) throw badRequest('Excel 中没有工作表')
    return importSheet(app, def.key, ws)
  })
}
