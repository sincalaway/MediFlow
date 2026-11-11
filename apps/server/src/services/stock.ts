import {
  allocateFefo,
  InsufficientStockError,
  toDateStr,
  type MovementType,
  type PurchaseOrderInput,
  type SupplierReturnInput,
} from '@mediflow/shared'
import type { Tx } from '../db/client'
import { badRequest, notFound } from '../errors'
import { nextDocNo } from './numbering'

export interface MovementInput {
  batchId: number
  type: MovementType
  /** 带符号数量：入库为正，出库/退货为负 */
  quantity: number
  unitPrice?: number
  refType?: string
  refId?: number
  refNo?: string
  userId?: number | null
  remark?: string | null
  occurredAt?: Date
  /** 仅供历史数据导入：跳过库存校验（导入脚本会记录警告） */
  force?: boolean
}

/**
 * 写台账并在同一事务内维护批次库存缓存。
 * 出库方向使用带条件更新（stock >= 需求量），并发下也不会出现负库存。
 */
export async function addMovement(tx: Tx, m: MovementInput) {
  if (!Number.isInteger(m.quantity) || m.quantity === 0) throw badRequest('数量无效')
  if (m.quantity < 0 && m.force) {
    await tx.drugBatch.update({ where: { id: m.batchId }, data: { stock: { increment: m.quantity } } })
  } else if (m.quantity < 0) {
    const need = -m.quantity
    const res = await tx.drugBatch.updateMany({
      where: { id: m.batchId, stock: { gte: need } },
      data: { stock: { decrement: need } },
    })
    if (res.count !== 1) {
      const b = await tx.drugBatch.findUnique({ where: { id: m.batchId }, include: { drug: true } })
      if (!b) throw notFound('批次不存在')
      throw new InsufficientStockError(need, b.stock, `${b.drug.name}（批号 ${b.batchNo}）`)
    }
  } else {
    await tx.drugBatch.update({ where: { id: m.batchId }, data: { stock: { increment: m.quantity } } })
  }
  return tx.stockMovement.create({
    data: {
      batchId: m.batchId,
      type: m.type,
      quantity: m.quantity,
      unitPrice: m.unitPrice ?? 0,
      refType: m.refType,
      refId: m.refId,
      refNo: m.refNo,
      userId: m.userId ?? null,
      remark: m.remark ?? null,
      occurredAt: m.occurredAt ?? new Date(),
    },
  })
}

export async function findOrCreateBatch(
  tx: Tx,
  b: {
    drugId: number
    batchNo?: string | null
    mfgDate?: string | null
    expiryDate: string
    costPrice: number
    supplierId?: number | null
  },
) {
  const batchNo =
    b.batchNo?.trim() || (b.mfgDate ? b.mfgDate.replace(/-/g, '') : b.expiryDate.replace(/-/g, ''))
  const existing = await tx.drugBatch.findUnique({
    where: { drugId_batchNo_expiryDate: { drugId: b.drugId, batchNo, expiryDate: b.expiryDate } },
  })
  if (existing) return existing
  return tx.drugBatch.create({
    data: {
      drugId: b.drugId,
      batchNo,
      mfgDate: b.mfgDate ?? null,
      expiryDate: b.expiryDate,
      costPrice: b.costPrice,
      supplierId: b.supplierId ?? null,
    },
  })
}

/** 入库单：生成 RK 单号，按 (药品, 批号, 有效期) 建批次，写 IN 台账；可同时登记当场付款 */
export async function createPurchaseOrder(
  tx: Tx,
  input: PurchaseOrderInput,
  userId: number | null,
  username?: string,
) {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
  if (!supplier) throw notFound('供药单位不存在')
  const orderDate = input.orderDate ?? toDateStr()
  const orderNo = await nextDocNo(tx, 'RK', orderDate)
  const order = await tx.purchaseOrder.create({
    data: {
      orderNo,
      supplierId: supplier.id,
      orderDate,
      handler: input.handler,
      remark: input.remark,
      createdById: userId,
    },
  })
  let total = 0
  for (const line of input.lines) {
    const drug = await tx.drug.findUnique({ where: { id: line.drugId } })
    if (!drug) throw notFound(`药品 ${line.drugId} 不存在`)
    if (line.mfgDate && line.mfgDate >= line.expiryDate)
      throw badRequest(`${drug.name}：生产日期必须早于有效期`)
    const batch = await findOrCreateBatch(tx, { ...line, supplierId: supplier.id })
    await tx.purchaseOrderLine.create({
      data: {
        orderId: order.id,
        drugId: drug.id,
        batchId: batch.id,
        quantity: line.quantity,
        costPrice: line.costPrice,
      },
    })
    await addMovement(tx, {
      batchId: batch.id,
      type: 'IN',
      quantity: line.quantity,
      unitPrice: line.costPrice,
      refType: 'PO',
      refId: order.id,
      refNo: orderNo,
      userId,
    })
    total += line.quantity * line.costPrice
  }
  if (input.paidNow > 0) {
    if (input.paidNow > total) throw badRequest('当场付款不能超过入库总额')
    await tx.payment.create({
      data: {
        kind: 'SUPPLIER',
        docNo: await nextDocNo(tx, 'GF', orderDate),
        supplierId: supplier.id,
        purchaseOrderId: order.id,
        amount: input.paidNow,
        method: input.payMethod,
        paidAt: orderDate,
        receivedBy: username,
        remark: `入库单 ${orderNo} 当场付款`,
      },
    })
  }
  return { ...order, total }
}

