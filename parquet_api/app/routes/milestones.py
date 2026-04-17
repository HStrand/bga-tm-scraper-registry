from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api", tags=["milestones"])


# SQL expression that mirrors MilestoneStatsService.FormatMilestoneName:
#   - "POLAR" → "Polar Explorer"  (plus "POLAR EXPLORER" collapses to the same via title-case)
#   - "RIM"   → "Rim Settler"     (same for "RIM SETTLER")
#   - everything else: title-case each word, splitting on underscore/space/hyphen
_FORMATTED_MILESTONE_SQL = """
    CASE
        WHEN upper({col}) = 'POLAR' THEN 'Polar Explorer'
        WHEN upper({col}) = 'RIM' THEN 'Rim Settler'
        ELSE list_aggregate(
            list_transform(
                string_split(replace(replace({col}, '_', ' '), '-', ' '), ' '),
                w -> upper(substr(w, 1, 1)) || lower(substr(w, 2))
            ),
            'string_agg', ' '
        )
    END
"""


def _formatted_milestone(col: str) -> str:
    return _FORMATTED_MILESTONE_SQL.format(col=col)


def _base_claim_rows_sql() -> str:
    """Per-claim rows joined with game/player/corp context. The granularity is one row per
    (TableId, PlayerId who claimed, Milestone). Corporation is normalized to match
    corporations.py (Allied Bank → Allied Banks)."""
    return f"""
    SELECT
        gm.TableId                                                        AS tableId,
        g.Map                                                             AS map,
        g.PreludeOn                                                       AS preludeOn,
        g.ColoniesOn                                                      AS coloniesOn,
        g.DraftOn                                                         AS draftOn,
        g.GameMode                                                        AS gameMode,
        g.GameSpeed                                                       AS gameSpeed,
        gs.PlayerCount                                                    AS playerCount,
        gs.Generations                                                    AS generations,
        {_formatted_milestone("gm.Milestone")}                            AS milestone,
        gm.ClaimedGen                                                     AS claimedGen,
        gp.PlayerId                                                       AS playerId,
        gp.PlayerName                                                     AS playerName,
        gp.Elo                                                            AS elo,
        gp.EloChange                                                      AS eloChange,
        gp.Position                                                       AS position,
        CASE
            WHEN lower(gps.Corporation) = 'allied bank' THEN 'Allied Banks'
            ELSE gps.Corporation
        END                                                               AS corporation
    FROM read_parquet('{parquet_path("gamemilestones")}') gm
    JOIN read_parquet('{parquet_path("games_canonical")}') g
      ON g.TableId = gm.TableId
    JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
      ON gp.TableId = gm.TableId AND gp.PlayerId = gm.ClaimedBy
    JOIN read_parquet('{parquet_path("gameplayerstats")}') gps
      ON gps.TableId = gm.TableId AND gps.PlayerId = gm.ClaimedBy
    JOIN read_parquet('{parquet_path("gamestats")}') gs
      ON gs.TableId = gm.TableId
    WHERE gm.Milestone IS NOT NULL AND trim(gm.Milestone) <> ''
    """


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


