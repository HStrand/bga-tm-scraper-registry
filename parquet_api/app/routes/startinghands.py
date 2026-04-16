from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path
from app.sql_fixups import normalized_card_expr

router = APIRouter(prefix="/api/startinghands", tags=["startinghands"])


def _stats_sql() -> str:
    return f"""
    WITH all_players AS (
        SELECT gp.TableId, gp.PlayerId, CAST(gp.EloChange AS DOUBLE) AS EloChange
        FROM read_parquet('{parquet_path("games_canonical")}') g
        JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
          ON gp.TableId = g.TableId
        JOIN read_parquet('{parquet_path("gamestats")}') gs
          ON gs.TableId = g.TableId
        WHERE g.ColoniesOn = FALSE
          AND g.DraftOn = TRUE
          AND g.GameMode <> 'Friendly mode'
          AND gs.PlayerCount = 2
    ),
    card_offers AS (
        SELECT DISTINCT TableId, PlayerId, {normalized_card_expr("Card")} AS Card, Kept
        FROM read_parquet('{parquet_path("startinghandcards")}')
    )
    SELECT
        co.Card                                                       AS card,
        CAST(count(*) AS BIGINT)                                      AS offeredGames,
        CAST(sum(CASE WHEN co.Kept = TRUE THEN 1 ELSE 0 END) AS BIGINT)  AS keptGames,
        CAST(sum(CASE WHEN co.Kept = FALSE THEN 1 ELSE 0 END) AS BIGINT) AS notKeptGames,
        CAST(sum(CASE WHEN co.Kept = TRUE THEN 1 ELSE 0 END) AS DOUBLE)
            / nullif(count(*), 0)                                     AS keepRate,
        avg(ap.EloChange)                                             AS avgEloChangeOffered,
        avg(CASE WHEN co.Kept = TRUE THEN ap.EloChange END)           AS avgEloChangeKept,
        avg(CASE WHEN co.Kept = FALSE THEN ap.EloChange END)          AS avgEloChangeNotKept
    FROM card_offers co
    JOIN all_players ap
      ON ap.TableId = co.TableId AND ap.PlayerId = co.PlayerId
    WHERE co.Card NOT IN ('City', 'Greenery', 'Aquifer', 'Sell patents')
    GROUP BY co.Card
    ORDER BY avgEloChangeOffered DESC
    """


@router.get("/stats")
def get_starting_hand_stats(request: Request):
    rows = request.app.state.db.cursor().execute(_stats_sql()).fetch_arrow_table().to_pylist()
    return JSONResponse(content=rows)
