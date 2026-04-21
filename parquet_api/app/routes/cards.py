import math
import threading
import time
from typing import Tuple

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path
from app.sql_fixups import card_variants, normalize_card_name, normalized_card_expr

router = APIRouter(prefix="/api/cards", tags=["cards"])


# Per-card unfiltered filter options — change only when parquet files are regenerated.
_FILTER_OPTIONS_TTL_SECONDS = 30 * 60
_filter_options_cache: dict = {}
_filter_options_lock = threading.Lock()


def _get_card_filter_options(db, card_name: str) -> dict:
    card_name = normalize_card_name(card_name)
    now = time.time()
    with _filter_options_lock:
        cached = _filter_options_cache.get(card_name)
        if cached and now - cached[0] < _FILTER_OPTIONS_TTL_SECONDS:
            return cached[1]

    variants = card_variants(card_name)
    placeholders = ",".join(["?"] * len(variants))
    sql = f"""
    WITH base AS (
        SELECT
            g.Map, g.GameMode, g.GameSpeed,
            gc.PlayedGen, gp.Elo,
            gs.PlayerCount
        FROM read_parquet('{parquet_path("gamecards_by_card")}') gc
        JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
          ON gp.TableId = gc.TableId AND gp.PlayerId = gc.PlayerId
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = gc.TableId
        JOIN read_parquet('{parquet_path("gamestats")}') gs
          ON gs.TableId = gc.TableId
        WHERE gc.Card IN ({placeholders}) AND gc.PlayedGen IS NOT NULL
    )
    SELECT
        (SELECT list(DISTINCT Map ORDER BY Map) FROM base WHERE Map IS NOT NULL) AS maps,
        (SELECT list(DISTINCT GameMode ORDER BY GameMode) FROM base WHERE GameMode IS NOT NULL) AS modes,
        (SELECT list(DISTINCT GameSpeed ORDER BY GameSpeed) FROM base WHERE GameSpeed IS NOT NULL) AS speeds,
        (SELECT list(DISTINCT PlayerCount ORDER BY PlayerCount) FROM base WHERE PlayerCount IS NOT NULL) AS pcs,
        (SELECT min(Elo) FROM base WHERE Elo IS NOT NULL AND Elo > 0) AS elo_min,
        (SELECT max(Elo) FROM base WHERE Elo IS NOT NULL AND Elo > 0) AS elo_max,
        (SELECT min(PlayedGen) FROM base) AS gen_min,
        (SELECT max(PlayedGen) FROM base) AS gen_max
    """
    row = db.execute(sql, variants).fetchone()
    options = {
        "maps": list(row[0] or []),
        "gameModes": list(row[1] or []),
        "gameSpeeds": list(row[2] or []),
        "playerCounts": [int(x) for x in (row[3] or [])],
        "eloRange": {
            "min": int(row[4]) if row[4] is not None else 0,
            "max": int(row[5]) if row[5] is not None else 0,
        },
        "playedGenRange": {
            "min": int(row[6]) if row[6] is not None else 0,
            "max": int(row[7]) if row[7] is not None else 0,
        },
    }
    with _filter_options_lock:
        _filter_options_cache[card_name] = (now, options)
    return options


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


