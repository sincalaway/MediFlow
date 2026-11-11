# import-clinicms

从 [inmis/Clinicms](https://github.com/inmis/Clinicms) 的 `Clinicms.Dbi`（Access/Jet 数据库）导出 13 张业务表。

```bash
pip install access-parser
python3 extract.py /path/to/Clinicms.Dbi clinicms.json
```

导入逻辑在 `apps/server/src/import-clinicms.ts`，用法见根目录 README「导入旧系统数据」。
