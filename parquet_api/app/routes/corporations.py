from __future__ import annotations

import math

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/corporations", tags=["corporations"])


def _base_select() -> str:
    return f"""
    SELECT
        gs.TableId         AS tableId,
        g.Map              AS map,
        g.PreludeOn        AS preludeOn,
        g.ColoniesOn       AS coloniesOn,
        g.DraftOn          AS draftOn,
        g.GameMode         AS gameMode,
        g.GameSpeed        AS gameSpeed,
        gs.PlayerCount     AS playerCount,
        gs.DurationMinutes AS durationMinutes,
        gs.Generations     AS generations,
        gps.FinalScore     AS finalScore,
        gps.FinalTr        AS finalTr,
        gps.GreeneryPoints AS greeneryPoints,
        gps.CityPoints     AS cityPoints,
        gps.MilestonePoints AS milestonePoints,
        gps.AwardPoints    AS awardPoints,
        gps.CardPoints     AS cardPoints,
        gps.PlayerId       AS playerId,
        gp.PlayerName      AS playerName,
        gp.Elo             AS elo,
        gp.EloChange       AS eloChange,
        gp.Position        AS position,
        CASE
            WHEN lower(gps.Corporation) = 'allied bank' THEN 'Allied Banks'
            ELSE gps.Corporation
        END                AS corporation
    FROM read_parquet('{parquet_path("gameplayerstats")}') gps
    JOIN read_parquet('{parquet_path("gamestats")}') gs
      ON gs.TableId = gps.TableId
    JOIN read_parquet('{parquet_path("games_canonical")}') g
      ON g.TableId = gps.TableId
    JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
      ON gp.TableId = gps.TableId AND gp.PlayerId = gps.PlayerId
    WHERE gps.Corporation <> 'Unknown'
    """


@router.get("/playerstats")
def get_all_corporation_player_stats(request: Request):
    sql = f"{_base_select()} ORDER BY gs.TableId DESC"
    arrow_table = request.app.state.db.cursor().execute(sql).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


def _first(qp, *keys):
    for k in keys:
        v = qp.get(k)
        if v is not None:
            s = v.strip()
            if s:
                return s
    return None


def _collect(qp, *keys):
    out = []
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


