import { clinicSettingsSchema, type ClinicSettings } from '@mediflow/shared'
import type { PrismaClient } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { currentUser, guard } from '../auth'

const KEYS = Object.keys(clinicSettingsSchema.shape) as (keyof ClinicSettings)[]
const metaKey = (k: string) => `clinic.${k}`

export async function getClinicSettings(db: PrismaClient): Promise<ClinicSettings> {
  const rows = await db.meta.findMany({ where: { key: { in: KEYS.map(metaKey) } } })
  const map = Object.fromEntries(rows.map((r) => [r.key.slice('clinic.'.length), r.value]))
  return clinicSettingsSchema.parse(map)
}

/** 机构信息：处方笺与收据抬头。所有登录用户可读，仅管理员可改 */
export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const db = app.prisma
  app.get('/settings/clinic', async (req) => {
    currentUser(req)
    return getClinicSettings(db)
  })
  app.put('/settings/clinic', { preHandler: guard('system') }, async (req) => {
    const b = clinicSettingsSchema.parse(req.body)
    await db.$transaction(
      KEYS.map((k) =>
        db.meta.upsert({
          where: { key: metaKey(k) },
          create: { key: metaKey(k), value: b[k] },
          update: { value: b[k] },
        }),
      ),
    )
    return getClinicSettings(db)
  })
}
