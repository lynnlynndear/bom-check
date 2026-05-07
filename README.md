# BOM-v3 ERP 产品成本管控系统

BOM-v3 是面向财务核算和 BU 经营负责人的产品成本管控 MVP，当前按本次确认口径实现：

- 一张 BOM 底表本地上传，解析 BOM、采购单价、税率和委外加工费。
- 数据库存储上传批次、版本快照、成本明细、缺价风险和版本差异。
- 成本版本可复算，金额展示与导出保留小数点后两位。
- 暂不考虑价格有效期，币种仅支持人民币 CNY。
- 一个文件一个 SKU。
- 缺价允许底表先入库，但阻断成本版本确认/发布，并在 dashboard 展示缺价物料和所属工段。
- 看板支持含税/不含税展示口径。
- 版本差异原因支持人工修订并保存。

## 启动

```bash
cd "/Users/lynnlynn/project/BOM- v3"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./scripts/server.sh start
```

访问：

```text
http://127.0.0.1:8093/
```

健康检查：

```bash
curl http://127.0.0.1:8093/api/health
```

## API 摘要

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/template` | 下载 BOM-v3 单底表模板 |
| POST | `/api/uploads/base-table` | 上传底表，解析并入库生成成本版本 |
| GET | `/api/versions` | 成本版本列表 |
| GET | `/api/versions/{version_id}` | 版本明细、成本明细、风险 |
| POST | `/api/versions/{version_id}/recalculate` | 复算成本版本 |
| POST | `/api/versions/{version_id}/confirm` | 确认版本，存在缺价时阻断 |
| GET | `/api/dashboard` | 成本看板数据 |
| GET | `/api/versions/{version_id}/diffs` | 版本差异明细 |
| PATCH | `/api/diffs/{diff_id}` | 保存人工差异原因 |
| GET | `/api/versions/{version_id}/export` | 导出成本看板 Excel |

## 本地数据库

默认使用 SQLite 文件：

```text
bom_v3.db
```

如需切换 PostgreSQL，可设置：

```bash
export DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/bom_v3"
```

当前 `requirements.txt` 未默认安装 PostgreSQL 驱动，正式接入 PostgreSQL 时再补充对应驱动即可。