/** 退货单：退货数量不能超过批次当前库存 */
export async function createSupplierReturn(tx: Tx, input: SupplierReturnInput, userId: number | null) {
  const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } })
  if (!supplier) throw notFound('供药单位不存在')
  const returnDate = input.returnDate ?? toDateStr()
  const returnNo = await nextDocNo(tx, 'TH', returnDate)
  const ret = await tx.supplierReturn.create({
    data: {
      returnNo,
      supplierId: supplier.id,
      returnDate,
      handler: input.handler,
      remark: input.remark,
      createdById: userId,
    },
  })
  let total = 0
  for (const line of input.lines) {
    await tx.supplierReturnLine.create({
      data: { returnId: ret.id, batchId: line.batchId, quantity: line.quantity, unitPrice: line.unitPrice },
    })
    await addMovement(tx, {
      batchId: line.batchId,
      type: 'RETURN',
      quantity: -line.quantity,
      unitPrice: line.unitPrice,
      refType: 'RETURN',
      refId: ret.id,
      refNo: returnNo,
      userId,
    })
    total += line.quantity * line.unitPrice
  }
  return { ...ret, total }
}

/**
 * 按 FEFO 为就诊处方发药：未分配批次的处方行被拆分为按批次的行，写 DISPENSE 台账。
 * 任一药品有效库存不足则抛错，整个事务回滚。
 */
export async function dispenseVisit(tx: Tx, visitId: number, userId: number | null, today = toDateStr()) {
  const visit = await tx.visit.findUnique({
    where: { id: visitId },
    include: { items: { include: { drug: true } } },
  })
  if (!visit) throw notFound('就诊记录不存在')
  if (visit.status === 'CANCELLED') throw badRequest('就诊已作废')
  const pending = visit.items.filter((i) => i.batchId == null)
  for (const item of pending) {
    const batches = await tx.drugBatch.findMany({
      where: { drugId: item.drugId, stock: { gt: 0 } },
      select: { id: true, expiryDate: true, stock: true },
    })
    let allocs
    try {
      allocs = allocateFefo(batches, item.quantity, today)
    } catch (e) {
      if (e instanceof InsufficientStockError)
        throw new InsufficientStockError(e.required, e.available, item.drug.name)
      throw e
    }
    await tx.prescriptionItem.delete({ where: { id: item.id } })
    for (const a of allocs) {
      await tx.prescriptionItem.create({
        data: {
          visitId,
          drugId: item.drugId,
          batchId: a.batchId,
          quantity: a.quantity,
          unitPrice: item.unitPrice,
          usage: item.usage,
          sort: item.sort,
        },
      })
      await addMovement(tx, {
        batchId: a.batchId,
        type: 'DISPENSE',
        quantity: -a.quantity,
        unitPrice: item.unitPrice,
        refType: 'VISIT',
        refId: visitId,
        refNo: visit.visitNo,
        userId,
      })
    }
  }
  return tx.visit.update({ where: { id: visitId }, data: { status: 'DISPENSED', dispensedAt: new Date() } })
}

/** 盘点调整：把批次库存调整到实际数量，差额写 ADJUST 台账 */
export async function adjustBatch(
  tx: Tx,
  batchId: number,
  actual: number,
  userId: number | null,
  remark?: string | null,
) {
  const b = await tx.drugBatch.findUnique({ where: { id: batchId } })
  if (!b) throw notFound('批次不存在')
  const diff = actual - b.stock
  if (diff === 0) return b
  await addMovement(tx, { batchId, type: 'ADJUST', quantity: diff, refType: 'ADJUST', userId, remark })
  return tx.drugBatch.findUniqueOrThrow({ where: { id: batchId } })
}
