from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api", tags=["leaderboards"])


# ── shared helpers ─────────────────────────────────────────────


def _first(qp, *keys):
    for k in keys:
        v = qp.get(k)
        if v is not None:
            s = v.strip()
            if s:
                return s
    return None


def _collect(qp, *keys):
    out: list[str] = []
    for k in keys:
        for raw in qp.getlist(k):
            if not raw:
                continue
            for part in raw.split(","):
                t = part.strip()
                if t:
                    out.append(t)
    return out


def _parse_bool(s):
    if s is None:
        return None
    lower = s.strip().lower()
    if lower in ("true", "1", "y", "yes", "on"):
        return True
    if lower in ("false", "0", "n", "no", "off"):
        return False
    return None


def _parse_int(s):
    if s is None:
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


# ── high scores (leaderboards/options + scores) ────────────────


def _scores_base_cte() -> str:
    return f"""
    best_stats AS (
        SELECT TableId, PlayerId,
               max(FinalScore) AS FinalScore,
               max(Corporation) AS Corporation
        FROM read_parquet('{parquet_path("gameplayerstats")}')
        WHERE Corporation <> 'Unknown'
        GROUP BY TableId, PlayerId
    ),
    base AS (
        SELECT
            CAST(bs.TableId AS BIGINT)        AS tableId,
            CAST(bs.PlayerId AS BIGINT)       AS playerId,
            gp.PlayerName                     AS playerName,
            gp.Elo                            AS elo,
            bs.Corporation                    AS corporation,
            g.Map                             AS map,
            g.ColoniesOn                      AS coloniesOn,
            g.GameMode                        AS gameMode,
            g.GameSpeed                       AS gameSpeed,
            g.PreludeOn                       AS preludeOn,
            g.DraftOn                         AS draftOn,
            gs.Generations                    AS generations,
            gs.PlayerCount                    AS playerCount,
            bs.FinalScore                     AS finalScore
        FROM best_stats bs
        LEFT JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
          ON gp.TableId = bs.TableId AND gp.PlayerId = bs.PlayerId
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = bs.TableId
        LEFT JOIN read_parquet('{parquet_path("gamestats")}') gs
          ON gs.TableId = bs.TableId
        WHERE bs.FinalScore IS NOT NULL
    )
    """


@router.get("/leaderboards/options")
def get_leaderboard_score_options(request: Request):
    db = request.app.state.db.cursor()
    sql = f"""
    WITH {_scores_base_cte()}
    SELECT
        (SELECT list(DISTINCT map ORDER BY map) FROM base WHERE map IS NOT NULL AND trim(map) <> '') AS maps,
        (SELECT list(DISTINCT gameMode ORDER BY gameMode) FROM base WHERE gameMode IS NOT NULL AND trim(gameMode) <> '') AS modes,
        (SELECT list(DISTINCT gameSpeed ORDER BY gameSpeed) FROM base WHERE gameSpeed IS NOT NULL AND trim(gameSpeed) <> '') AS speeds,
        (SELECT list(DISTINCT playerCount ORDER BY playerCount) FROM base WHERE playerCount IS NOT NULL) AS pcs,
        (SELECT list(DISTINCT corporation ORDER BY lower(corporation)) FROM base WHERE corporation IS NOT NULL AND trim(corporation) <> '') AS corps,
        (SELECT min(elo) FROM base WHERE elo IS NOT NULL AND elo > 0) AS elo_min,
        (SELECT max(elo) FROM base WHERE elo IS NOT NULL AND elo > 0) AS elo_max,
        (SELECT min(generations) FROM base WHERE generations IS NOT NULL) AS gen_min,
        (SELECT max(generations) FROM base WHERE generations IS NOT NULL) AS gen_max
    """
    row = db.execute(sql).fetchone()
    return JSONResponse(content={
        "maps": list(row[0] or []),
        "gameModes": list(row[1] or []),
        "gameSpeeds": list(row[2] or []),
        "playerCounts": [int(x) for x in (row[3] or [])],
        "corporations": list(row[4] or []),
        "eloRange": {
            "min": int(row[5]) if row[5] is not None else 0,
            "max": int(row[6]) if row[6] is not None else 0,
        },
        "generationsRange": {
            "min": int(row[7]) if row[7] is not None else 0,
            "max": int(row[8]) if row[8] is not None else 0,
        },
    })


