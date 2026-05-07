from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api_v3 import router as api_v3_router
from .database import init_db


APP_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIR = APP_ROOT / "frontend"


def create_app() -> FastAPI:
    app = FastAPI(
        title="BOM-v3 ERP 产品成本管控系统",
        description="单底表上传、成本核算、版本对比和风险看板 MVP。",
        version="0.3.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_v3_router)

    if FRONTEND_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.on_event("startup")
    def startup() -> None:
        init_db()

    @app.get("/api/health")
    def health() -> dict:
        return {"success": True, "data": {"status": "ok", "app": "BOM-v3"}, "errorCode": None, "message": ""}

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")

    return app


app = create_app()
