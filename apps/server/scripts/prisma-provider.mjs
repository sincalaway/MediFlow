// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
// 由 schema.prisma (sqlite) 生成指定 provider 的 schema 副本
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const provider = process.argv[2] || 'postgresql'
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma')
const src = readFileSync(join(dir, 'schema.prisma'), 'utf8')
const out = src.replace(/provider\s*=\s*"sqlite"/, `provider = "${provider}"`)
writeFileSync(join(dir, `schema.${provider}.prisma`), out)
console.log(`wrote prisma/schema.${provider}.prisma`)
