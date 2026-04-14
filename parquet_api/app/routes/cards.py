from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/cards", tags=["cards"])


def _card_stats_sql(gen_column: str) -> str:
    return f"""
    SELECT
        gc.Card                                                              AS card,
        count(*)                                                             AS timesPlayed,
        round(avg(CASE WHEN gp.Position = 1 THEN 1.0 ELSE 0.0 END), 3)       AS winRate,
        round(avg(CAST(gp.Elo AS DOUBLE)), 2)                                AS avgElo,
        round(avg(CAST(gp.EloChange AS DOUBLE)), 2)                          AS avgEloChange
    FROM read_parquet('{parquet_path("gamecards")}') gc
    JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
      ON gp.TableId = gc.TableId AND gp.PlayerId = gc.PlayerId
    WHERE gc.{gen_column} IS NOT NULL
    GROUP BY gc.Card
    """


@router.get("/stats")
def get_all_card_stats(request: Request):
    arrow_table = request.app.state.db.execute(_card_stats_sql("PlayedGen")).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


@router.get("/option-stats")
def get_all_card_option_stats(request: Request):
    arrow_table = request.app.state.db.execute(_card_stats_sql("DrawnGen")).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())
