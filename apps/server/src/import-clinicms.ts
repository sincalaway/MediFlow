/**
 * 导入 inmis/Clinicms 旧数据（Clinicms.Dbi）到 MediFlow 数据库。
 *
 * 用法：
 *   pnpm import:clinicms -- --dbi /path/to/Clinicms.Dbi      # 需要 python3 + pip install access-parser
 *   pnpm import:clinicms -- --json /path/to/clinicms.json    # 先用 tools/import-clinicms/extract.py 导出
 * 目标数据库由 DATABASE_URL 决定（默认 SQLite ./data/mediflow.db）；要求业务表为空，--force 跳过检查。
 */
import { accessCurrencyToCents, pinyinCode } from '@mediflow/shared'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { optionsFromEnv } from './config'
import { createPrisma, ensureSchema, detectProvider, type Tx } from './db/client'
import { bumpCounter } from './services/numbering'
import { addMovement, findOrCreateBatch } from './services/stock'

type Row = Record<string, string | number | null>
type Dump = Record<string, Row[]>

const s = (v: unknown) => (v == null ? null : String(v).trim() || null)
const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10))
const money = (v: unknown) => accessCurrencyToCents(v == null ? 0 : Number(v))
const int = (v: unknown) => (v == null ? 0 : Math.trunc(Number(v)))

function arg(name: string) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function loadDump(): Dump {
  const json = arg('--json')
  if (json) return JSON.parse(readFileSync(resolve(json), 'utf8'))
  const dbi = arg('--dbi')
  if (!dbi) throw new Error('请指定 --dbi Clinicms.Dbi 或 --json 导出文件')
  if (!existsSync(dbi)) throw new Error(`文件不存在：${dbi}`)
  const out = join(mkdtempSync(join(tmpdir(), 'clinicms-')), 'dump.json')
  const script = resolve(process.cwd(), '../../tools/import-clinicms/extract.py')
  execFileSync(process.env.PYTHON || 'python3', [script, resolve(dbi), out], { stdio: 'inherit' })
  return JSON.parse(readFileSync(out, 'utf8'))
}

