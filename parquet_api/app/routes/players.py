from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("/search")
def search_players(request: Request):
    qp = request.query_params
    q = (qp.get("q") or "").strip()
    if len(q) < 2:
        return JSONResponse(content=[])

    limit_raw = qp.get("limit")
    try:
        limit = max(1, min(25, int(limit_raw))) if limit_raw else 10
    except (TypeError, ValueError):
        limit = 10

    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").lower()
    sql = f"""
    WITH counts AS (
        SELECT PlayerName, count(*) AS n
        FROM read_parquet('{parquet_path("gameplayers_canonical")}')
        WHERE PlayerName IS NOT NULL AND trim(PlayerName) <> ''
        GROUP BY PlayerName
    )
    SELECT PlayerName FROM counts
    WHERE lower(PlayerName) LIKE ? ESCAPE '\\'
    ORDER BY n DESC, lower(PlayerName)
    LIMIT ?
    """
    rows = request.app.state.db.cursor().execute(sql, [f"%{escaped}%", limit]).fetchall()
    return JSONResponse(content=[r[0] for r in rows])
