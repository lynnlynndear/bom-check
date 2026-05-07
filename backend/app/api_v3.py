from __future__ import annotations

from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import bom_v3
from .database import get_db, init_db


router = APIRouter(prefix="/api", tags=["bom-v3"])


class DiffReasonUpdate(BaseModel):
    manual_reason: str
    edited_by: str = "system"


def ok(data: Any, message: str = "") -> dict[str, Any]:
    return {"success": True, "data": data, "errorCode": None, "message": message}


@router.get("/template")
def download_template() -> StreamingResponse:
    stream = bom_v3.create_template_workbook()
    filename = quote("BOM-v3底表上传模板.xlsx")
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.post("/uploads/base-table")
async def upload_base_table(
    file: UploadFile = File(...),
    sku: Optional[str] = Form(default=None),
    version_name: Optional[str] = Form(default=None),
    uploader: str = Form(default="system"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    init_db()
    filename = file.filename or "BOM底表.xlsx"
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="上传文件为空")
    try:
        result = bom_v3.create_upload_version(
            db,
            content=content,
            filename=filename,
            sku=sku or None,
            version_name=version_name or None,
            uploader=uploader,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ok(result)


@router.get("/versions")
def list_versions(db: Session = Depends(get_db)) -> dict[str, Any]:
    init_db()
    return ok(bom_v3.list_versions(db))


@router.get("/versions/{version_id}")
def get_version(version_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    init_db()
    try:
        return ok(bom_v3.get_version_detail(db, version_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/versions/{version_id}")
def delete_version(version_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    init_db()
    try:
        return ok(bom_v3.delete_version(db, version_id), "版本已删除")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/versions/{version_id}/recalculate")
def recalculate_version(version_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    init_db()
    try:
        return ok(bom_v3.recalculate_version(db, version_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/versions/{version_id}/confirm")
def confirm_version(version_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    init_db()
    try:
        return ok(bom_v3.confirm_version(db, version_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/versions/{version_id}/diffs")
def list_diffs(version_id: str, previous_version_id: Optional[str] = None, db: Session = Depends(get_db)) -> dict[str, Any]:
    init_db()
    try:
        return ok(bom_v3.list_diffs(db, version_id, previous_version_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/diffs/{diff_id}")
def update_diff_reason(diff_id: str, payload: DiffReasonUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    init_db()
    try:
        return ok(bom_v3.update_diff_reason(db, diff_id, payload.manual_reason, payload.edited_by))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/dashboard")
def dashboard(version_id: Optional[str] = None, cost_basis: str = "tax_included", db: Session = Depends(get_db)) -> dict[str, Any]:
    init_db()
    if cost_basis not in {"tax_included", "tax_excluded"}:
        raise HTTPException(status_code=400, detail="cost_basis 仅支持 tax_included 或 tax_excluded")
    try:
        return ok(bom_v3.dashboard_summary(db, version_id, cost_basis))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/versions/{version_id}/export")
def export_version(version_id: str, cost_basis: str = "tax_included", db: Session = Depends(get_db)) -> StreamingResponse:
    init_db()
    try:
        stream = bom_v3.export_dashboard_workbook(db, version_id, cost_basis)
        version = bom_v3.get_version_or_raise(db, version_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    filename = quote(f"{version.sku}-{version.version_name}-成本看板.xlsx")
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )
