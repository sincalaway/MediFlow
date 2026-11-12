# MediFlow 诊所管理系统

[![CI](https://github.com/sincalaway/MediFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/sincalaway/MediFlow/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-green)

面向社区卫生所、乡镇门诊、个体诊所的 **病案 · 收费 · 药房** 一体化管理系统。
同一套代码提供两种形态：

- **Web 版**：浏览器访问，SQLite（单机）或 PostgreSQL（联网多终端），支持 Docker 一键部署；
- **桌面版**：Electron 离线单机程序（Windows / macOS / Linux），无需联网、无需安装数据库。

> MediFlow 是对 [inmis/Clinicms《诊所管理系统》](https://github.com/inmis/Clinicms) 的重写。原系统基于闭源的
> 宏达「数据库信息管理开发平台」（Delphi 运行时 + Access 数据库，仅限 Windows），业务逻辑以元数据形式存放在
> `Clinicms.Dbi` 中。MediFlow 沿用了它的业务范围与菜单结构，用现代技术栈重新实现，并修复了下文列出的设计缺陷。
> 感谢原作者的开放分享。

---

## 功能

| 模块         | 功能                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **基础信息** | 药品信息（自动生成拼音检索码）、供药单位、人员信息、收费项目、用户与权限                                                           |
| **药房管理** | 药品入库单、退货单、库存（按批次 / 按药品；有效期内 / 已过期 / 近效期 30 天）、盘点调整、缺货提醒、超储提醒、期间入库 / 退货统计 |
| **门诊业务** | 患者档案（含历次就诊病历）、就诊登记 + 处方 + 其他收费项目、按 FEFO 发药、收费登记、患者欠款与还款、处方笺与收据打印 |
| **财务管理** | 付供药单位货款、应付账款统计、日 / 期间收入报表（应收、实收、按支付方式）                                                          |
| **系统管理** | 机构信息（打印抬头）、审计日志（所有写操作）、SQLite 数据备份 / 恢复、主数据 Excel 导入导出                                                              |

角色：**管理员**（全部）、**医生**（患者、就诊处方、发药、查看库存）、**药剂师**（药品/供药单位、入库退货库存、发药）、
**收费员**（收费、欠款、财务报表、收费项目）。前端路由与后端 API 使用同一份权限表（`packages/shared/src/permissions.ts`）。

## 处方与收据打印

- **处方笺**按《处方管理办法》（卫生部令第 53 号）附件 1「处方标准」排版：A5 纵向；前记（机构名称、费别、姓名、性别、实足年龄、门诊病历号、科别、临床诊断、开具日期，可选体重；麻、精一处方另含患者身份证明编号与代办人信息）、正文（Rp，药品名称、剂型、规格、数量、用法用量）、后记（医师签名、药品金额、审核/调配/核对/发药药师签名）。
- 纸色与右上角标注按处方类别：普通（白）、急诊（淡黄）、儿科（淡绿）、麻、精一（淡红）、精二（白）。打印时请在对话框中勾选「背景图形」。
- 西药、中成药每张不超过 5 种，超出自动分张；中药饮片单独成张；空白处自动划斜线。年龄按实足年龄，婴幼儿写月龄、新生儿写日龄。
- 第二十八条：电脑打印的处方须经医师签名或加盖专用签章后有效。各省处方格式细节（纸张尺寸、编号规则）以本省卫生健康委规定为准。
- **收费收据**支持 A5 横向与 80mm 热敏小票两种纸张，含明细、金额大写、收款记录与欠款。
- 机构名称、默认科别、地址电话在「系统管理 → 机构信息」设置。

## 相比原系统修复的问题

| #   | 原系统（inmis/Clinicms）的问题                                        | MediFlow 的做法                                                                                                           |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1   | 没有患者主表，每次就诊重抄姓名/电话/过敏史，无法查看一个人的历次病历  | `Patient` 主档 + `Visit` 外键；患者档案页展示历次就诊；接诊时醒目提示过敏史；同名同电话建档前提示查重                     |
| 2   | 药品名称/规格/厂家、供药单位名称等被抄进每张单据的每一行              | 规范化：单据行只存外键（药品、批次、供药单位），名称从主数据关联读取                                                      |
| 3   | 库存没有台账，每次查询都把入库−退货−处方全量求和；批次靠隐式组合区分 | 显式 `DrugBatch`（药品+批号+有效期）+ `StockMovement` 台账（IN/RETURN/DISPENSE/ADJUST，带符号数量），批次库存在同一事务内缓存 |
| 4   | 出药、退货不校验库存，可出现负库存；不按效期出药                      | 发药自动按 **先过期先出（FEFO）** 拆分批次、拒绝过期批次、库存不足整单回滚；退货不能超过批次库存；出库使用条件更新防并发超扣 |
| 5   | 欠供药单位货款 = 入库 − 实付 − 后付，**没有扣减退货**，欠款被高估    | 应付 = 入库总额 − 退货总额 − 已付款（含入库时当场付款）                                                                    |
| 6   | 就诊「总金额」「欠付款」靠手填，「患者欠款查询」依赖手填值            | 药品费、其他费、合计、已付、欠款 **全部由明细行实时计算**，不可手工录入；收款不能超过欠款；后续付款自动记为「还款」        |
| 7   | 单据号用 max+1 生成，并发会撞号；日流水超过 999 溢出                  | `JZ/RK/TH/GF + yyyymmdd + 4 位流水`，由计数器表在事务内 `INSERT … ON CONFLICT DO UPDATE … RETURNING` 原子生成，超过 9999 自动加宽 |
| 8   | 残留「患犯编号/监室」等引用不存在表的死规则                          | 全部重写，无死代码                                                                                                        |
| 9   | Admin 空密码、无审计、权限只到菜单级                                  | 首次运行强制设置管理员密码（≥6 位，bcrypt 存储）；新建/重置的账号首次登录强制改密；JWT；路由 + API 双重角色守卫；所有写操作记审计日志（密码脱敏） |
| 10  | 只能 Windows + Access，网络版另购，无 API                             | Web（SQLite / PostgreSQL）+ 跨平台离线桌面版 + REST API，MIT 开源                                                          |

此外：金额统一以 **整数「分」** 存储与计算，避免浮点误差；纯日期字段使用 `YYYY-MM-DD` 字符串，避免时区偏移。

## 技术栈

pnpm monorepo，全部 TypeScript：

```
apps/web        Vue 3 + Vite + Pinia + Vue Router + Naive UI + Tailwind（中文界面）
apps/server     Node 20+ · Fastify 5 · Prisma 6 · zod（SQLite 默认 / PostgreSQL）
apps/desktop    Electron：进程内启动服务端，SQLite 存于用户数据目录，electron-builder 打包
packages/shared 前后端共用的 zod 校验、金额/FEFO/编号计算、权限表、拼音码（pinyin-pro）
tools/import-clinicms  旧系统 Clinicms.Dbi 导出脚本（Python + access-parser）
```

## 快速开始（Web 开发模式）

需要 Node.js ≥ 20 与 pnpm 10（`corepack enable` 或 `npm i -g pnpm@10`）。

```bash
pnpm install          # 安装依赖并生成 Prisma Client
pnpm db:seed          # 可选：生成演示数据（SQLite: apps/server/data/mediflow.db）
pnpm dev              # 服务端 http://localhost:3000 + 前端 http://localhost:5173
```

打开 <http://localhost:5173>。

- **未执行 seed**：首次打开会要求为 `admin` 设置密码（至少 6 位）。
- **执行了 seed**：演示账号 `admin / admin123`（首次登录强制改密）、`doctor / doctor123`、`pharmacist / pharm123`、`cashier / cash123`。演示账号仅供体验，请勿用于生产。

数据库首次启动时自动建表（无需手动迁移）。常用命令：

```bash
pnpm lint && pnpm typecheck && pnpm test   # 代码检查与测试（vitest）
pnpm build                                 # 构建前端 + 服务端（apps/server/dist/index.cjs）
pnpm start                                 # 生产模式：服务端同时托管前端，http://localhost:3000
```

配置见 `.env.example`（`DATABASE_URL`、`JWT_SECRET`、`PORT`、`DATA_DIR`）。未设置 `JWT_SECRET` 时会自动生成并保存在数据目录。

### 使用 PostgreSQL

```bash
pnpm --filter @mediflow/server prisma:pg    # 生成 PostgreSQL 版 Prisma Client
DATABASE_URL="postgresql://user:pass@localhost:5432/mediflow" pnpm start
```

## Docker 部署（Web 版 + PostgreSQL）

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up -d
# 浏览器打开 http://localhost:3000 ，首次进入设置管理员密码
```

`docker-compose.yml` 包含 `postgres:16` 与应用两个服务，数据分别保存在 `pgdata`、`appdata` 卷中。
PostgreSQL 的备份请使用 `pg_dump` / `pg_restore`（界面上的「备份与恢复」仅适用于 SQLite）。
如需 SQLite 版镜像：`docker build --build-arg DB_PROVIDER=sqlite -t mediflow:sqlite .`，并挂载 `/data`。

## 桌面版（离线）

桌面版在 Electron 主进程内启动同一个服务端（仅监听 `127.0.0.1` 的随机端口），数据库为
`<用户数据目录>/data/mediflow.db`（Windows 一般在 `%APPDATA%\MediFlow\data`），菜单「文件 → 打开数据目录」可直接打开。
首次启动自动建库并要求设置管理员密码，完全离线可用。

```bash
pnpm build
pnpm --filter @mediflow/desktop start          # 本地运行
pnpm --filter @mediflow/desktop dist           # 打包当前平台安装包 → apps/desktop/release/
pnpm --filter @mediflow/desktop dist:dir       # 只生成免安装目录（调试用）
```

打包目标：Windows `nsis` 安装包 + `portable` 便携版、macOS `dmg`、Linux `AppImage`。
Prisma 查询引擎是原生文件，需在目标平台上打包（推送 `v*` 标签后由 GitHub Actions 在三个平台分别构建并发布到 Release）。
macOS 包未签名，首次打开需在「系统设置 → 隐私与安全性」中允许。Linux AppImage 需要 glibc + OpenSSL 3（Ubuntu 22.04+ / Debian 12+）。

## 导入旧系统数据（Clinicms.Dbi）

导入 13 张业务表：人员信息、供药单位、收费项目、药品信息、药品入库主/从表、药品退货主/从表、就诊登记、处方明细、
其他项目表、患者付欠款明细、付供药单位货款登记。

```bash
pip install access-parser
# 方式一：直接读取 .Dbi（内部调用 tools/import-clinicms/extract.py）
DATABASE_URL="file:./data/mediflow.db" pnpm import:clinicms -- --dbi /path/to/Clinicms.Dbi
# 方式二：先导出 JSON，再导入（导入机器无需 Python）
python3 tools/import-clinicms/extract.py /path/to/Clinicms.Dbi clinicms.json
pnpm import:clinicms -- --json /path/to/clinicms.json
```

导入规则：

- Access `Currency` 为 ×10000 定点整数，统一换算为「分」（`原值 / 100`）；
- 患者按 **姓名 + 电话** 去重建立主档；就诊时年龄写入患者备注；
- 由（药品编号, 生产日期, 有效期至）生成显式批次，批号取生产日期；入库/退货/处方写入库存台账；
- 「已付款」记为就诊收费，「患者付欠款明细」记为还款；「看诊医生」不在人员表中时自动补建人员；
- 合计金额一律以明细重新计算，与原表不一致时给出警告（原系统未校验库存的历史数据会以警告方式保留）；
- 要求目标库为空（`--force` 可跳过检查）。导入在单个事务中完成，失败自动回滚。

对原仓库附带的演示库，导入结果为：人员 3（+1 补建）、供药单位 3、收费项目 3、药品 3、批次 3、入库单 2（明细 3）、
退货单 2（明细 2）、患者 2、就诊 2（处方 3、其他项目 4）、患者收款 2 + 还款 1、供应商付款 2；
批次库存 28 / 7 / 26，与原系统「入库 − 退货 − 出库」一致。

## 目录结构

```
apps/
  server/
    prisma/schema.prisma      数据模型（SQLite；PostgreSQL 版由脚本生成）
    src/services/             核心业务：编号、库存台账与 FEFO、就诊金额、报表、Excel
    src/routes/               REST API（/api/*）
    src/db/schemaSql.ts       自动生成的建表 SQL（pnpm db:sql），启动时自动建库
    test/                     vitest：FEFO、库存不足回滚、退货校验、编号（含并发）、就诊合计、应付账款、鉴权、备份恢复、旧数据导入
  web/src/views/              各功能页面
  desktop/                    Electron 主进程与打包配置
packages/shared/              共享 schema / 计算 / 权限
tools/import-clinicms/        旧数据导出脚本
```

## 已知限制（v0.1）

- 已发药的就诊不能撤销发药（作废仅适用于未发药的就诊）；退药请走盘点调整；
- 报表暂不支持导出 Excel（主数据支持）；
- 桌面版暂无自动更新。

## 许可证

[MIT](./LICENSE)。原系统 inmis/Clinicms 的版权归其作者所有，本项目未包含其任何程序文件或数据库文件（测试用的演示数据 JSON 由其公开演示库导出）。
