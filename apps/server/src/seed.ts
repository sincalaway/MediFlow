// MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
/**
 * 演示数据：pnpm db:seed
 * 账号：admin/admin123（首次登录强制改密）、doctor/doctor123、pharmacist/pharm123、cashier/cash123
 * 仅用于开发演示，生产环境请勿执行。
 */
import { addDays, pinyinCode, toDateStr } from '@mediflow/shared'
import type { Drug, Patient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { optionsFromEnv } from './config'
import { createPrisma, detectProvider, ensureSchema } from './db/client'
import { bumpCounter } from './services/numbering'
import { createPurchaseOrder, createSupplierReturn } from './services/stock'
import { addPatientPayment, saveVisit } from './services/visits'

async function main() {
  const opts = optionsFromEnv()
  const db = createPrisma(opts.databaseUrl)
  await ensureSchema(db, detectProvider(opts.databaseUrl), opts.databaseUrl)
  if ((await db.user.count()) > 0 || (await db.drug.count()) > 0) {
    console.log('数据库已有数据，跳过演示数据。如需重建请删除数据库文件后再执行。')
    return db.$disconnect()
  }
  const today = toDateStr()

  const staff = await Promise.all(
    [
      { code: 'R00001', name: '李明', gender: '男', title: '主治医师', isDoctor: true, phone: '13900000001' },
      { code: 'R00002', name: '王芳', gender: '女', title: '医师', isDoctor: true, phone: '13900000002' },
      { code: 'R00003', name: '赵静', gender: '女', title: '药剂师', isDoctor: false, phone: '13900000003' },
      { code: 'R00004', name: '孙丽', gender: '女', title: '收费员', isDoctor: false, phone: '13900000004' },
    ].map((data) => db.staff.create({ data })),
  )
  const hash = (p: string) => bcrypt.hash(p, 10)
  await db.user.createMany({
    data: [
      {
        username: 'admin',
        displayName: '系统管理员',
        role: 'admin',
        passwordHash: await hash('admin123'),
        mustChangePassword: true,
      },
      {
        username: 'doctor',
        displayName: '李明',
        role: 'doctor',
        passwordHash: await hash('doctor123'),
        staffId: staff[0].id,
      },
      {
        username: 'pharmacist',
        displayName: '赵静',
        role: 'pharmacist',
        passwordHash: await hash('pharm123'),
        staffId: staff[2].id,
      },
      {
        username: 'cashier',
        displayName: '孙丽',
        role: 'cashier',
        passwordHash: await hash('cash123'),
        staffId: staff[3].id,
      },
    ],
  })

  const suppliers = await Promise.all(
    [
      {
        code: 'D00001',
        name: '华东医药股份有限公司',
        contact: '张经理',
        phone: '0571-88880001',
        address: '浙江省杭州市',
      },
      {
        code: 'D00002',
        name: '国药控股分销中心',
        contact: '刘经理',
        phone: '010-66660002',
        address: '北京市',
      },
      {
        code: 'D00003',
        name: '九州通医药集团',
        contact: '陈经理',
        phone: '027-55550003',
        address: '湖北省武汉市',
      },
    ].map((data) => db.supplier.create({ data })),
  )
  const charges = await Promise.all(
    [
      { code: 'X00001', name: '诊查费', price: 1000, unit: '次' },
      { code: 'X00002', name: '一次性注射器', price: 300, unit: '支' },
      { code: 'X00003', name: '血常规', price: 2500, unit: '次' },
      { code: 'X00004', name: '静脉输液', price: 1500, unit: '次' },
    ].map((data) => db.chargeItem.create({ data })),
  )
  const drugDefs = [
    ['阿莫西林胶囊', '西药', '0.25g*24粒', '胶囊', '盒', '珠海联邦制药', 1850, 20, 200],
    ['布洛芬缓释胶囊', '西药', '0.3g*20粒', '胶囊', '盒', '中美天津史克', 2200, 10, 100],
    ['999感冒灵颗粒', '中成药', '10g*9袋', '颗粒', '盒', '华润三九医药', 1600, 20, 150],
    ['连花清瘟胶囊', '中成药', '0.35g*24粒', '胶囊', '盒', '石家庄以岭药业', 2580, 20, 150],
    ['头孢克肟分散片', '西药', '0.1g*6片', '片剂', '盒', '广州白云山制药', 3200, 10, 80],
    ['蒙脱石散', '西药', '3g*10袋', '散剂', '盒', '博福-益普生', 1980, 10, 60],
    ['氯化钠注射液', '西药', '250ml:2.25g', '注射液', '瓶', '四川科伦药业', 450, 30, 300],
    ['板蓝根颗粒', '中成药', '10g*20袋', '颗粒', '袋', '广州白云山和记黄埔', 1200, 10, 50],
  ] as const
  const drugs: Drug[] = []
  let i = 0
  for (const [
    name,
    category,
    spec,
    dosageForm,
    unit,
    manufacturer,
    retailPrice,
    stockMin,
    stockMax,
  ] of drugDefs) {
    drugs.push(
      await db.drug.create({
        data: {
          code: `Y${String(++i).padStart(5, '0')}`,
          name,
          pinyin: pinyinCode(name),
          category,
          spec,
          dosageForm,
          unit,
          manufacturer,
          retailPrice,
          stockMin,
          stockMax,
        },
      }),
    )
  }
  await db.$transaction(async (tx) => {
    for (const [p, n] of [
      ['CODE_R', 4],
      ['CODE_D', 3],
      ['CODE_X', 4],
      ['CODE_Y', drugs.length],
    ] as const)
      await bumpCounter(tx, p, n)
  })

  // 入库：包含近效期与已过期批次，方便演示效期提醒与 FEFO
  const po1 = await db.$transaction((tx) =>
    createPurchaseOrder(
      tx,
      {
        supplierId: suppliers[0].id,
        orderDate: addDays(today, -40),
        handler: '赵静',
        paidNow: 50000,
        payMethod: '银行卡',
        lines: [
          {
            drugId: drugs[0].id,
            batchNo: 'A2401',
            mfgDate: addDays(today, -700),
            expiryDate: addDays(today, 20),
            quantity: 30,
            costPrice: 1200,
          },
          {
            drugId: drugs[0].id,
            batchNo: 'A2503',
            mfgDate: addDays(today, -200),
            expiryDate: addDays(today, 520),
            quantity: 60,
            costPrice: 1150,
          },
          {
            drugId: drugs[1].id,
            batchNo: 'B2502',
            mfgDate: addDays(today, -300),
            expiryDate: addDays(today, 400),
            quantity: 40,
            costPrice: 1500,
          },
          {
            drugId: drugs[2].id,
            batchNo: 'G2409',
            mfgDate: addDays(today, -800),
            expiryDate: addDays(today, -5),
            quantity: 15,
            costPrice: 1000,
          },
          {
            drugId: drugs[2].id,
            batchNo: 'G2507',
            mfgDate: addDays(today, -120),
            expiryDate: addDays(today, 600),
            quantity: 80,
            costPrice: 1050,
          },
        ],
      },
      null,
      '赵静',
    ),
  )
  await db.$transaction((tx) =>
    createPurchaseOrder(
      tx,
      {
        supplierId: suppliers[1].id,
        orderDate: addDays(today, -20),
        handler: '赵静',
        paidNow: 0,
        payMethod: '银行卡',
        lines: [
          {
            drugId: drugs[3].id,
            batchNo: 'L2506',
            expiryDate: addDays(today, 450),
            quantity: 200,
            costPrice: 1800,
          },
          {
            drugId: drugs[4].id,
            batchNo: 'T2504',
            expiryDate: addDays(today, 25),
            quantity: 8,
            costPrice: 2300,
          },
          {
            drugId: drugs[5].id,
            batchNo: 'M2501',
            expiryDate: addDays(today, 300),
            quantity: 30,
            costPrice: 1300,
          },
          {
            drugId: drugs[6].id,
            batchNo: 'N2508',
            expiryDate: addDays(today, 700),
            quantity: 100,
            costPrice: 260,
          },
          {
            drugId: drugs[7].id,
            batchNo: 'BL2505',
            expiryDate: addDays(today, 365),
            quantity: 6,
            costPrice: 700,
          },
        ],
      },
      null,
      '赵静',
    ),
  )
  const expired = await db.drugBatch.findFirstOrThrow({ where: { batchNo: 'G2409' } })
  await db.$transaction((tx) =>
    createSupplierReturn(
      tx,
      {
        supplierId: suppliers[0].id,
        returnDate: addDays(today, -2),
        handler: '赵静',
        remark: '过期退回',
        lines: [{ batchId: expired.id, quantity: 10, unitPrice: 1000 }],
      },
      null,
    ),
  )
  await db.payment.create({
    data: {
      kind: 'SUPPLIER',
      docNo: `GF${addDays(today, -10).replace(/-/g, '')}0001`,
      supplierId: suppliers[1].id,
      amount: 200000,
      method: '银行卡',
      paidAt: addDays(today, -10),
      receivedBy: '孙丽',
    },
  })
  await db.$transaction((tx) => bumpCounter(tx, `GF${addDays(today, -10).replace(/-/g, '')}`, 1))

  const patients: Patient[] = []
  for (const p of [
    { name: '张伟', gender: '男', birthDate: '1985-03-12', phone: '13800001111', allergies: '青霉素过敏' },
    { name: '李娜', gender: '女', birthDate: '1992-07-08', phone: '13800002222', allergies: '无' },
    {
      name: '王小明',
      gender: '男',
      birthDate: '2018-11-20',
      phone: '13800003333',
      allergies: '无',
      history: '哮喘',
    },
    {
      name: '刘秀英',
      gender: '女',
      birthDate: '1958-01-30',
      phone: '13800004444',
      allergies: '磺胺类',
      history: '高血压',
    },
    { name: '陈强', gender: '男', birthDate: '1979-09-15', phone: '13800005555', allergies: '无' },
  ]) {
    patients.push(await db.patient.create({ data: { ...p, pinyin: pinyinCode(p.name) } }))
  }

  const visits: [number, number, string, string, [number, number][], number[], number][] = [
    // [患者, 医生, 主诉, 诊断, 处方[药品, 数量], 收费项目, 已付(分)]
    [
      0,
      0,
      '发热咳嗽 2 天',
      '急性上呼吸道感染',
      [
        [2, 2],
        [1, 1],
      ],
      [0],
      -1,
    ],
    [1, 1, '腹泻 1 天', '急性胃肠炎', [[5, 2]], [0, 2], -1],
    [
      2,
      0,
      '咽痛、低热',
      '急性扁桃体炎',
      [
        [0, 1],
        [7, 1],
      ],
      [0],
      3000,
    ],
    [3, 1, '头晕乏力', '病毒性感冒', [[3, 2]], [0, 3, 1], 0],
    [
      4,
      0,
      '咳嗽有痰',
      '支气管炎',
      [
        [4, 1],
        [0, 2],
      ],
      [0],
      -1,
    ],
  ]
  let day = -6
  for (const [pi, di, cc, dx, rx, ch, paid] of visits) {
    const visitDate = new Date(`${addDays(today, day++)}T09:30:00+08:00`)
    const id = await db.$transaction((tx) =>
      saveVisit(
        tx,
        {
          patientId: patients[pi].id,
          doctorId: staff[di].id,
          visitDate: `${toDateStr(visitDate)}T09:30:00+08:00`,
          chiefComplaint: cc,
          diagnosis: dx,
          history: patients[pi].history ?? '无',
          prescription: rx.map(([d, q]) => ({
            drugId: drugs[d].id,
            quantity: q,
            unitPrice: drugs[d].retailPrice,
            usage: '口服，一日三次',
          })),
          charges: ch.map((c) => ({ chargeItemId: charges[c].id, quantity: 1, unitPrice: charges[c].price })),
          dispense: true,
        },
        null,
      ),
    )
    const v = await db.visit.findUniqueOrThrow({ where: { id }, include: { items: true, charges: true } })
    const total = [...v.items, ...v.charges].reduce((s, l) => s + l.quantity * l.unitPrice, 0)
    const pay = paid < 0 ? total : paid
    if (pay > 0)
      await db.$transaction((tx) =>
        addPatientPayment(
          tx,
          { visitId: id, amount: pay, method: '微信', paidAt: toDateStr(visitDate) },
          '孙丽',
        ),
      )
  }
  console.log('演示数据已生成。入库单', po1.orderNo, '等；账号见 README。')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