def _card_filtered_cte(card_name: str, qp) -> Tuple[str, list]:
    card_name = normalize_card_name(card_name)
    """Build a `WITH filtered AS (...)` CTE applying all query-param filters.

    Returns (sql_cte, params). The CTE always includes `gc.PlayedGen IS NOT NULL`
    and binds the card name — same shape as the old SQL.
    """
    maps = _collect(qp, "maps", "map")
    modes = _collect(qp, "modes", "gameModes", "mode")
    speeds = _collect(qp, "speeds", "speed", "gameSpeeds", "gameSpeed")
    player_counts = [int(x) for x in _collect(qp, "playerCounts", "playerCount") if x.lstrip("-").isdigit()]
    prelude_on = _parse_bool(_first(qp, "preludeOn", "prelude"))
    colonies_on = _parse_bool(_first(qp, "coloniesOn", "colonies"))
    draft_on = _parse_bool(_first(qp, "draftOn", "draft"))
    elo_min = _parse_int(_first(qp, "eloMin"))
    elo_max = _parse_int(_first(qp, "eloMax"))
    played_gen_min = _parse_int(_first(qp, "playedGenMin"))
    played_gen_max = _parse_int(_first(qp, "playedGenMax"))
    player_name = _first(qp, "playerName")

    variants = card_variants(card_name)
    placeholders = ",".join(["?"] * len(variants))
    where = [f"gc.Card IN ({placeholders})", "gc.PlayedGen IS NOT NULL"]
    params = list(variants)

    def _in_clause(col, values):
        where.append(f"{col} IN ({','.join(['?'] * len(values))})")
        params.extend(values)

    if maps:
        _in_clause("g.Map", maps)
    if modes:
        _in_clause("g.GameMode", modes)
    if speeds:
        _in_clause("g.GameSpeed", speeds)
    if player_counts:
        _in_clause("gs.PlayerCount", player_counts)
    if prelude_on is not None:
        where.append("g.PreludeOn = ?")
        params.append(prelude_on)
    if colonies_on is not None:
        where.append("g.ColoniesOn = ?")
        params.append(colonies_on)
    if draft_on is not None:
        where.append("g.DraftOn = ?")
        params.append(draft_on)
    if elo_min is not None:
        where.append("gp.Elo >= ?")
        params.append(elo_min)
    if elo_max is not None:
        where.append("gp.Elo <= ?")
        params.append(elo_max)
    if played_gen_min is not None:
        where.append("gc.PlayedGen >= ?")
        params.append(played_gen_min)
    if played_gen_max is not None:
        where.append("gc.PlayedGen <= ?")
        params.append(played_gen_max)
    if player_name:
        where.append("gp.PlayerName = ?")
        params.append(player_name)

    cte = f"""
    WITH filtered AS (
        SELECT
            gc.TableId, gc.PlayerId,
            g.Map, g.GameMode, g.GameSpeed, g.PreludeOn, g.ColoniesOn, g.DraftOn,
            gc.SeenGen, gc.DrawnGen, gc.KeptGen, gc.DraftedGen, gc.BoughtGen,
            gc.PlayedGen, gc.DrawType, gc.DrawReason, gc.VpScored,
            gp.PlayerName, gp.Elo, gp.EloChange, gp.Position,
            gs.PlayerCount
        FROM read_parquet('{parquet_path("gamecards_by_card")}') gc
        JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
          ON gp.TableId = gc.TableId AND gp.PlayerId = gc.PlayerId
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = gc.TableId
        JOIN read_parquet('{parquet_path("gamestats")}') gs
          ON gs.TableId = gc.TableId
        WHERE {' AND '.join(where)}
    )
    """
    return cte, params


