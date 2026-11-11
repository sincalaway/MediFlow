#!/usr/bin/env python3
# MediFlow © 2026 sincalwow · MIT License · https://github.com/sincalaway/MediFlow
"""从 inmis/Clinicms 的 Clinicms.Dbi（Access/Jet 数据库）导出 13 张业务表为 JSON。

用法: python3 extract.py path/to/Clinicms.Dbi out.json
依赖: pip install access-parser

说明: Access 的 Currency 字段以 ×10000 的定点整数保存，这里原样输出原始整数，
由导入脚本统一换算为「分」（raw / 100），避免浮点误差。
"""
import json
import sys

try:
    from access_parser import AccessParser
except ImportError:  # pragma: no cover
    sys.exit("缺少依赖：请先执行 pip install access-parser")

TABLES = [
    "人员信息", "供药单位", "收费项目", "药品信息",
    "药品入库主表", "药品入库从表", "药品退货主表", "药品退货从表",
    "就诊登记", "处方明细", "其他项目表", "患者付欠款明细", "付供药单位货款登记",
]


def main():
    if len(sys.argv) < 3:
        sys.exit("用法: python3 extract.py Clinicms.Dbi out.json")
    db = AccessParser(sys.argv[1])
    out = {}
    for t in TABLES:
        if t not in db.catalog:
            print(f"警告：缺少表 {t}", file=sys.stderr)
            out[t] = []
            continue
        cols = db.parse_table(t)
        n = len(next(iter(cols.values()))) if cols else 0
        out[t] = [{k: cols[k][i] for k in cols} for i in range(n)]
        print(f"{t}: {n} 行", file=sys.stderr)
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
