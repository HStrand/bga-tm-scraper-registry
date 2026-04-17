from __future__ import annotations

import math

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/preludes", tags=["preludes"])


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


def _base_prelude_rows_sql() -> str:
    """Per-player rows for each kept prelude, joined to game/player context.

    Mirrors PreludeStatsService.ComputeFromDbAsync in the C# service, including
    picking the latest GamePlayerStats per (TableId, PlayerId) for Corporation.
    Normalises a couple of prelude display names in-query.
    """
    return f"""
    WITH best_gps AS (
        SELECT
            TableId, PlayerId, Corporation,
            row_number() OVER (
                PARTITION BY TableId, PlayerId
                ORDER BY UpdatedAt DESC
            ) AS rn
        FROM read_parquet('{parquet_path("gameplayerstats")}')
    )
    SELECT
        shp.TableId        AS TableId,
        shp.PlayerId       AS PlayerId,
        CASE
            WHEN lower(shp.Prelude) = 'allied bank' THEN 'Allied Banks'
            WHEN lower(shp.Prelude) = 'excentric sponsor' THEN 'Eccentric Sponsor'
            ELSE shp.Prelude
        END                AS Prelude,
        g.Map              AS Map,
        g.PreludeOn        AS PreludeOn,
        g.ColoniesOn       AS ColoniesOn,
        g.DraftOn          AS DraftOn,
        g.GameMode         AS GameMode,
        g.GameSpeed        AS GameSpeed,
        gs.PlayerCount     AS PlayerCount,
        gs.Generations     AS Generations,
        gps.Corporation    AS Corporation,
        gp.PlayerName      AS PlayerName,
        gp.Elo             AS Elo,
        gp.EloChange       AS EloChange,
        gp.Position        AS Position
    FROM read_parquet('{parquet_path("startinghandpreludes")}') shp
    JOIN read_parquet('{parquet_path("games_canonical")}') g
      ON g.TableId = shp.TableId
    JOIN read_parquet('{parquet_path("gamestats")}') gs
      ON gs.TableId = shp.TableId
    JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
      ON gp.TableId = shp.TableId AND gp.PlayerId = shp.PlayerId
    JOIN best_gps gps
      ON gps.TableId = shp.TableId AND gps.PlayerId = shp.PlayerId AND gps.rn = 1
    WHERE shp.Kept = TRUE
    """