@router.get("/{card_name}/summary")
def get_card_summary(card_name: str, request: Request):
    qp = request.query_params
    db = request.app.state.db.cursor()

    cte, params = _card_filtered_cte(card_name, qp)

    # Single scan over the filtered set returning only the columns we need.
    rows = db.execute(
        f"""
        {cte}
        SELECT Elo, EloChange, PlayedGen, Position, VpScored
        FROM filtered
        """,
        params,
    ).fetch_arrow_table()

    elo = rows.column("Elo").to_pylist()
    elo_change = rows.column("EloChange").to_pylist()
    played_gen = rows.column("PlayedGen").to_pylist()
    position = rows.column("Position").to_pylist()
    vp = rows.column("VpScored").to_pylist()

    # Stats: mirror frontend — only rows with Position not null count.
    valid_idx = [i for i, p in enumerate(position) if p is not None]
    total_games = len(valid_idx)
    if total_games == 0:
        stats = {"totalGames": 0, "winRate": 0.0, "avgElo": 0.0, "avgEloChange": 0.0, "avgVpScored": 0.0}
    else:
        wins = sum(1 for i in valid_idx if position[i] == 1)
        stats = {
            "totalGames": total_games,
            "winRate": wins / total_games,
            "avgElo": sum((elo[i] or 0) for i in valid_idx) / total_games,
            "avgEloChange": sum((elo_change[i] or 0) for i in valid_idx) / total_games,
            "avgVpScored": sum((vp[i] or 0) for i in valid_idx) / total_games,
        }

    # Per-generation aggregates (games, winRate, avgEloChange) and distribution.
    gen_bucket: dict = {}
    dist_bucket: dict = {}
    for i in range(len(played_gen)):
        g = played_gen[i]
        if g is None:
            continue
        dist_bucket[g] = dist_bucket.get(g, 0) + 1
        if position[i] is None:
            continue
        b = gen_bucket.setdefault(g, {"n": 0, "w": 0, "ec": 0.0})
        b["n"] += 1
        if position[i] == 1:
            b["w"] += 1
        b["ec"] += (elo_change[i] or 0)

    generation_data = [
        {
            "generation": int(g),
            "gameCount": v["n"],
            "winRate": v["w"] / v["n"],
            "avgEloChange": v["ec"] / v["n"],
        }
        for g, v in sorted(gen_bucket.items()) if v["n"] >= 3
    ]

    dist_total = sum(dist_bucket.values())
    generation_distribution = [
        {
            "generation": int(g),
            "count": c,
            "percentage": (c / dist_total * 100.0) if dist_total else 0.0,
        }
        for g, c in sorted(dist_bucket.items())
    ]

    # Elo-change histogram (fixed bins -20..+20, width 2)
    change_counts = [0] * 20
    for c in elo_change:
        if c is None or c < -20 or c >= 20:
            continue
        change_counts[int((c + 20) // 2)] += 1
    elo_change_histogram = [
        {"min": -20 + i * 2, "max": -20 + (i + 1) * 2, "count": change_counts[i],
         "label": f"{-20 + i * 2}-{-20 + (i + 1) * 2}"}
        for i in range(20)
    ]

    # Elo histogram (dynamic bins; same logic as frontend)
    elo_vals = [e for e in elo if e is not None]
    elo_histogram = []
    if elo_vals:
        mn = float(min(elo_vals))
        mx = float(max(elo_vals))
        n_elo = len(elo_vals)
        bin_count = max(5, min(12, math.ceil(n_elo / 20)))
        if mx > mn:
            bin_size = (mx - mn) / bin_count
            counts = [0] * bin_count
            for v in elo_vals:
                idx = min(bin_count - 1, int((v - mn) / bin_size))
                counts[idx] += 1
            for i in range(bin_count):
                bin_min = mn + i * bin_size
                bin_max = mx if i == bin_count - 1 else mn + (i + 1) * bin_size
                elo_histogram.append({
                    "min": bin_min, "max": bin_max, "count": counts[i],
                    "label": f"{round(bin_min)}-{round(bin_max)}",
                })
        else:
            elo_histogram.append({
                "min": mn, "max": mx, "count": n_elo, "label": f"{round(mn)}-{round(mx)}"
            })

    return JSONResponse(content={
        "stats": stats,
        "generationData": generation_data,
        "generationDistribution": generation_distribution,
        "eloHistogram": elo_histogram,
        "eloChangeHistogram": elo_change_histogram,
        "filterOptions": _get_card_filter_options(db, card_name),
    })


_ALLOWED_SORT_FIELDS = {
    "TableId", "PlayerId", "Map", "GameMode", "GameSpeed",
    "PreludeOn", "ColoniesOn", "DraftOn",
    "SeenGen", "DrawnGen", "KeptGen", "DraftedGen", "BoughtGen",
    "PlayedGen", "DrawType", "DrawReason", "VpScored",
    "PlayerName", "Elo", "EloChange", "Position", "PlayerCount",
}


@router.get("/{card_name}/games")
def get_card_games(card_name: str, request: Request):
    qp = request.query_params
    db = request.app.state.db.cursor()

    page = max(1, _parse_int(_first(qp, "page")) or 1)
    page_size = max(1, min(500, _parse_int(_first(qp, "pageSize")) or 50))
    sort = _first(qp, "sort") or "TableId"
    sort_dir = (_first(qp, "sortDir") or "desc").lower()
    if sort not in _ALLOWED_SORT_FIELDS:
        raise HTTPException(status_code=400, detail=f"invalid sort field: {sort}")
    if sort_dir not in ("asc", "desc"):
        sort_dir = "desc"

    cte, params = _card_filtered_cte(card_name, qp)

    offset = (page - 1) * page_size
    # Single scan: attach total via window count, then order + paginate.
    rows_sql = f"""
    {cte}
    SELECT
        TableId, PlayerId, Map, GameMode, GameSpeed,
        PreludeOn, ColoniesOn, DraftOn,
        SeenGen, DrawnGen, KeptGen, DraftedGen, BoughtGen,
        PlayedGen, DrawType, DrawReason, VpScored,
        PlayerName, Elo, EloChange, Position, PlayerCount,
        count(*) OVER () AS _total
    FROM filtered
    ORDER BY {sort} {sort_dir.upper()} NULLS LAST, TableId DESC
    LIMIT ? OFFSET ?
    """
    arrow = db.execute(rows_sql, params + [page_size, offset]).fetch_arrow_table()
    rows = arrow.to_pylist()
    total = int(rows[0]["_total"]) if rows else 0
    for r in rows:
        r.pop("_total", None)

    return JSONResponse(content={
        "total": total,
        "page": page,
        "pageSize": page_size,
        "rows": rows,
    })


@router.get("/{card_name}/playerstats")
def get_card_player_stats(card_name: str, request: Request):
    card_name = normalize_card_name(card_name)
    variants = card_variants(card_name)
    placeholders = ",".join(["?"] * len(variants))
    sql = f"""
    SELECT
        gc.TableId       AS TableId,
        gc.PlayerId      AS PlayerId,
        g.Map            AS Map,
        g.GameMode       AS GameMode,
        g.GameSpeed      AS GameSpeed,
        g.PreludeOn      AS PreludeOn,
        g.ColoniesOn     AS ColoniesOn,
        g.DraftOn        AS DraftOn,
        gc.SeenGen       AS SeenGen,
        gc.DrawnGen      AS DrawnGen,
        gc.KeptGen       AS KeptGen,
        gc.DraftedGen    AS DraftedGen,
        gc.BoughtGen     AS BoughtGen,
        gc.PlayedGen     AS PlayedGen,
        gc.DrawType      AS DrawType,
        gc.DrawReason    AS DrawReason,
        gc.VpScored      AS VpScored,
        gp.PlayerName    AS PlayerName,
        gp.Elo           AS Elo,
        gp.EloChange     AS EloChange,
        gp.Position      AS Position,
        gs.PlayerCount   AS PlayerCount
    FROM read_parquet('{parquet_path("gamecards_by_card")}') gc
    JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
      ON gp.TableId = gc.TableId AND gp.PlayerId = gc.PlayerId
    JOIN read_parquet('{parquet_path("games_canonical")}') g
      ON g.TableId = gc.TableId
    JOIN read_parquet('{parquet_path("gamestats")}') gs
      ON gs.TableId = gc.TableId
    WHERE gc.Card IN ({placeholders})
      AND gc.PlayedGen IS NOT NULL
    """
    arrow_table = request.app.state.db.cursor().execute(sql, variants).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


def _card_stats_sql(gen_column: str) -> str:
    return f"""
    SELECT
        {normalized_card_expr("gc.Card")}                                    AS card,
        count(*)                                                             AS timesPlayed,
        round(avg(CASE WHEN gp.Position = 1 THEN 1.0 ELSE 0.0 END), 3)       AS winRate,
        round(avg(CAST(gp.Elo AS DOUBLE)), 2)                                AS avgElo,
        round(avg(CAST(gp.EloChange AS DOUBLE)), 2)                          AS avgEloChange
    FROM read_parquet('{parquet_path("gamecards")}') gc
    JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
      ON gp.TableId = gc.TableId AND gp.PlayerId = gc.PlayerId
    WHERE gc.{gen_column} IS NOT NULL
      AND lower(gc.Card) <> 'standard project city'
    GROUP BY {normalized_card_expr("gc.Card")}
    """


@router.get("/stats")
def get_all_card_stats(request: Request):
    arrow_table = request.app.state.db.cursor().execute(_card_stats_sql("PlayedGen")).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


@router.get("/option-stats")
def get_all_card_option_stats(request: Request):
    arrow_table = request.app.state.db.cursor().execute(_card_stats_sql("DrawnGen")).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())
