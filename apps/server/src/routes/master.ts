/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  chargeItemSchema,
  drugSchema,
  pinyinCode,
  staffSchema,
  supplierSchema,
  type ModuleKey,
} from '@mediflow/shared'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { ZodTypeAny } from 'zod'
import { guard } from '../auth'
import { contains, intParam } from '../db/search'
import { nextCode, type CodePrefix } from '../services/numbering'

interface MasterDef {
  path: string
  model: 'staff' | 'supplier' | 'chargeItem' | 'drug'
  schema: ZodTypeAny
  prefix: CodePrefix
  writeModule: ModuleKey
  searchFields: string[]
  /** 保存前处理（如生成拼音码） */
  prepare?: (data: any) => any
}

const defs: MasterDef[] = [
  {
    path: 'staff',
    model: 'staff',
    schema: staffSchema,
    prefix: 'R',
    writeModule: 'basic.staff',
    searchFields: ['name', 'code', 'phone'],
  },
  {
    path: 'suppliers',
    model: 'supplier',
    schema: supplierSchema,
    prefix: 'D',
    writeModule: 'basic.supplier',
    searchFields: ['name', 'code', 'contact'],
  },
  {
    path: 'charge-items',
    model: 'chargeItem',
    schema: chargeItemSchema,
    prefix: 'X',
    writeModule: 'basic.chargeItem',
    searchFields: ['name', 'code'],
  },
  {
    path: 'drugs',
    model: 'drug',
    schema: drugSchema,
    prefix: 'Y',
    writeModule: 'basic.drug',
    searchFields: ['name', 'code', 'pinyin', 'manufacturer'],
    prepare: (d) => ({ ...d, pinyin: (d.pinyin || pinyinCode(d.name)).toUpperCase() }),
  },
]

export async function upsertMaster(app: FastifyInstance, def: MasterDef, raw: unknown, id?: number) {
  const data = def.schema.parse(raw)
  const prepared = def.prepare ? def.prepare(data) : data
  return app.prisma.$transaction(async (tx) => {
    const delegate = (tx as any)[def.model]
    if (id) {
      const { code, ...rest } = prepared
      return delegate.update({ where: { id }, data: code ? prepared : rest })
    }
    const code =
      prepared.code ||
      (await nextCode(tx, def.prefix, async (c) => !!(await delegate.findUnique({ where: { code: c } }))))
    return delegate.create({ data: { ...prepared, code } })
  })
}

export const MASTER_DEFS = defs

export const masterRoutes: FastifyPluginAsync = async (app) => {
  for (const def of defs) {
    const read = { preHandler: guard('basic.read', def.writeModule) }
    const write = { preHandler: guard(def.writeModule) }
    const delegate = () => (app.prisma as any)[def.model]

    app.get(`/${def.path}`, read, async (req) => {
      const q = req.query as { keyword?: string; active?: string }
      const k = q.keyword?.trim()
      const where: any = {}
      if (k)
        where.OR = def.searchFields.map((f) => ({
          [f]: contains(app.dbProvider, f === 'pinyin' ? k.toUpperCase() : k),
        }))
      if (q.active === '1') where.active = true
      return delegate().findMany({ where, orderBy: { code: 'asc' } })
    })

    app.get(`/${def.path}/:id`, read, async (req) => {
      return delegate().findUniqueOrThrow({ where: { id: intParam((req.params as any).id) } })
    })

    app.post(`/${def.path}`, write, async (req) => upsertMaster(app, def, req.body))

    app.put(`/${def.path}/:id`, write, async (req) =>
      upsertMaster(app, def, req.body, intParam((req.params as any).id)),
    )

    app.delete(`/${def.path}/:id`, write, async (req) => {
      await delegate().delete({ where: { id: intParam((req.params as any).id) } })
      return { ok: true }
    })
  }

  /** 拼音检索码预览 */
  app.get('/pinyin', async (req) => ({ code: pinyinCode(String((req.query as any).text ?? '')) }))
}