@router.get("/rankings")
def get_prelude_rankings(request: Request):
    qp = request.query_params

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
    times_min = _parse_int(_first(qp, "timesPlayedMin", "playsMin"))
    times_max = _parse_int(_first(qp, "timesPlayedMax", "playsMax"))
    player_name = _first(qp, "playerName")
    corporation = _first(qp, "corporation", "corp")

    where = []
    params = []

    def _in_clause(col, values):
        where.append(f"{col} IN ({','.join(['?'] * len(values))})")
        params.extend(values)

    if maps:
        _in_clause("Map", maps)
    if modes:
        _in_clause("GameMode", modes)
    if speeds:
        _in_clause("GameSpeed", speeds)
    if player_counts:
        _in_clause("PlayerCount", player_counts)
    if prelude_on is not None:
        where.append("PreludeOn = ?")
        params.append(prelude_on)
    if colonies_on is not None:
        where.append("ColoniesOn = ?")
        params.append(colonies_on)
    if draft_on is not None:
        where.append("DraftOn = ?")
        params.append(draft_on)
    if elo_min is not None:
        where.append("Elo > 0 AND Elo >= ?")
        params.append(elo_min)
    if elo_max is not None:
        where.append("Elo > 0 AND Elo <= ?")
        params.append(elo_max)
    if gen_min is not None:
        where.append("Generations >= ?")
        params.append(gen_min)
    if gen_max is not None:
        where.append("Generations <= ?")
        params.append(gen_max)
    if player_name:
        escaped = player_name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").lower()
        where.append("lower(PlayerName) LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    if corporation:
        where.append("lower(Corporation) = ?")
        params.append(corporation.strip().lower())

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
        {_base_prelude_rows_sql()}
    )
    SELECT
        Prelude                                                          AS prelude,
        sum(CASE WHEN Position = 1 THEN 1 ELSE 0 END) * 100.0 / count(*) AS winRate,
        avg(coalesce(CAST(EloChange AS DOUBLE), 0))                      AS avgEloGain,
        count(*)                                                         AS gamesPlayed,
        avg(coalesce(CAST(Elo AS DOUBLE), 0))                            AS avgElo
    FROM base
    {where_sql}
    GROUP BY Prelude
    {having_sql}
    ORDER BY winRate DESC, gamesPlayed DESC
    """

    arrow_table = request.app.state.db.cursor().execute(sql, params).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


@router.get("/filter-options")
def get_prelude_filter_options(request: Request):
    db = request.app.state.db.cursor()

    rows_sql = f"WITH base AS ({_base_prelude_rows_sql()})"

    maps = [r[0] for r in db.execute(
        f"{rows_sql} SELECT DISTINCT Map FROM base WHERE Map IS NOT NULL AND trim(Map) <> '' ORDER BY Map"
    ).fetchall()]
    modes = [r[0] for r in db.execute(
        f"{rows_sql} SELECT DISTINCT GameMode FROM base WHERE GameMode IS NOT NULL AND trim(GameMode) <> '' ORDER BY GameMode"
    ).fetchall()]
    speeds = [r[0] for r in db.execute(
        f"{rows_sql} SELECT DISTINCT GameSpeed FROM base WHERE GameSpeed IS NOT NULL AND trim(GameSpeed) <> '' ORDER BY GameSpeed"
    ).fetchall()]
    player_counts = [r[0] for r in db.execute(
        f"{rows_sql} SELECT DISTINCT PlayerCount FROM base WHERE PlayerCount IS NOT NULL ORDER BY PlayerCount"
    ).fetchall()]

    elo_row = db.execute(
        f"{rows_sql} SELECT min(Elo), max(Elo) FROM base WHERE Elo IS NOT NULL AND Elo > 0"
    ).fetchone()
    gen_row = db.execute(
        f"{rows_sql} SELECT min(Generations), max(Generations) FROM base WHERE Generations IS NOT NULL"
    ).fetchone()

    corporations = [r[0] for r in db.execute(
        f"""
        {rows_sql}
        SELECT DISTINCT Corporation FROM base
        WHERE Corporation IS NOT NULL AND trim(Corporation) <> ''
        ORDER BY lower(Corporation)
        """
    ).fetchall()]

    return JSONResponse(content={
        "maps": maps,
        "gameModes": modes,
        "gameSpeeds": speeds,
        "playerCounts": [int(x) for x in player_counts],
        "eloRange": {
            "min": int(elo_row[0]) if elo_row and elo_row[0] is not None else 0,
            "max": int(elo_row[1]) if elo_row and elo_row[1] is not None else 0,
        },
        "generationsRange": {
            "min": int(gen_row[0]) if gen_row and gen_row[0] is not None else 0,
            "max": int(gen_row[1]) if gen_row and gen_row[1] is not None else 0,
        },
        "corporations": corporations,
    })


def _slug_to_prelude_match(slug: str) -> str:
    # Same pattern as corporations: frontend may pass the display name directly or an
    # underscore-separated slug. Match case-insensitively against the normalized Prelude column.
    return slug.replace("_", " ").strip().lower()


def _detail_filter(qp, *, require_positive_elo: bool) -> tuple[list[str], list]:
    maps = _collect(qp, "maps", "map")
    modes = _collect(qp, "modes", "gameModes", "mode")
    speeds = _collect(qp, "speeds", "speed", "gameSpeeds", "gameSpeed")
    player_counts = [int(x) for x in _collect(qp, "playerCounts", "playerCount") if x.lstrip("-").isdigit()]
    corporations = _collect(qp, "corporations", "corp")
    corp_contains = _first(qp, "corporation")
    prelude_on = _parse_bool(_first(qp, "preludeOn", "prelude"))
    colonies_on = _parse_bool(_first(qp, "coloniesOn", "colonies"))
    draft_on = _parse_bool(_first(qp, "draftOn", "draft"))
    elo_min = _parse_int(_first(qp, "eloMin"))
    elo_max = _parse_int(_first(qp, "eloMax"))
    player_name = _first(qp, "playerName")

    where: list[str] = []
    params: list = []

    def _in_clause(col, values):
        where.append(f"{col} IN ({','.join(['?'] * len(values))})")
        params.extend(values)

    if maps:
        _in_clause("Map", maps)
    if modes:
        _in_clause("GameMode", modes)
    if speeds:
        _in_clause("GameSpeed", speeds)
    if player_counts:
        _in_clause("PlayerCount", player_counts)
    if corporations:
        lowered = [c.strip().lower() for c in corporations if c.strip()]
        if lowered:
            where.append(f"lower(Corporation) IN ({','.join(['?'] * len(lowered))})")
            params.extend(lowered)
    if corp_contains:
        escaped = corp_contains.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").lower()
        where.append("lower(Corporation) LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    if prelude_on is not None:
        where.append("PreludeOn = ?")
        params.append(prelude_on)
    if colonies_on is not None:
        where.append("ColoniesOn = ?")
        params.append(colonies_on)
    if draft_on is not None:
        where.append("DraftOn = ?")
        params.append(draft_on)
    if elo_min is not None:
        where.append("Elo > 0 AND Elo >= ?" if require_positive_elo else "Elo >= ?")
        params.append(elo_min)
    if elo_max is not None:
        where.append("Elo > 0 AND Elo <= ?" if require_positive_elo else "Elo <= ?")
        params.append(elo_max)
    if player_name:
        escaped = player_name.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").lower()
        where.append("lower(PlayerName) LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")

    return where, params


def _filtered_prelude_cte(card_name: str, qp, *, require_positive_elo: bool) -> tuple[str, list]:
    where, params = _detail_filter(qp, require_positive_elo=require_positive_elo)
    where.insert(0, "lower(Prelude) = ?")
    params.insert(0, _slug_to_prelude_match(card_name))
    cte = f"""
    WITH base AS ({_base_prelude_rows_sql()}),
    filtered AS (SELECT * FROM base WHERE {' AND '.join(where)})
    """
    return cte, params


@router.get("/{card_name}/options")
def get_prelude_detail_options(card_name: str, request: Request):
    db = request.app.state.db.cursor()
    base = _base_prelude_rows_sql()
    # Per-prelude: restrict to this Prelude on the base view, then derive distinct options.
    # Elo range excludes 0 (matches legacy behavior).
    header = f"WITH base AS ({base}), filtered AS (SELECT * FROM base WHERE lower(Prelude) = ?)"
    param = [_slug_to_prelude_match(card_name)]

    maps = [r[0] for r in db.execute(
        f"{header} SELECT DISTINCT Map FROM filtered WHERE Map IS NOT NULL AND trim(Map) <> '' ORDER BY Map",
        param,
    ).fetchall()]
    modes = [r[0] for r in db.execute(
        f"{header} SELECT DISTINCT GameMode FROM filtered WHERE GameMode IS NOT NULL AND trim(GameMode) <> '' ORDER BY GameMode",
        param,
    ).fetchall()]
    speeds = [r[0] for r in db.execute(
        f"{header} SELECT DISTINCT GameSpeed FROM filtered WHERE GameSpeed IS NOT NULL AND trim(GameSpeed) <> '' ORDER BY GameSpeed",
        param,
    ).fetchall()]
    player_counts = [r[0] for r in db.execute(
        f"{header} SELECT DISTINCT PlayerCount FROM filtered WHERE PlayerCount IS NOT NULL ORDER BY PlayerCount",
        param,
    ).fetchall()]
    corporations = [r[0] for r in db.execute(
        f"""
        {header}
        SELECT DISTINCT Corporation FROM filtered
        WHERE Corporation IS NOT NULL AND trim(Corporation) <> ''
        ORDER BY lower(Corporation)
        """,
        param,
    ).fetchall()]
    elo_row = db.execute(
        f"{header} SELECT min(Elo), max(Elo) FROM filtered WHERE Elo IS NOT NULL AND Elo > 0",
        param,
    ).fetchone()

    return JSONResponse(content={
        "maps": maps,
        "gameModes": modes,
        "gameSpeeds": speeds,
        "playerCounts": [int(x) for x in player_counts],
        "corporations": corporations,
        "eloRange": {
            "min": int(elo_row[0]) if elo_row and elo_row[0] is not None else 0,
            "max": int(elo_row[1]) if elo_row and elo_row[1] is not None else 0,
        },
    })


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


@router.get("/{card_name}/summary")
def get_prelude_detail_summary(card_name: str, request: Request):
    qp = request.query_params
    cte, params = _filtered_prelude_cte(card_name, qp, require_positive_elo=True)

    sql = f"""
    {cte}
    SELECT Elo, EloChange, Position, Corporation
    FROM filtered
    WHERE Position IS NOT NULL
    """
    rows = request.app.state.db.cursor().execute(sql, params).fetch_arrow_table().to_pylist()
    total = len(rows)

    empty = {
        "totalGames": 0, "winRate": 0.0, "avgElo": 0.0, "avgEloChange": 0.0,
        "eloHistogramBins": [], "eloChangeHistogramBins": [], "corporationPerformance": [],
    }
    if total == 0:
        return JSONResponse(content=empty)

    wins = sum(1 for r in rows if (r["Position"] or 0) == 1)
    avg_elo = sum((r["Elo"] or 0) for r in rows) / total
    avg_elo_change = sum((r["EloChange"] or 0) for r in rows) / total

    elos = [float(r["Elo"]) for r in rows if r["Elo"] is not None and r["Elo"] > 0]
    elo_changes = [float(r["EloChange"]) for r in rows if r["EloChange"] is not None]

    corp_groups: dict[str, list] = {}
    for r in rows:
        corp = r["Corporation"]
        if corp and corp.strip():
            corp_groups.setdefault(corp, []).append(r)

    corp_perf = []
    for corp, rs in corp_groups.items():
        games = len(rs)
        if games < 3:
            continue
        corp_wins = sum(1 for r in rs if (r["Position"] or 0) == 1)
        corp_perf.append({
            "corporation": corp,
            "gamesPlayed": games,
            "wins": corp_wins,
            "winRate": corp_wins / games,
            "avgEloChange": sum((r["EloChange"] or 0) for r in rs) / games,
        })
    corp_perf.sort(key=lambda x: x["gamesPlayed"], reverse=True)

    return JSONResponse(content={
        "totalGames": total,
        "winRate": wins / total,
        "avgElo": avg_elo,
        "avgEloChange": avg_elo_change,
        "eloHistogramBins": _build_dynamic_histogram(elos),
        "eloChangeHistogramBins": _build_fixed_histogram(elo_changes, -20, 20, 20),
        "corporationPerformance": corp_perf,
    })


@router.get("/{card_name}/playerrows")
def get_prelude_player_rows(card_name: str, request: Request):
    qp = request.query_params
    limit = max(1, min(1000, _parse_int(_first(qp, "limit")) or 500))
    offset = max(0, _parse_int(_first(qp, "offset")) or 0)

    cte, params = _filtered_prelude_cte(card_name, qp, require_positive_elo=True)
    sql = f"""
    {cte}
    SELECT
        TableId       AS tableId,
        PlayerId      AS playerId,
        Prelude       AS prelude,
        Map           AS map,
        PreludeOn     AS preludeOn,
        ColoniesOn    AS coloniesOn,
        DraftOn       AS draftOn,
        GameMode      AS gameMode,
        GameSpeed     AS gameSpeed,
        PlayerCount   AS playerCount,
        Generations   AS generations,
        Corporation   AS corporation,
        PlayerName    AS playerName,
        Elo           AS elo,
        EloChange     AS eloChange,
        Position      AS position,
        count(*) OVER () AS _total
    FROM filtered
    ORDER BY TableId DESC
    LIMIT ? OFFSET ?
    """
    arrow = request.app.state.db.cursor().execute(sql, params + [limit, offset]).fetch_arrow_table()
    rows = arrow.to_pylist()
    total = int(rows[0]["_total"]) if rows else 0
    for r in rows:
        r.pop("_total", None)
    return JSONResponse(content={"rows": rows, "total": total})