@router.get("/leaderboards/scores")
def get_leaderboard_scores(request: Request):
    qp = request.query_params
    limit = max(1, min(100, _parse_int(_first(qp, "limit")) or 25))

    maps = _collect(qp, "maps", "map")
    modes = _collect(qp, "modes", "gameModes", "mode")
    speeds = _collect(qp, "speeds", "speed", "gameSpeeds", "gameSpeed")
    player_counts = [int(x) for x in _collect(qp, "playerCounts", "playerCount") if x.lstrip("-").isdigit()]
    prelude_on = _parse_bool(_first(qp, "preludeOn", "prelude"))
    colonies_on = _parse_bool(_first(qp, "coloniesOn", "colonies"))
    draft_on = _parse_bool(_first(qp, "draftOn", "draft"))
    elo_min = _parse_int(_first(qp, "eloMin"))
    elo_max = _parse_int(_first(qp, "eloMax"))
    gen_min = _parse_int(_first(qp, "generationsMin", "genMin"))
    gen_max = _parse_int(_first(qp, "generationsMax", "genMax"))
    player_name = _first(qp, "playerName")
    corporation = _first(qp, "corporation")

    where: list[str] = []
    params: list = []

    def _in_clause(col, values):
        where.append(f"{col} IN ({','.join(['?'] * len(values))})")
        params.extend(values)

    if maps:
        _in_clause("map", maps)
    if modes:
        _in_clause("gameMode", modes)
    if speeds:
        _in_clause("gameSpeed", speeds)
    if player_counts:
        _in_clause("playerCount", player_counts)
    if prelude_on is not None:
        where.append("preludeOn = ?")
        params.append(prelude_on)
    if colonies_on is not None:
        where.append("coloniesOn = ?")
        params.append(colonies_on)
    if draft_on is not None:
        where.append("draftOn = ?")
        params.append(draft_on)
    if elo_min is not None:
        where.append("elo > 0 AND elo >= ?")
        params.append(elo_min)
    if elo_max is not None:
        where.append("elo > 0 AND elo <= ?")
        params.append(elo_max)
    if gen_min is not None:
        where.append("generations >= ?")
        params.append(gen_min)
    if gen_max is not None:
        where.append("generations <= ?")
        params.append(gen_max)
    if player_name:
        escaped = player_name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").lower()
        where.append("lower(playerName) LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    if corporation:
        where.append("lower(corporation) = ?")
        params.append(corporation.strip().lower())

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    sql = f"""
    WITH {_scores_base_cte()}
    SELECT *
    FROM base
    {where_sql}
    ORDER BY finalScore DESC, elo DESC NULLS LAST
    LIMIT ?
    """
    arrow = request.app.state.db.cursor().execute(sql, params + [limit]).fetch_arrow_table()
    return JSONResponse(content=arrow.to_pylist())


# ── per-player leaderboards (Tharsis >=30 games for award, all games >=30 for others) ────


@router.get("/GetPlayerGreeneryStats")
def get_player_greenery_stats(request: Request):
    sql = f"""
    WITH agg AS (
        SELECT PlayerId,
               CAST(count(*) AS BIGINT) AS Greeneries,
               CAST(count(DISTINCT TableId) AS BIGINT) AS GameCount
        FROM read_parquet('{parquet_path("gamegreenerylocations")}')
        GROUP BY PlayerId
    ),
    player_games AS (
        SELECT DISTINCT PlayerId, TableId
        FROM read_parquet('{parquet_path("gamegreenerylocations")}')
    ),
    gen_per_player AS (
        SELECT pg.PlayerId,
               CAST(sum(gs.Generations) AS BIGINT) AS TotalGenerations
        FROM player_games pg
        JOIN read_parquet('{parquet_path("gamestats")}') gs
          ON gs.TableId = pg.TableId
        GROUP BY pg.PlayerId
    )
    SELECT
        CAST(a.PlayerId AS BIGINT)                                          AS playerId,
        p.Name                                                              AS name,
        a.Greeneries                                                        AS greeneries,
        a.GameCount                                                         AS gameCount,
        CAST(a.Greeneries AS DOUBLE) / nullif(a.GameCount, 0)               AS greeneriesPerGame,
        CAST(a.Greeneries AS DOUBLE) / nullif(gpp.TotalGenerations, 0)      AS greeneriesPerGeneration
    FROM agg a
    JOIN read_parquet('{parquet_path("players")}') p
      ON p.PlayerId = a.PlayerId
    JOIN gen_per_player gpp
      ON gpp.PlayerId = a.PlayerId
    WHERE a.GameCount >= 30
    ORDER BY greeneriesPerGeneration DESC
    """
    arrow = request.app.state.db.cursor().execute(sql).fetch_arrow_table()
    return JSONResponse(content=arrow.to_pylist())


@router.get("/GetPlayerParameterStats")
def get_player_parameter_stats(request: Request):
    sql = f"""
    WITH agg AS (
        SELECT IncreasedBy AS PlayerId,
               CAST(count(*) AS BIGINT) AS ParameterIncreases,
               CAST(count(DISTINCT TableId) AS BIGINT) AS GameCount
        FROM read_parquet('{parquet_path("parameterchanges")}')
        GROUP BY IncreasedBy
    )
    SELECT
        CAST(a.PlayerId AS BIGINT)                                             AS playerId,
        p.Name                                                                 AS name,
        a.ParameterIncreases                                                   AS parameterIncreases,
        a.GameCount                                                            AS gameCount,
        CAST(a.ParameterIncreases AS DOUBLE) / nullif(a.GameCount, 0)          AS parameterIncreasesPerGame
    FROM agg a
    JOIN read_parquet('{parquet_path("players")}') p
      ON p.PlayerId = a.PlayerId
    WHERE a.GameCount >= 30
    ORDER BY parameterIncreasesPerGame DESC
    """
    arrow = request.app.state.db.cursor().execute(sql).fetch_arrow_table()
    return JSONResponse(content=arrow.to_pylist())


@router.get("/GetPlayerAwardStats")
def get_player_award_stats(request: Request):
    sql = f"""
    WITH tharsis_games AS (
        SELECT gp.PlayerId,
               p.Name AS PlayerName,
               CAST(count(DISTINCT gp.TableId) AS BIGINT) AS TharsisGames
        FROM read_parquet('{parquet_path("gameplayers_canonical")}') gp
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = gp.TableId
        LEFT JOIN read_parquet('{parquet_path("players")}') p
          ON p.PlayerId = gp.PlayerId
        WHERE g.Map = 'Tharsis'
        GROUP BY gp.PlayerId, p.Name
    ),
    awards AS (
        SELECT gpa.PlayerId,
               sum(CASE WHEN gpa.Award = 'Thermalist' THEN 1 ELSE 0 END) AS Thermalist,
               sum(CASE WHEN gpa.Award = 'Banker'     THEN 1 ELSE 0 END) AS Banker,
               sum(CASE WHEN gpa.Award = 'Scientist'  THEN 1 ELSE 0 END) AS Scientist,
               sum(CASE WHEN gpa.Award = 'Miner'      THEN 1 ELSE 0 END) AS Miner,
               sum(CASE WHEN gpa.Award = 'Landlord'   THEN 1 ELSE 0 END) AS Landlord
        FROM read_parquet('{parquet_path("gameplayerawards")}') gpa
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = gpa.TableId
        WHERE g.Map = 'Tharsis'
          AND gpa.PlayerPlace = 1
          AND gpa.Award IN ('Thermalist', 'Banker', 'Scientist', 'Miner', 'Landlord')
        GROUP BY gpa.PlayerId
    )
    SELECT
        CAST(tg.PlayerId AS BIGINT)                                            AS playerId,
        tg.PlayerName                                                          AS playerName,
        tg.TharsisGames                                                        AS tharsisGames,
        CAST(coalesce(a.Thermalist, 0) AS BIGINT)                              AS thermalist,
        CAST(coalesce(a.Banker,     0) AS BIGINT)                              AS banker,
        CAST(coalesce(a.Scientist,  0) AS BIGINT)                              AS scientist,
        CAST(coalesce(a.Miner,      0) AS BIGINT)                              AS miner,
        CAST(coalesce(a.Landlord,   0) AS BIGINT)                              AS landlord,
        CAST(
            coalesce(a.Thermalist, 0) + coalesce(a.Banker, 0) +
            coalesce(a.Scientist,  0) + coalesce(a.Miner,  0) +
            coalesce(a.Landlord,   0) AS BIGINT
        )                                                                      AS totalFirsts,
        CAST(coalesce(a.Thermalist, 0) AS DOUBLE) / nullif(tg.TharsisGames, 0) AS thermalistRate,
        CAST(coalesce(a.Banker,     0) AS DOUBLE) / nullif(tg.TharsisGames, 0) AS bankerRate,
        CAST(coalesce(a.Scientist,  0) AS DOUBLE) / nullif(tg.TharsisGames, 0) AS scientistRate,
        CAST(coalesce(a.Miner,      0) AS DOUBLE) / nullif(tg.TharsisGames, 0) AS minerRate,
        CAST(coalesce(a.Landlord,   0) AS DOUBLE) / nullif(tg.TharsisGames, 0) AS landlordRate,
        CAST(
            coalesce(a.Thermalist, 0) + coalesce(a.Banker, 0) +
            coalesce(a.Scientist,  0) + coalesce(a.Miner,  0) +
            coalesce(a.Landlord,   0) AS DOUBLE
        ) / nullif(tg.TharsisGames, 0)                                         AS totalAwardRate
    FROM tharsis_games tg
    LEFT JOIN awards a ON a.PlayerId = tg.PlayerId
    WHERE tg.TharsisGames >= 30 AND tg.PlayerName IS NOT NULL
    """
    arrow = request.app.state.db.cursor().execute(sql).fetch_arrow_table()
    return JSONResponse(content=arrow.to_pylist())