export async function importClinicms(tx: Tx, d: Dump) {
  const warnings: string[] = []
  const counts: Record<string, number> = {}
  const inc = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n)
  const T = (name: string) => d[name] ?? []

  // ---- 人员 ----
  const staffByName = new Map<string, number>()
  for (const r of T('人员信息')) {
    const st = await tx.staff.create({
      data: {
        code: s(r['人员编号'])!,
        name: s(r['姓名'])!,
        gender: s(r['性别']),
        title: s(r['职业']),
        phone: s(r['联系电话']),
        address: s(r['住址']),
        remark:
          [s(r['备注']), r['年龄'] != null ? `导入时年龄 ${r['年龄']}` : null].filter(Boolean).join('；') ||
          null,
        isDoctor: (s(r['职业']) ?? '').includes('医'),
      },
    })
    staffByName.set(st.name, st.id)
    inc('人员')
  }
  let extraStaff = 0
  const doctorId = async (name: string | null) => {
    if (!name) return null
    const hit = staffByName.get(name)
    if (hit) return hit
    extraStaff++
    const st = await tx.staff.create({
      data: {
        code: `R9${String(extraStaff).padStart(4, '0')}`,
        name,
        isDoctor: true,
        title: '医生',
        remark: '导入时由就诊记录「看诊医生」补建',
      },
    })
    staffByName.set(name, st.id)
    warnings.push(`看诊医生「${name}」不在人员信息中，已补建人员 ${st.code}`)
    inc('人员(补建)')
    return st.id
  }

  // ---- 供药单位 / 收费项目 ----
  const supplierByCode = new Map<string, number>()
  for (const r of T('供药单位')) {
    const sp = await tx.supplier.create({
      data: {
        code: s(r['单位编号'])!,
        name: s(r['单位名称'])!,
        contact: s(r['联系人']),
        phone: s(r['联系电话']),
        address: s(r['地址']),
        remark: s(r['备注']),
      },
    })
    supplierByCode.set(sp.code, sp.id)
    inc('供药单位')
  }
  const chargeByCode = new Map<string, number>()
  for (const r of T('收费项目')) {
    const ci = await tx.chargeItem.create({
      data: { code: s(r['项目编号'])!, name: s(r['项目名称'])!, price: money(r['价格']) },
    })
    chargeByCode.set(ci.code, ci.id)
    inc('收费项目')
  }

  // ---- 药品（零售价取最近一次处方单价，原系统无零售价字段）----
  const lastPrice = new Map<string, number>()
  for (const r of T('处方明细')) lastPrice.set(s(r['药品编号'])!, money(r['单价']))
  const drugByCode = new Map<string, number>()
  for (const r of T('药品信息')) {
    const name = s(r['药品名称'])!
    const dr = await tx.drug.create({
      data: {
        code: s(r['药品编号'])!,
        name,
        pinyin: (s(r['检索码']) ?? pinyinCode(name)).toUpperCase(),
        category: s(r['药品类别']),
        spec: s(r['药品型号']),
        dosageForm: s(r['剂型分类']),
        unit: s(r['单位']),
        manufacturer: s(r['生产厂家']),
        stockMin: int(r['库存下限']),
        stockMax: int(r['库存上限']),
        retailPrice: lastPrice.get(s(r['药品编号'])!) ?? 0,
        remark: s(r['备注']),
      },
    })
    drugByCode.set(dr.code, dr.id)
    inc('药品')
  }
  const drugId = (code: unknown) => {
    const id = drugByCode.get(String(code))
    if (!id) throw new Error(`未知药品编号 ${code}`)
    return id
  }
  const supplierId = (code: unknown) => {
    const id = supplierByCode.get(String(code))
    if (!id) throw new Error(`未知供药单位编号 ${code}`)
    return id
  }
  /** 旧系统靠（药品编号, 生产日期, 有效期至）隐式区分批次 → 生成显式批次，批号取生产日期 */
  const batchOf = async (r: Row, costPrice: number, supplier: number | null) => {
    const b = await findOrCreateBatch(tx, {
      drugId: drugId(r['药品编号']),
      batchNo: null,
      mfgDate: day(r['生产日期']),
      expiryDate: day(r['有效期至']) ?? '1900-01-01',
      costPrice,
      supplierId: supplier,
    })
    return b.id
  }

  // ---- 入库 ----
  const lines = T('药品入库从表')
  for (const h of T('药品入库主表')) {
    const no = s(h['入库编号'])!
    const date = day(h['入库日期'])!
    const sup = supplierId(h['单位编号'])
    const po = await tx.purchaseOrder.create({
      data: { orderNo: no, supplierId: sup, orderDate: date, handler: s(h['经办人']), remark: s(h['备注']) },
    })
    let total = 0
    for (const l of lines.filter((x) => x['入库编号'] === no)) {
      const cost = money(l['单价'])
      const qty = int(l['数量'])
      const batchId = await batchOf(l, cost, sup)
      await tx.purchaseOrderLine.create({
        data: { orderId: po.id, drugId: drugId(l['药品编号']), batchId, quantity: qty, costPrice: cost },
      })
      await addMovement(tx, {
        batchId,
        type: 'IN',
        quantity: qty,
        unitPrice: cost,
        refType: 'PO',
        refId: po.id,
        refNo: no,
        occurredAt: new Date(`${date}T00:00:00`),
        remark: '导入',
      })
      total += qty * cost
      inc('入库明细')
    }
    if (total !== money(h['总金额']))
      warnings.push(
        `入库单 ${no}：明细合计 ${total / 100} 与原总金额 ${money(h['总金额']) / 100} 不一致，以明细为准`,
      )
    const paid = money(h['实付金额'])
    if (paid > 0) {
      await tx.payment.create({
        data: {
          kind: 'SUPPLIER',
          supplierId: sup,
          purchaseOrderId: po.id,
          amount: paid,
          paidAt: date,
          method: '其他',
          remark: `入库单 ${no} 实付（导入）`,
        },
      })
      inc('供应商付款')
    }
    inc('入库单')
  }

  // ---- 退货 ----
  const rlines = T('药品退货从表')
  for (const h of T('药品退货主表')) {
    const no = s(h['退货编号'])!
    const date = day(h['退货日期'])!
    const sup = supplierId(h['单位编号'])
    const ret = await tx.supplierReturn.create({
      data: {
        returnNo: no,
        supplierId: sup,
        returnDate: date,
        handler: s(h['经办人']),
        remark: s(h['备注']),
      },
    })
    for (const l of rlines.filter((x) => x['退货编号'] === no)) {
      const price = money(l['单价'])
      const qty = int(l['数量'])
      const batchId = await batchOf(l, price, null)
      await tx.supplierReturnLine.create({
        data: { returnId: ret.id, batchId, quantity: qty, unitPrice: price },
      })
      const b = await tx.drugBatch.findUniqueOrThrow({ where: { id: batchId } })
      const force = b.stock < qty
      if (force)
        warnings.push(
          `退货单 ${no}：批次 ${b.batchNo} 库存 ${b.stock} 小于退货 ${qty}，原系统未校验，已按原数据导入（库存为负）`,
        )
      await addMovement(tx, {
        batchId,
        type: 'RETURN',
        quantity: -qty,
        unitPrice: price,
        refType: 'RETURN',
        refId: ret.id,
        refNo: no,
        occurredAt: new Date(`${date}T00:00:00`),
        remark: '导入',
        force,
      })
      inc('退货明细')
    }
    inc('退货单')
  }

  // ---- 就诊（患者按 姓名+电话 去重建档）----
  const patientKey = new Map<string, number>()
  const items = T('处方明细')
  const others = T('其他项目表')
  const repays = T('患者付欠款明细')
  const orphan = others.filter((o) => !o['就诊编号'])
  if (orphan.length) warnings.push(`其他项目表有 ${orphan.length} 行没有就诊编号，已跳过`)
  for (const v of T('就诊登记')) {
    const no = s(v['就诊编号'])!
    const date = day(v['就诊日期'])!
    const name = s(v['患者姓名']) ?? '未知'
    const phone = s(v['联系方式'])
    const key = `${name}|${phone ?? ''}`
    let pid = patientKey.get(key)
    if (!pid) {
      const p = await tx.patient.create({
        data: {
          name,
          pinyin: pinyinCode(name),
          gender: s(v['性别']),
          phone,
          allergies: s(v['药物过敏史']),
          history: s(v['病史']),
          remark: v['年龄'] != null ? `${date} 就诊时年龄 ${v['年龄']}` : null,
        },
      })
      pid = p.id
      patientKey.set(key, pid)
      inc('患者')
    }
    const visit = await tx.visit.create({
      data: {
        visitNo: no,
        patientId: pid,
        doctorId: await doctorId(s(v['看诊医生'])),
        visitDate: new Date(`${date}T00:00:00`),
        chiefComplaint: s(v['主诉']),
        history: s(v['病史']),
        diagnosis: s(v['诊断']),
        remark: s(v['备注']),
        status: 'DISPENSED',
        dispensedAt: new Date(`${date}T00:00:00`),
      },
    })
    let drugFee = 0
    let sort = 0
    for (const it of items.filter((x) => x['就诊编号'] === no)) {
      const price = money(it['单价'])
      const qty = int(it['数量'])
      const batchId = await batchOf(it, 0, null)
      await tx.prescriptionItem.create({
        data: {
          visitId: visit.id,
          drugId: drugId(it['药品编号']),
          batchId,
          quantity: qty,
          unitPrice: price,
          sort: sort++,
        },
      })
      const b = await tx.drugBatch.findUniqueOrThrow({ where: { id: batchId } })
      const force = b.stock < qty
      if (force) warnings.push(`就诊 ${no}：批次 ${b.batchNo} 库存不足（原系统未校验），已按原数据导入`)
      await addMovement(tx, {
        batchId,
        type: 'DISPENSE',
        quantity: -qty,
        unitPrice: price,
        refType: 'VISIT',
        refId: visit.id,
        refNo: no,
        occurredAt: new Date(`${date}T00:00:00`),
        remark: '导入',
        force,
      })
      drugFee += qty * price
      inc('处方明细')
    }
    let otherFee = 0
    for (const o of others.filter((x) => x['就诊编号'] === no)) {
      const cid = chargeByCode.get(String(o['项目编号']))
      if (!cid) {
        warnings.push(`就诊 ${no}：未知收费项目 ${o['项目编号']}，已跳过`)
        continue
      }
      await tx.visitChargeItem.create({
        data: { visitId: visit.id, chargeItemId: cid, quantity: 1, unitPrice: money(o['价格']) },
      })
      otherFee += money(o['价格'])
      inc('其他项目')
    }
    if (drugFee !== money(v['药品费用']))
      warnings.push(
        `就诊 ${no}：处方合计 ${drugFee / 100} 与原「药品费用」${money(v['药品费用']) / 100} 不一致，以明细为准`,
      )
    if (otherFee !== money(v['其他费用']))
      warnings.push(
        `就诊 ${no}：其他项目合计 ${otherFee / 100} 与原「其他费用」${money(v['其他费用']) / 100} 不一致，以明细为准`,
      )
    const paid = money(v['已付款'])
    if (paid > 0) {
      await tx.payment.create({
        data: {
          kind: 'PATIENT',
          visitId: visit.id,
          patientId: pid,
          amount: paid,
          method: s(v['付款方式']) ?? '现金',
          paidAt: date,
          receivedBy: s(v['收款人']),
          remark: '导入',
        },
      })
      inc('患者收款')
    }
    let repaid = 0
    for (const r of repays.filter((x) => x['就诊编号'] === no)) {
      await tx.payment.create({
        data: {
          kind: 'PATIENT_REPAY',
          visitId: visit.id,
          patientId: pid,
          amount: money(r['付款金额']),
          method: '现金',
          paidAt: day(r['付款日期'])!,
          receivedBy: s(r['收款人']),
          remark: '导入（患者付欠款明细）',
        },
      })
      repaid += money(r['付款金额'])
      inc('患者还款')
    }
    if (repaid !== money(v['后付款']))
      warnings.push(
        `就诊 ${no}：还款明细合计 ${repaid / 100} 与原「后付款」${money(v['后付款']) / 100} 不一致，以明细为准`,
      )
    const owed = drugFee + otherFee - paid - repaid
    if (owed !== money(v['欠付款']))
      warnings.push(
        `就诊 ${no}：计算欠款 ${owed / 100} 与原手填「欠付款」${money(v['欠付款']) / 100} 不一致，以计算为准`,
      )
    inc('就诊')
  }

  // ---- 付供药单位货款 ----
  for (const r of T('付供药单位货款登记')) {
    await tx.payment.create({
      data: {
        kind: 'SUPPLIER',
        docNo: s(r['付款编号']),
        supplierId: supplierId(r['单位编号']),
        amount: money(r['付款金额']),
        paidAt: day(r['付款日期'])!,
        method: '其他',
        remark: s(r['备注']) ?? '导入',
      },
    })
    inc('供应商付款')
  }

  // 主数据编号计数器推进到已有最大值之后
  const maxNum = (codes: string[]) =>
    Math.max(0, ...codes.map((c) => Number(c.replace(/\D/g, '')) || 0).filter((n) => n < 90000))
  await bumpCounter(tx, 'CODE_Y', maxNum([...drugByCode.keys()]))
  await bumpCounter(tx, 'CODE_D', maxNum([...supplierByCode.keys()]))
  await bumpCounter(tx, 'CODE_X', maxNum([...chargeByCode.keys()]))
  await bumpCounter(
    tx,
    'CODE_R',
    maxNum((await tx.staff.findMany({ select: { code: true } })).map((x) => x.code)),
  )
  counts['批次'] = await tx.drugBatch.count()
  return { counts, warnings }
}

