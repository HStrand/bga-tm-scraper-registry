import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.db import DATA_DIR

router = APIRouter(tags=["bundle"])

BUNDLE_PATH = os.path.join(DATA_DIR, "tfmstats_db.zip")


@router.get("/api/download-db")
def download_db():
    if not os.path.exists(BUNDLE_PATH):
        raise HTTPException(status_code=404, detail="bundle not yet generated")
    return FileResponse(
        BUNDLE_PATH,
        media_type="application/zip",
        filename="tfmstats_db.zip",
    )
