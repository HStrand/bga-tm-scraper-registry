from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/awards", tags=["awards"])


def _award_rows_sql() -> str:
    return f"""
    WITH best_gps AS (
        SELECT
            TableId, PlayerId, Corporation,
            row_number() OVER (
                PARTITION BY TableId, PlayerId
                ORDER BY UpdatedAt DESC
            ) AS rn
        FROM read_parquet('{parquet_path("gameplayerstats")}')
    ),
    best_gpa AS (
        SELECT
            TableId, PlayerId, Award, FundedBy, FundedGen, PlayerCounter, PlayerPlace,
            row_number() OVER (
                PARTITION BY TableId, PlayerId, Award
                ORDER BY UpdatedAt DESC
            ) AS rn
        FROM read_parquet('{parquet_path("gameplayerawards")}')
    )
    SELECT
        gpa.TableId          AS TableId,
        g.Map                AS Map,
        g.PreludeOn          AS PreludeOn,
        g.ColoniesOn         AS ColoniesOn,
        g.DraftOn            AS DraftOn,
        g.GameMode           AS GameMode,
        g.GameSpeed          AS GameSpeed,
        gs.PlayerCount       AS PlayerCount,
        gs.DurationMinutes   AS DurationMinutes,
        gs.Generations       AS Generations,
        gpa.Award            AS Award,
        gpa.FundedBy         AS FundedBy,
        gpa.FundedGen        AS FundedGen,
        gpa.PlayerId         AS PlayerId,
        gp.PlayerName        AS PlayerName,
        gp.Elo               AS Elo,
        gp.EloChange         AS EloChange,
        gp.Position          AS Position,
        gpa.PlayerCounter    AS PlayerCounter,
        gpa.PlayerPlace      AS PlayerPlace,
        gps.Corporation      AS Corporation
    FROM best_gpa gpa
    JOIN read_parquet('{parquet_path("games_canonical")}') g
      ON g.TableId = gpa.TableId
    JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
      ON gp.TableId = gpa.TableId AND gp.PlayerId = gpa.PlayerId
    JOIN best_gps gps
      ON gps.TableId = gpa.TableId AND gps.PlayerId = gpa.PlayerId AND gps.rn = 1
    JOIN read_parquet('{parquet_path("gamestats")}') gs
      ON gs.TableId = gpa.TableId
    WHERE gpa.Award IS NOT NULL AND gpa.Award <> '' AND gpa.rn = 1
    ORDER BY gpa.TableId DESC
    """


@router.get("/rows")
def get_all_award_rows(request: Request):
    arrow_table = request.app.state.db.execute(_award_rows_sql()).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())