async function main() {
  const opts = optionsFromEnv()
  const prisma = createPrisma(opts.databaseUrl)
  await ensureSchema(prisma, detectProvider(opts.databaseUrl), opts.databaseUrl)
  const dump = loadDump()
  if (!process.argv.includes('--force')) {
    const n = (await prisma.drug.count()) + (await prisma.visit.count()) + (await prisma.supplier.count())
    if (n > 0) throw new Error('目标数据库已有业务数据。请使用空库，或加 --force 强制导入（编号冲突会失败）')
  }
  const { counts, warnings } = await prisma.$transaction((tx) => importClinicms(tx, dump), {
    timeout: 600000,
  })
  console.log('\n导入完成：', opts.databaseUrl.replace(/\?.*$/, ''))
  console.table(counts)
  if (warnings.length) {
    console.log(`\n警告 ${warnings.length} 条：`)
    for (const w of warnings) console.log(' - ' + w)
  }
  const stock = await prisma.drugBatch.findMany({ include: { drug: true } })
  console.log('\n批次库存：')
  console.table(
    stock.map((b) => ({ 药品: b.drug.name, 批号: b.batchNo, 有效期至: b.expiryDate, 库存: b.stock })),
  )
  await prisma.$disconnect()
}

if (process.argv[1] && /import-clinicms/.test(process.argv[1])) {
  main().catch((e) => {
    console.error('导入失败：', e.message ?? e)
    process.exit(1)
  })
}