@router.get("/rankings")
def get_corporation_rankings(request: Request):
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
    times_min = _parse_int(_first(qp, "timesPlayedMin", "playsMin"))
    times_max = _parse_int(_first(qp, "timesPlayedMax", "playsMax"))
    player_name = _first(qp, "playerName")

    where = []
    params = []

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
    if player_name:
        escaped = player_name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").lower()
        where.append("lower(playerName) LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    having = []
    if times_min is not None:
        having.append("gamesPlayed >= ?")
        params.append(times_min)
    if times_max is not None:
        having.append("gamesPlayed <= ?")
        params.append(times_max)
    having_sql = f"HAVING {' AND '.join(having)}" if having else ""

    sql = f"""
    WITH base AS (
        {_base_select()}
    )
    SELECT
        corporation,
        sum(CASE WHEN position = 1 THEN 1 ELSE 0 END) * 100.0 / count(*) AS winRate,
        avg(coalesce(eloChange, 0))                                       AS avgEloGain,
        count(*)                                                          AS gamesPlayed,
        avg(coalesce(elo, 0))                                             AS avgElo
    FROM base
    {where_sql}
    GROUP BY corporation
    {having_sql}
    ORDER BY winRate DESC, gamesPlayed DESC
    """

    arrow_table = request.app.state.db.cursor().execute(sql, params).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


def _slug_to_corp_match(slug: str) -> str:
    # Slugs from nameToSlug() lowercase the name and replace spaces/hyphens with underscores.
    # Frontend → parquet matching is a case-insensitive compare on the spaces-version.
    return slug.replace("_", " ").strip().lower()


def _parse_corp_filter(qp, require_positive_elo: bool) -> tuple[list[str], list]:
    """Parse common corp filter query params into (where_clauses, params) against the `filtered` CTE."""
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
    player_name = _first(qp, "playerName")

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
        where.append("elo > 0 AND elo >= ?" if require_positive_elo else "elo >= ?")
        params.append(elo_min)
    if elo_max is not None:
        where.append("elo > 0 AND elo <= ?" if require_positive_elo else "elo <= ?")
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

    return where, params


def _filter_options_sql(corp_slug: str | None) -> tuple[str, list]:
    """Compute maps/modes/speeds/playerCounts + elo/generations ranges."""
    where: list[str] = []
    params: list = []
    if corp_slug:
        where.append("lower(corporation) = ?")
        params.append(_slug_to_corp_match(corp_slug))
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    # Per-corp options exclude elo=0 (C# parity); global keeps any non-null elo.
    elo_where = "elo IS NOT NULL AND elo > 0" if corp_slug else "elo IS NOT NULL"

    sql = f"""
    WITH base AS ({_base_select()}),
    filtered AS (SELECT * FROM base {where_sql})
    SELECT
        (SELECT list(DISTINCT map ORDER BY map) FROM filtered WHERE map IS NOT NULL AND trim(map) <> '') AS maps,
        (SELECT list(DISTINCT gameMode ORDER BY gameMode) FROM filtered WHERE gameMode IS NOT NULL AND trim(gameMode) <> '') AS modes,
        (SELECT list(DISTINCT gameSpeed ORDER BY gameSpeed) FROM filtered WHERE gameSpeed IS NOT NULL AND trim(gameSpeed) <> '') AS speeds,
        (SELECT list(DISTINCT playerCount ORDER BY playerCount) FROM filtered WHERE playerCount IS NOT NULL) AS pcs,
        (SELECT min(elo) FROM filtered WHERE {elo_where}) AS elo_min,
        (SELECT max(elo) FROM filtered WHERE {elo_where}) AS elo_max,
        (SELECT min(generations) FROM filtered WHERE generations IS NOT NULL) AS gen_min,
        (SELECT max(generations) FROM filtered WHERE generations IS NOT NULL) AS gen_max
    """
    return sql, params


def _options_response(row) -> dict:
    return {
        "maps": list(row[0] or []),
        "gameModes": list(row[1] or []),
        "gameSpeeds": list(row[2] or []),
        "playerCounts": [int(x) for x in (row[3] or [])],
        "eloRange": {
            "min": int(row[4]) if row[4] is not None else 0,
            "max": int(row[5]) if row[5] is not None else 0,
        },
        "generationsRange": {
            "min": int(row[6]) if row[6] is not None else 0,
            "max": int(row[7]) if row[7] is not None else 0,
        },
    }


@router.get("/options")
def get_corporation_options(request: Request):
    sql, params = _filter_options_sql(None)
    row = request.app.state.db.cursor().execute(sql, params).fetchone()
    return JSONResponse(content=_options_response(row))


@router.get("/{corporation}/options")
def get_corporation_detail_options(corporation: str, request: Request):
    sql, params = _filter_options_sql(corporation)
    row = request.app.state.db.cursor().execute(sql, params).fetchone()
    return JSONResponse(content=_options_response(row))


def _filtered_cte(corp_slug: str, qp, require_positive_elo: bool) -> tuple[str, list]:
    where, params = _parse_corp_filter(qp, require_positive_elo=require_positive_elo)
    where.insert(0, "lower(corporation) = ?")
    params.insert(0, _slug_to_corp_match(corp_slug))
    cte = f"""
    WITH base AS ({_base_select()}),
    filtered AS (SELECT * FROM base WHERE {' AND '.join(where)})
    """
    return cte, params


def _build_dynamic_histogram(values: list[float]) -> list[dict]:
    if not values:
        return []
    mn = min(values)
    mx = max(values)
    if mn == mx:
        return [{"min": mn, "max": mx, "count": len(values), "label": f"{round(mn)}-{round(mx)}"}]
    bin_count = min(12, max(5, math.ceil(len(values) / 20.0)))
    bin_size = (mx - mn) / bin_count
    bins = []
    for i in range(bin_count):
        b_min = mn + i * bin_size
        b_max = mx if i == bin_count - 1 else mn + (i + 1) * bin_size
        if i == bin_count - 1:
            count = sum(1 for v in values if v >= b_min and v <= b_max)
        else:
            count = sum(1 for v in values if v >= b_min and v < b_max)
        bins.append({"min": b_min, "max": b_max, "count": count, "label": f"{round(b_min)}-{round(b_max)}"})
    return bins


def _build_fixed_histogram(values: list[float], mn: float, mx: float, bin_count: int) -> list[dict]:
    bins = []
    bin_size = (mx - mn) / bin_count
    for i in range(bin_count):
        b_min = mn + i * bin_size
        b_max = mn + (i + 1) * bin_size
        if i == bin_count - 1:
            count = sum(1 for v in values if mn <= v <= mx and b_min <= v <= b_max)
        else:
            count = sum(1 for v in values if mn <= v <= mx and b_min <= v < b_max)
        bins.append({"min": b_min, "max": b_max, "count": count, "label": f"{round(b_min)}-{round(b_max)}"})
    return bins


@router.get("/{corporation}/summary")
def get_corporation_detail_summary(corporation: str, request: Request):
    qp = request.query_params
    cte, params = _filtered_cte(corporation, qp, require_positive_elo=True)

    sql = f"""
    {cte}
    SELECT
        elo, eloChange, finalScore, finalTr, cardPoints, greeneryPoints, cityPoints,
        milestonePoints, awardPoints, durationMinutes, generations, position, playerCount
    FROM filtered
    WHERE finalScore IS NOT NULL
    """
    arrow = request.app.state.db.cursor().execute(sql, params).fetch_arrow_table()
    rows = arrow.to_pylist()
    total = len(rows)

    empty_summary = {
        "totalGames": 0, "winRate": 0.0, "avgElo": 0.0, "avgEloChange": 0.0,
        "avgFinalScore": 0.0, "avgTr": 0.0, "avgCardPoints": 0.0,
        "avgGreeneryPoints": 0.0, "avgCityPoints": 0.0, "avgMilestonePoints": 0.0,
        "avgAwardPoints": 0.0, "avgDuration": 0.0, "avgGenerations": 0.0,
        "positionsCount": {}, "playerCountDistribution": {},
        "eloHistogramBins": [], "eloChangeHistogramBins": [],
    }
    if total == 0:
        return JSONResponse(content=empty_summary)

    def _avg(field: str) -> float:
        return sum((r[field] or 0) for r in rows) / total

    wins = sum(1 for r in rows if (r["position"] or 0) == 1)

    positions_count: dict[int, int] = {}
    for r in rows:
        p = r["position"]
        if p is not None:
            positions_count[int(p)] = positions_count.get(int(p), 0) + 1

    player_count_dist: dict[int, int] = {}
    for r in rows:
        pc = r["playerCount"]
        if pc is not None:
            player_count_dist[int(pc)] = player_count_dist.get(int(pc), 0) + 1

    elos = [float(r["elo"]) for r in rows if r["elo"] is not None and r["elo"] > 0]
    elo_changes = [float(r["eloChange"]) for r in rows if r["eloChange"] is not None]

    return JSONResponse(content={
        "totalGames": total,
        "winRate": wins / total,
        "avgElo": _avg("elo"),
        "avgEloChange": _avg("eloChange"),
        "avgFinalScore": _avg("finalScore"),
        "avgTr": _avg("finalTr"),
        "avgCardPoints": _avg("cardPoints"),
        "avgGreeneryPoints": _avg("greeneryPoints"),
        "avgCityPoints": _avg("cityPoints"),
        "avgMilestonePoints": _avg("milestonePoints"),
        "avgAwardPoints": _avg("awardPoints"),
        "avgDuration": _avg("durationMinutes"),
        "avgGenerations": _avg("generations"),
        "positionsCount": {str(k): v for k, v in positions_count.items()},
        "playerCountDistribution": {str(k): v for k, v in player_count_dist.items()},
        "eloHistogramBins": _build_dynamic_histogram(elos),
        "eloChangeHistogramBins": _build_fixed_histogram(elo_changes, -20, 20, 20),
    })


@router.get("/{corporation}/games")
def get_corporation_games(corporation: str, request: Request):
    qp = request.query_params
    limit = max(1, min(1000, _parse_int(_first(qp, "limit")) or 200))
    offset = max(0, _parse_int(_first(qp, "offset")) or 0)

    cte, params = _filtered_cte(corporation, qp, require_positive_elo=True)
    rows_sql = f"""
    {cte}
    SELECT *, count(*) OVER () AS _total
    FROM filtered
    ORDER BY tableId DESC
    LIMIT ? OFFSET ?
    """
    arrow = request.app.state.db.cursor().execute(rows_sql, params + [limit, offset]).fetch_arrow_table()
    rows = arrow.to_pylist()
    total = int(rows[0]["_total"]) if rows else 0
    for r in rows:
        r.pop("_total", None)
    return JSONResponse(content={"rows": rows, "total": total})
