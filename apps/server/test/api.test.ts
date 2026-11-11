// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
import type { FastifyInstance } from 'fastify'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'

let app: FastifyInstance
let dir: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mediflow-api-'))
  app = await buildApp({
    databaseUrl: `file:${join(dir, 'api.db')}`,
    jwtSecret: 'test-secret',
    dataDir: dir,
    logger: false,
  })
})
afterAll(async () => {
  await app.close()
  rmSync(dir, { recursive: true, force: true })
})

async function login(username: string, password: string) {
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } })
  return r.json() as { token: string; user: { mustChangePassword: boolean } }
}

describe('首次运行与鉴权', () => {
  it('未初始化时要求设置管理员密码，且拒绝空/短密码', async () => {
    expect((await app.inject({ url: '/api/auth/setup-status' })).json()).toEqual({ needsSetup: true })
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { password: '' } })).statusCode,
    ).toBe(400)
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { password: 'Secret123' } }))
        .statusCode,
    ).toBe(200)
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { password: 'Other123' } }))
        .statusCode,
    ).toBe(409)
  })

  it('未登录访问业务接口返回 401', async () => {
    expect((await app.inject({ url: '/api/drugs' })).statusCode).toBe(401)
  })

  it('角色守卫：收费员不能维护药品、不能访问系统管理；新用户必须先改密码', async () => {
    const { token } = await login('admin', 'Secret123')
    const auth = { authorization: `Bearer ${token}` }
    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: auth,
      payload: { username: 'cashier1', displayName: '收费员', role: 'cashier', password: 'init123' },
    })
    expect(created.statusCode).toBe(200)

    const c = await login('cashier1', 'init123')
    expect(c.user.mustChangePassword).toBe(true)
    const ch = { authorization: `Bearer ${c.token}` }
    expect((await app.inject({ url: '/api/drugs', headers: ch })).statusCode).toBe(428)
    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: ch,
      payload: { oldPassword: 'init123', newPassword: 'cash1234' },
    })
    expect(changed.statusCode).toBe(200)
    expect((await app.inject({ url: '/api/drugs', headers: ch })).statusCode).toBe(200)
    expect(
      (await app.inject({ method: 'POST', url: '/api/drugs', headers: ch, payload: { name: 'X' } }))
        .statusCode,
    ).toBe(403)
    expect((await app.inject({ url: '/api/system/audit-logs', headers: ch })).statusCode).toBe(403)
  })

  it('写操作记录审计日志且不记录密码', async () => {
    const { token } = await login('admin', 'Secret123')
    const r = await app.inject({
      url: '/api/system/audit-logs?pageSize=100',
      headers: { authorization: `Bearer ${token}` },
    })
    const body = r.json() as { rows: { path: string; summary: string | null }[] }
    expect(body.rows.some((x) => x.path === '/api/users')).toBe(true)
    expect(body.rows.every((x) => !x.summary?.includes('Secret123') && !x.summary?.includes('init123'))).toBe(
      true,
    )
  })

  it('药品自动生成编号与拼音检索码', async () => {
    const { token } = await login('admin', 'Secret123')
    const r = await app.inject({
      method: 'POST',
      url: '/api/drugs',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: '999感冒灵颗粒', retailPrice: 1250 },
    })
    expect(r.json()).toMatchObject({ code: 'Y00001', pinyin: '999GMLKL', retailPrice: 1250 })
  })

  it('Excel 导出后可再导入（按编号更新）', async () => {
    const { token } = await login('admin', 'Secret123')
    const headers = { authorization: `Bearer ${token}` }
    const exp = await app.inject({ url: '/api/system/excel/export?sheets=drugs', headers })
    expect(exp.statusCode).toBe(200)
    const mp = multipart({ sheet: 'drugs' }, exp.rawPayload, 'drugs.xlsx')
    const imp = await app.inject({
      method: 'POST',
      url: '/api/system/excel/import',
      headers: { ...headers, ...mp.headers },
      payload: mp.body,
    })
    expect(imp.json()).toMatchObject({ created: 0, updated: 1, errors: [] })
  })

  it('SQLite 备份与恢复', async () => {
    const { token } = await login('admin', 'Secret123')
    const headers = { authorization: `Bearer ${token}` }
    const backup = await app.inject({ url: '/api/system/backup', headers })
    expect(backup.statusCode).toBe(200)
    expect(backup.rawPayload.subarray(0, 15).toString()).toBe('SQLite format 3')
    // 备份后新增一个供应商，恢复后应消失
    await app.inject({ method: 'POST', url: '/api/suppliers', headers, payload: { name: '恢复后应消失' } })
    const mp = multipart({}, backup.rawPayload, 'backup.db')
    const r = await app.inject({
      method: 'POST',
      url: '/api/system/restore',
      headers: { ...headers, ...mp.headers },
      payload: mp.body,
    })
    expect(r.statusCode).toBe(200)
    const list = await app.inject({ url: '/api/suppliers', headers })
    expect((list.json() as { name: string }[]).some((x) => x.name === '恢复后应消失')).toBe(false)
    // 非数据库文件被拒绝
    const bad = multipart({}, Buffer.from('hello'), 'x.db')
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/system/restore',
          headers: { ...headers, ...bad.headers },
          payload: bad.body,
        })
      ).statusCode,
    ).toBe(400)
  })
})

function multipart(fields: Record<string, string>, file: Buffer, filename: string) {
  const boundary = '----mediflow' + Math.random().toString(16).slice(2)
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
  )
  parts.push(file)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts),
  }
}
