from fastapi import APIRouter, Request
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

    arrow_table = request.app.state.db.execute(sql, params).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


@router.get("/filter-options")
def get_prelude_filter_options(request: Request):
    db = request.app.state.db

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
