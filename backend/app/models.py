from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional
import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


Money = Numeric(18, 6, asdecimal=True)
Qty = Numeric(18, 6, asdecimal=True)
Rate = Numeric(10, 6, asdecimal=True)


def uuid_str() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.utcnow()


class UploadBatch(Base):
    __tablename__ = "upload_batches"

    batch_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    sku: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[Optional[str]] = mapped_column(String(500))
    uploader: Mapped[str] = mapped_column(String(80), default="system", nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    leaf_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    missing_price_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="PARSED", nullable=False)
    parse_summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)

    versions: Mapped[List["CostVersion"]] = relationship(back_populates="batch")


class CostVersion(Base):
    __tablename__ = "cost_versions"

    version_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    batch_id: Mapped[str] = mapped_column(ForeignKey("upload_batches.batch_id"), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    version_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="CALCULATED", nullable=False)
    cost_basis: Mapped[str] = mapped_column(String(40), default="tax_included", nullable=False)
    total_tax_included: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total_tax_excluded: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    missing_price_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[str] = mapped_column(String(80), default="system", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    batch: Mapped[UploadBatch] = relationship(back_populates="versions")
    items: Mapped[List["BomItemSnapshot"]] = relationship(back_populates="version", cascade="all, delete-orphan")
    risks: Mapped[List["RiskItem"]] = relationship(back_populates="version", cascade="all, delete-orphan")


class BomItemSnapshot(Base):
    __tablename__ = "bom_item_snapshots"

    item_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    version_id: Mapped[str] = mapped_column(ForeignKey("cost_versions.version_id"), nullable=False, index=True)
    row_no: Mapped[int] = mapped_column(Integer, nullable=False)
    sku: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    level: Mapped[str] = mapped_column(String(60), nullable=False)
    material_code: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    material_name: Mapped[str] = mapped_column(String(300), nullable=False)
    spec: Mapped[Optional[str]] = mapped_column(Text)
    production_mode: Mapped[Optional[str]] = mapped_column(String(80))
    item_type: Mapped[Optional[str]] = mapped_column(String(80))
    stage: Mapped[Optional[str]] = mapped_column(String(160), index=True)
    material_category: Mapped[Optional[str]] = mapped_column(String(120))
    function_purpose: Mapped[Optional[str]] = mapped_column(Text)
    change_reason: Mapped[Optional[str]] = mapped_column(Text)
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    is_leaf: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    purchase_price_tax_included: Mapped[Optional[Decimal]] = mapped_column(Money)
    tax_rate: Mapped[Decimal] = mapped_column(Rate, default=Decimal("0.13"), nullable=False)
    currency: Mapped[str] = mapped_column(String(12), default="CNY", nullable=False)
    outsourcing_fee: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    material_cost_tax_included: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    material_cost_tax_excluded: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    outsourcing_cost: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total_cost_tax_included: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total_cost_tax_excluded: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    price_status: Mapped[str] = mapped_column(String(40), default="OK", nullable=False)
    raw_data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    version: Mapped[CostVersion] = relationship(back_populates="items")


class RiskItem(Base):
    __tablename__ = "risk_items"

    risk_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    version_id: Mapped[str] = mapped_column(ForeignKey("cost_versions.version_id"), nullable=False, index=True)
    sku: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    row_no: Mapped[int] = mapped_column(Integer, nullable=False)
    material_code: Mapped[str] = mapped_column(String(120), nullable=False)
    material_name: Mapped[str] = mapped_column(String(300), nullable=False)
    stage: Mapped[Optional[str]] = mapped_column(String(160))
    risk_type: Mapped[str] = mapped_column(String(60), nullable=False)
    missing_field: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="待补价", nullable=False)
    impact: Mapped[str] = mapped_column(Text, default="阻断成本版本确认/发布", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)

    version: Mapped[CostVersion] = relationship(back_populates="risks")


class VersionDiff(Base):
    __tablename__ = "version_diffs"

    diff_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    current_version_id: Mapped[str] = mapped_column(ForeignKey("cost_versions.version_id"), index=True, nullable=False)
    previous_version_id: Mapped[Optional[str]] = mapped_column(ForeignKey("cost_versions.version_id"), index=True)
    sku: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    material_code: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    material_name: Mapped[str] = mapped_column(String(300), nullable=False)
    diff_type: Mapped[str] = mapped_column(String(160), nullable=False)
    previous_cost: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    current_cost: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    diff_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    diff_ratio: Mapped[Optional[Decimal]] = mapped_column(Rate)
    auto_reason: Mapped[Optional[str]] = mapped_column(Text)
    manual_reason: Mapped[Optional[str]] = mapped_column(Text)
    edited_by: Mapped[Optional[str]] = mapped_column(String(80))
    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, nullable=False)
