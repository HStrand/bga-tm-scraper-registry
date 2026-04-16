from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path
from app.sql_fixups import normalized_card_expr

router = APIRouter(prefix="/api/combinations", tags=["combinations"])


def _eligible_players_cte_body() -> str:
    return f"""
    eligible_players AS (
        SELECT gpc.TableId, gpc.PlayerId, gpc.EloChange, gpc.Position
        FROM read_parquet('{parquet_path("gameplayers_canonical")}') gpc
        JOIN read_parquet('{parquet_path("games_canonical")}') gc
          ON gc.TableId = gpc.TableId
        JOIN read_parquet('{parquet_path("gamestats")}') gs
          ON gs.TableId = gpc.TableId
        WHERE gs.PlayerCount = 2
          AND gc.GameMode <> 'Friendly mode'
          AND gc.ColoniesOn = FALSE
          AND gc.PreludeOn = TRUE
          AND gc.DraftOn = TRUE
    )
    """


def _normalized_cards_cte_body() -> str:
    return f"""
    normalized_cards AS (
        SELECT TableId, PlayerId, Kept,
            {normalized_card_expr("Card")} AS Card
        FROM read_parquet('{parquet_path("startinghandcards")}')
    )
    """


def _normalized_preludes_cte_body() -> str:
    return f"""
    normalized_preludes AS (
        SELECT TableId, PlayerId, Kept,
            CASE
                WHEN lower(Prelude) = 'allied bank' THEN 'Allied Banks'
                WHEN lower(Prelude) = 'excentric sponsor' THEN 'Eccentric Sponsor'
                ELSE Prelude
            END AS Prelude
        FROM read_parquet('{parquet_path("startinghandpreludes")}')
    )
    """


def _with_ctes(*bodies: str) -> str:
    return "WITH " + ", ".join(b.strip() for b in bodies)


def _baseline_sql_generic(source_parquet: str, item_column: str) -> str:
    return f"""
    {_with_ctes(_eligible_players_cte_body())}
    SELECT
        sh.{item_column}                                                   AS name,
        count(*)                                                           AS gameCount,
        avg(CAST(ep.EloChange AS DOUBLE))                                  AS avgEloChange,
        avg(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END)               AS winRate
    FROM eligible_players ep
    JOIN read_parquet('{parquet_path(source_parquet)}') sh
      ON sh.TableId = ep.TableId AND sh.PlayerId = ep.PlayerId AND sh.Kept = TRUE
    GROUP BY sh.{item_column}
    ORDER BY avgEloChange DESC, gameCount DESC
    """


def _baseline_cards_sql() -> str:
    return f"""
    {_with_ctes(_eligible_players_cte_body(), _normalized_cards_cte_body())}
    SELECT
        sh.Card                                                            AS name,
        count(*)                                                           AS gameCount,
        avg(CAST(ep.EloChange AS DOUBLE))                                  AS avgEloChange,
        avg(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END)               AS winRate
    FROM eligible_players ep
    JOIN normalized_cards sh
      ON sh.TableId = ep.TableId AND sh.PlayerId = ep.PlayerId AND sh.Kept = TRUE
    GROUP BY sh.Card
    ORDER BY avgEloChange DESC, gameCount DESC
    """


def _baseline_preludes_sql() -> str:
    return f"""
    {_with_ctes(_eligible_players_cte_body(), _normalized_preludes_cte_body())}
    SELECT
        sh.Prelude                                                         AS name,
        count(*)                                                           AS gameCount,
        avg(CAST(ep.EloChange AS DOUBLE))                                  AS avgEloChange,
        avg(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END)               AS winRate
    FROM eligible_players ep
    JOIN normalized_preludes sh
      ON sh.TableId = ep.TableId AND sh.PlayerId = ep.PlayerId AND sh.Kept = TRUE
    GROUP BY sh.Prelude
    ORDER BY avgEloChange DESC, gameCount DESC
    """


@router.get("/baselines")
def get_combination_baselines(request: Request):
    db = request.app.state.db.cursor()
    cards = db.execute(_baseline_cards_sql()).fetch_arrow_table().to_pylist()
    corporations = db.execute(_baseline_sql_generic("startinghandcorporations", "Corporation")).fetch_arrow_table().to_pylist()
    preludes = db.execute(_baseline_preludes_sql()).fetch_arrow_table().to_pylist()
    return JSONResponse(content={
        "cards": cards,
        "corporations": corporations,
        "preludes": preludes,
    })