@router.get("/milestones/overview")
def get_milestones_overview(request: Request):
    qp = request.query_params

    maps = _collect(qp, "maps", "map")
    modes = _collect(qp, "modes", "gameModes")
    speeds = _collect(qp, "speeds", "speed", "gameSpeeds", "gameSpeed")
    player_counts = [int(x) for x in _collect(qp, "playerCounts", "playerCount") if x.lstrip("-").isdigit()]
    prelude_on = _parse_bool(_first(qp, "preludeOn", "prelude"))
    colonies_on = _parse_bool(_first(qp, "coloniesOn", "colonies"))
    draft_on = _parse_bool(_first(qp, "draftOn", "draft"))
    elo_min = _parse_int(_first(qp, "eloMin"))
    elo_max = _parse_int(_first(qp, "eloMax"))
    gen_min = _parse_int(_first(qp, "generationsMin", "genMin"))
    gen_max = _parse_int(_first(qp, "generationsMax", "genMax"))
    claim_gen_min = _parse_int(_first(qp, "claimedGenMin"))
    claim_gen_max = _parse_int(_first(qp, "claimedGenMax"))
    times_min = _parse_int(_first(qp, "timesPlayedMin", "playsMin"))
    times_max = _parse_int(_first(qp, "timesPlayedMax", "playsMax"))
    player_name = _first(qp, "playerName")
    corporation = _first(qp, "corporation", "corp")

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
        where.append("elo >= ?")
        params.append(elo_min)
    if elo_max is not None:
        where.append("elo <= ?")
        params.append(elo_max)
    if gen_min is not None:
        where.append("generations >= ?")
        params.append(gen_min)
    if gen_max is not None:
        where.append("generations <= ?")
        params.append(gen_max)
    if claim_gen_min is not None:
        where.append("claimedGen >= ?")
        params.append(claim_gen_min)
    if claim_gen_max is not None:
        where.append("claimedGen <= ?")
        params.append(claim_gen_max)
    if player_name:
        escaped = player_name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").lower()
        where.append("lower(playerName) LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    if corporation:
        where.append("lower(corporation) = ?")
        params.append(corporation.strip().lower())

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    having: list[str] = []
    if times_min is not None:
        having.append("timesClaimed >= ?")
        params.append(times_min)
    if times_max is not None:
        having.append("timesClaimed <= ?")
        params.append(times_max)
    having_sql = f"HAVING {' AND '.join(having)}" if having else ""

    sql = f"""
    WITH base AS ({_base_claim_rows_sql()})
    SELECT
        milestone,
        count(*)                                                          AS timesClaimed,
        sum(CASE WHEN position = 1 THEN 1.0 ELSE 0.0 END) / count(*)      AS winRate,
        avg(coalesce(CAST(eloChange AS DOUBLE), 0))                       AS avgEloGain,
        avg(CAST(claimedGen AS DOUBLE))                                   AS avgGenClaimed,
        avg(coalesce(CAST(elo AS DOUBLE), 0))                             AS avgElo
    FROM base
    {where_sql}
    GROUP BY milestone
    {having_sql}
    ORDER BY winRate DESC
    """
    arrow = request.app.state.db.cursor().execute(sql, params).fetch_arrow_table()
    return JSONResponse(content=arrow.to_pylist())


@router.get("/milestones/options")
def get_milestones_filter_options(request: Request):
    db = request.app.state.db.cursor()
    base = _base_claim_rows_sql()

    gen_row = db.execute(
        f"WITH base AS ({base}) SELECT min(claimedGen), max(claimedGen) FROM base WHERE claimedGen IS NOT NULL"
    ).fetchone()

    corps = [r[0] for r in db.execute(
        f"""
        WITH base AS ({base})
        SELECT DISTINCT corporation FROM base
        WHERE corporation IS NOT NULL AND trim(corporation) <> '' AND lower(corporation) <> 'unknown'
        ORDER BY lower(corporation)
        """
    ).fetchall()]

    return JSONResponse(content={
        "claimedGenRange": {
            "min": int(gen_row[0]) if gen_row and gen_row[0] is not None else 0,
            "max": int(gen_row[1]) if gen_row and gen_row[1] is not None else 0,
        },
        "corporations": corps,
    })


@router.get("/GetPlayerMilestoneStats")
def get_player_milestone_stats(request: Request):
    sql = f"""
    WITH player_tharsis_tables AS (
        SELECT gp.PlayerId, gp.PlayerName, gp.TableId
        FROM read_parquet('{parquet_path("gameplayers_canonical")}') gp
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = gp.TableId
        WHERE g.Map = 'Tharsis'
    ),
    tharsis_games AS (
        SELECT PlayerId, max(PlayerName) AS PlayerName, count(DISTINCT TableId) AS TharsisGames
        FROM player_tharsis_tables
        GROUP BY PlayerId
    ),
    milestone_claims AS (
        SELECT gm.ClaimedBy AS PlayerId, gm.Milestone, count(DISTINCT gm.TableId) AS Claims
        FROM read_parquet('{parquet_path("gamemilestones")}') gm
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = gm.TableId
        WHERE g.Map = 'Tharsis'
          AND gm.Milestone IN ('Terraformer', 'Gardener', 'Builder', 'Mayor', 'Planner')
        GROUP BY gm.ClaimedBy, gm.Milestone
    ),
    milestones_pivot AS (
        SELECT
            PlayerId,
            sum(CASE WHEN Milestone = 'Terraformer' THEN Claims ELSE 0 END) AS Terraformer,
            sum(CASE WHEN Milestone = 'Gardener'    THEN Claims ELSE 0 END) AS Gardener,
            sum(CASE WHEN Milestone = 'Builder'     THEN Claims ELSE 0 END) AS Builder,
            sum(CASE WHEN Milestone = 'Mayor'       THEN Claims ELSE 0 END) AS Mayor,
            sum(CASE WHEN Milestone = 'Planner'     THEN Claims ELSE 0 END) AS Planner
        FROM milestone_claims
        GROUP BY PlayerId
    )
    SELECT
        CAST(tg.PlayerId AS BIGINT)                                                AS playerId,
        tg.PlayerName                                                              AS playerName,
        CAST(tg.TharsisGames AS BIGINT)                                            AS tharsisGames,
        CAST(coalesce(mp.Terraformer, 0) AS BIGINT)                                AS terraformer,
        CAST(coalesce(mp.Gardener,    0) AS BIGINT)                                AS gardener,
        CAST(coalesce(mp.Builder,     0) AS BIGINT)                                AS builder,
        CAST(coalesce(mp.Mayor,       0) AS BIGINT)                                AS mayor,
        CAST(coalesce(mp.Planner,     0) AS BIGINT)                                AS planner,
        CAST(coalesce(mp.Terraformer, 0) AS DOUBLE) / nullif(tg.TharsisGames, 0)   AS terraformerRate,
        CAST(coalesce(mp.Gardener,    0) AS DOUBLE) / nullif(tg.TharsisGames, 0)   AS gardenerRate,
        CAST(coalesce(mp.Builder,     0) AS DOUBLE) / nullif(tg.TharsisGames, 0)   AS builderRate,
        CAST(coalesce(mp.Mayor,       0) AS DOUBLE) / nullif(tg.TharsisGames, 0)   AS mayorRate,
        CAST(coalesce(mp.Planner,     0) AS DOUBLE) / nullif(tg.TharsisGames, 0)   AS plannerRate
    FROM tharsis_games tg
    LEFT JOIN milestones_pivot mp ON mp.PlayerId = tg.PlayerId
    WHERE tg.TharsisGames >= 30
    """
    arrow = request.app.state.db.cursor().execute(sql).fetch_arrow_table()
    return JSONResponse(content=arrow.to_pylist())
