from __future__ import annotations

from io import BytesIO
from pathlib import Path
import sys

from openpyxl import Workbook
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app import bom_v3, models  # noqa: E402
from app.database import Base  # noqa: E402


def session_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'bom-v3.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def workbook_bytes(price="12.345", sku="SKU-001"):
    wb = Workbook()
    ws = wb.active
    ws.title = "BOM底表"
    ws.append(["研发填写"] * 18)
    ws.append([
        "SKU",
        "层级",
        "子物料编码",
        "子物料名称",
        "子物料规格",
        "子物料生产方式",
        "子项类型",
        "工段分类",
        "物料分类",
        "功能目的",
        "变更原因",
        "单位",
        "BOM用量",
        "是否末级",
        "采购单价",
        "税率",
        "币种",
        "委外加工费",
    ])
    ws.append([sku, "0", sku, "成品", "", "委外", "标准件", "整机", "成品", "", "", "PCS", 1, "否", "", "13%", "CNY", ""])
    ws.append([sku, "1", "MAT-001", "物料A", "A", "外购", "标准件", "PCBA", "电子件", "", "初版", "PCS", 2, "是", price, "13%", "CNY", "1.111"])
    stream = BytesIO()
    wb.save(stream)
    return stream.getvalue()


def test_upload_persists_version_and_rounds_money(tmp_path):
    db = session_factory(tmp_path)()

    result = bom_v3.create_upload_version(
        db,
        content=workbook_bytes(),
        filename="test.xlsx",
        sku=None,
        version_name="V1",
        uploader="tester",
    )

    assert result["persisted"] is True
    version = db.scalar(select(models.CostVersion))
    assert version is not None
    assert float(version.total_tax_included) == 26.91
    assert version.missing_price_count == 0


def test_missing_price_can_persist_but_blocks_confirm(tmp_path):
    db = session_factory(tmp_path)()

    result = bom_v3.create_upload_version(
        db,
        content=workbook_bytes(price=""),
        filename="missing.xlsx",
        sku=None,
        version_name="V-missing",
        uploader="tester",
    )

    assert result["persisted"] is True
    version_id = result["version"]["version_id"]
    assert result["version"]["status"] == "NEEDS_PRICE"
    risks = db.scalars(select(models.RiskItem)).all()
    assert len(risks) == 1
    assert risks[0].stage == "PCBA"
    try:
        bom_v3.confirm_version(db, version_id)
    except ValueError as exc:
        assert "缺失价格" in str(exc)
    else:
        raise AssertionError("missing price version should not be confirmed")


def test_delete_version_removes_detail_and_related_diffs(tmp_path):
    db = session_factory(tmp_path)()

    first = bom_v3.create_upload_version(
        db,
        content=workbook_bytes(price="12.345", sku="SKU-DEL"),
        filename="v1.xlsx",
        sku=None,
        version_name="V1",
        uploader="tester",
    )
    second = bom_v3.create_upload_version(
        db,
        content=workbook_bytes(price="13.345", sku="SKU-DEL"),
        filename="v2.xlsx",
        sku=None,
        version_name="V2",
        uploader="tester",
    )

    first_id = first["version"]["version_id"]
    second_id = second["version"]["version_id"]
    assert db.scalars(select(models.VersionDiff).where(models.VersionDiff.current_version_id == second_id)).all()

    deleted = bom_v3.delete_version(db, first_id)

    assert deleted["version_id"] == first_id
    assert db.get(models.CostVersion, first_id) is None
    assert not db.scalars(select(models.BomItemSnapshot).where(models.BomItemSnapshot.version_id == first_id)).all()
    assert not db.scalars(
        select(models.VersionDiff).where(
            (models.VersionDiff.current_version_id == first_id) | (models.VersionDiff.previous_version_id == first_id)
        )
    ).all()