def _combo_sql(combo_type: str) -> str:
    min_games = 100
    ep_cte = _eligible_players_cte_body()
    np_cte = _normalized_preludes_cte_body()
    nc_cte = _normalized_cards_cte_body()

    if combo_type == "corp-prelude":
        return f"""
        {_with_ctes(ep_cte, np_cte)}
        SELECT
            shc.Corporation                                                AS name1,
            shp.Prelude                                                    AS name2,
            count(*)                                                       AS gameCount,
            avg(CAST(ep.EloChange AS DOUBLE))                              AS avgEloChange,
            avg(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END)           AS winRate
        FROM eligible_players ep
        JOIN read_parquet('{parquet_path("startinghandcorporations")}') shc
          ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = TRUE
        JOIN normalized_preludes shp
          ON shp.TableId = ep.TableId AND shp.PlayerId = ep.PlayerId AND shp.Kept = TRUE
        GROUP BY shc.Corporation, shp.Prelude
        HAVING count(*) >= {min_games}
        ORDER BY avgEloChange DESC, gameCount DESC
        """

    if combo_type == "corp-card":
        return f"""
        {_with_ctes(ep_cte, nc_cte)}
        SELECT
            shcorp.Corporation                                             AS name1,
            shc.Card                                                       AS name2,
            count(*)                                                       AS gameCount,
            avg(CAST(ep.EloChange AS DOUBLE))                              AS avgEloChange,
            avg(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END)           AS winRate
        FROM eligible_players ep
        JOIN read_parquet('{parquet_path("startinghandcorporations")}') shcorp
          ON shcorp.TableId = ep.TableId AND shcorp.PlayerId = ep.PlayerId AND shcorp.Kept = TRUE
        JOIN normalized_cards shc
          ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = TRUE
        GROUP BY shcorp.Corporation, shc.Card
        HAVING count(*) >= {min_games}
        ORDER BY avgEloChange DESC, gameCount DESC
        """

    if combo_type == "prelude-prelude":
        return f"""
        {_with_ctes(ep_cte, np_cte)},
        eligible_preludes AS (
            SELECT ep.TableId, ep.PlayerId, shp.Prelude, ep.EloChange, ep.Position
            FROM eligible_players ep
            JOIN normalized_preludes shp
              ON shp.TableId = ep.TableId AND shp.PlayerId = ep.PlayerId AND shp.Kept = TRUE
        )
        SELECT
            p1.Prelude                                                     AS name1,
            p2.Prelude                                                     AS name2,
            count(*)                                                       AS gameCount,
            avg(CAST(p1.EloChange AS DOUBLE))                              AS avgEloChange,
            avg(CASE WHEN p1.Position = 1 THEN 1.0 ELSE 0.0 END)           AS winRate
        FROM eligible_preludes p1
        JOIN eligible_preludes p2
          ON p2.TableId = p1.TableId AND p2.PlayerId = p1.PlayerId AND p1.Prelude < p2.Prelude
        GROUP BY p1.Prelude, p2.Prelude
        HAVING count(*) >= {min_games}
        ORDER BY avgEloChange DESC, gameCount DESC
        """

    if combo_type == "prelude-card":
        return f"""
        {_with_ctes(ep_cte, np_cte, nc_cte)}
        SELECT
            shp.Prelude                                                    AS name1,
            shc.Card                                                       AS name2,
            count(*)                                                       AS gameCount,
            avg(CAST(ep.EloChange AS DOUBLE))                              AS avgEloChange,
            avg(CASE WHEN ep.Position = 1 THEN 1.0 ELSE 0.0 END)           AS winRate
        FROM eligible_players ep
        JOIN normalized_preludes shp
          ON shp.TableId = ep.TableId AND shp.PlayerId = ep.PlayerId AND shp.Kept = TRUE
        JOIN normalized_cards shc
          ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = TRUE
        GROUP BY shp.Prelude, shc.Card
        HAVING count(*) >= {min_games}
        ORDER BY avgEloChange DESC, gameCount DESC
        """

    if combo_type == "card-card":
        return f"""
        {_with_ctes(ep_cte, nc_cte)},
        eligible_cards AS (
            SELECT ep.TableId, ep.PlayerId, shc.Card, ep.EloChange, ep.Position
            FROM eligible_players ep
            JOIN normalized_cards shc
              ON shc.TableId = ep.TableId AND shc.PlayerId = ep.PlayerId AND shc.Kept = TRUE
        )
        SELECT
            c1.Card                                                        AS name1,
            c2.Card                                                        AS name2,
            count(*)                                                       AS gameCount,
            avg(CAST(c1.EloChange AS DOUBLE))                              AS avgEloChange,
            avg(CASE WHEN c1.Position = 1 THEN 1.0 ELSE 0.0 END)           AS winRate
        FROM eligible_cards c1
        JOIN eligible_cards c2
          ON c2.TableId = c1.TableId AND c2.PlayerId = c1.PlayerId AND c1.Card < c2.Card
        GROUP BY c1.Card, c2.Card
        HAVING count(*) >= {min_games}
        ORDER BY avgEloChange DESC, gameCount DESC
        """

    raise HTTPException(status_code=400, detail=f"unknown combo type: {combo_type}")


@router.get("/combos/{combo_type}")
def get_combination_combos(combo_type: str, request: Request):
    sql = _combo_sql(combo_type)
    rows = request.app.state.db.cursor().execute(sql).fetch_arrow_table().to_pylist()
    return JSONResponse(content=rows)
