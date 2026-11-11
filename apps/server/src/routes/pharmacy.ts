import {
  periodQuerySchema,
  purchaseOrderSchema,
  stockAdjustSchema,
  supplierReturnSchema,
} from '@mediflow/shared'
import type { FastifyPluginAsync } from 'fastify'
import { currentUser, guard } from '../auth'
import { intParam } from '../db/search'
import {
  overstock,
  purchaseStats,
  returnStats,
  shortage,
  stockByBatch,
  stockByDrug,
  type BatchFilter,
} from '../services/reports'
import { adjustBatch, createPurchaseOrder, createSupplierReturn } from '../services/stock'

export const pharmacyRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma
  const read = { preHandler: guard('pharmacy.read', 'visit') }
  const write = { preHandler: guard('pharmacy') }

  // ---- 入库单 ----
  app.get('/purchase-orders', read, async (req) => {
    const q = req.query as { from?: string; to?: string; supplierId?: string }
    const orders = await db.purchaseOrder.findMany({
      where: {
        ...(q.from || q.to
          ? { orderDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
          : {}),
        ...(q.supplierId ? { supplierId: Number(q.supplierId) } : {}),
      },
      include: { supplier: { select: { id: true, name: true } }, lines: true, payments: true },
      orderBy: [{ orderDate: 'desc' }, { id: 'desc' }],
      take: 500,
    })
    return orders.map(({ lines, payments, ...o }) => ({
      ...o,
      lineCount: lines.length,
      total: lines.reduce((s, l) => s + l.quantity * l.costPrice, 0),
      paidNow: payments.reduce((s, p) => s + p.amount, 0),
    }))
  })

  app.get('/purchase-orders/:id', read, async (req) => {
    const o = await db.purchaseOrder.findUniqueOrThrow({
      where: { id: intParam((req.params as { id: string }).id) },
      include: { supplier: true, lines: { include: { drug: true, batch: true } }, payments: true },
    })
    return { ...o, total: o.lines.reduce((s, l) => s + l.quantity * l.costPrice, 0) }
  })

  app.post('/purchase-orders', write, async (req) => {
    const b = purchaseOrderSchema.parse(req.body)
    const u = currentUser(req)
    return db.$transaction((tx) => createPurchaseOrder(tx, b, u.id, u.displayName))
  })

  // ---- 退货单 ----
  app.get('/supplier-returns', read, async (req) => {
    const q = req.query as { from?: string; to?: string }
    const list = await db.supplierReturn.findMany({
      where:
        q.from || q.to
          ? { returnDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
          : {},
      include: { supplier: { select: { id: true, name: true } }, lines: true },
      orderBy: [{ returnDate: 'desc' }, { id: 'desc' }],
      take: 500,
    })
    return list.map(({ lines, ...r }) => ({
      ...r,
      lineCount: lines.length,
      total: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    }))
  })

  app.get('/supplier-returns/:id', read, async (req) => {
    const r = await db.supplierReturn.findUniqueOrThrow({
      where: { id: intParam((req.params as { id: string }).id) },
      include: { supplier: true, lines: { include: { batch: { include: { drug: true } } } } },
    })
    return { ...r, total: r.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) }
  })

  app.post('/supplier-returns', write, async (req) => {
    const b = supplierReturnSchema.parse(req.body)
    const u = currentUser(req)
    return db.$transaction((tx) => createSupplierReturn(tx, b, u.id))
  })

  // ---- 库存 ----
  app.get('/stock/batches', read, async (req) => {
    const q = req.query as { filter?: BatchFilter; keyword?: string; drugId?: string; includeEmpty?: string }
    const rows = await stockByBatch(db, {
      filter: q.filter ?? 'all',
      keyword: q.keyword,
      includeEmpty: q.includeEmpty === '1',
    })
    return q.drugId ? rows.filter((r) => r.drugId === Number(q.drugId)) : rows
  })
  app.get('/stock/drugs', read, async (req) => stockByDrug(db, (req.query as { keyword?: string }).keyword))
  app.get('/stock/shortage', read, async () => shortage(db))
  app.get('/stock/overstock', read, async () => overstock(db))
  app.get('/stock/movements', read, async (req) => {
    const q = req.query as { batchId?: string; drugId?: string }
    return db.stockMovement.findMany({
      where: {
        ...(q.batchId ? { batchId: Number(q.batchId) } : {}),
        ...(q.drugId ? { batch: { drugId: Number(q.drugId) } } : {}),
      },
      include: { batch: { include: { drug: { select: { name: true } } } } },
      orderBy: { id: 'desc' },
      take: 500,
    })
  })
  app.post('/stock/adjust', write, async (req) => {
    const b = stockAdjustSchema.parse(req.body)
    const u = currentUser(req)
    return db.$transaction((tx) => adjustBatch(tx, b.batchId, b.actualQuantity, u.id, b.remark))
  })

  // ---- 期间统计 ----
  app.get('/stats/purchases', read, async (req) => {
    const q = periodQuerySchema.parse(req.query)
    return purchaseStats(db, q.from, q.to)
  })
  app.get('/stats/returns', read, async (req) => {
    const q = periodQuerySchema.parse(req.query)
    return returnStats(db, q.from, q.to)
  })
}
