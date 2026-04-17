from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/awards", tags=["awards"])


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
      AND NOT regexp_matches(gpa.Award, '^award_\d+$')
    ORDER BY gpa.TableId DESC
    """


@router.get("/rows")
def get_all_award_rows(request: Request):
    arrow_table = request.app.state.db.cursor().execute(_award_rows_sql()).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


@router.get("/overview")
def get_awards_overview(request: Request):
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
    funded_gen_min = _parse_int(_first(qp, "fundedGenMin", "playedGenMin"))
    funded_gen_max = _parse_int(_first(qp, "fundedGenMax", "playedGenMax"))
    times_min = _parse_int(_first(qp, "timesPlayedMin", "playsMin"))
    times_max = _parse_int(_first(qp, "timesPlayedMax", "playsMax"))
    player_name = _first(qp, "playerName")
    corporation = _first(qp, "corporation")

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
        where.append("Elo >= ?")
        params.append(elo_min)
    if elo_max is not None:
        where.append("Elo <= ?")
        params.append(elo_max)
    if gen_min is not None:
        where.append("Generations >= ?")
        params.append(gen_min)
    if gen_max is not None:
        where.append("Generations <= ?")
        params.append(gen_max)
    if funded_gen_min is not None:
        where.append("FundedGen >= ?")
        params.append(funded_gen_min)
    if funded_gen_max is not None:
        where.append("FundedGen <= ?")
        params.append(funded_gen_max)
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
        having.append("timesFunded >= ?")
        params.append(times_min)
    if times_max is not None:
        having.append("timesFunded <= ?")
        params.append(times_max)
    having_sql = f"HAVING {' AND '.join(having)}" if having else ""

    sql = f"""
    WITH base AS (
        {_award_rows_sql()}
    ),
    funded AS (
        SELECT *
        FROM base
        WHERE PlayerId = FundedBy
           OR (PlayerCounter IS NOT NULL AND PlayerCounter = FundedBy)
    )
    SELECT
        Award                                                         AS award,
        count(*)                                                      AS timesFunded,
        sum(CASE WHEN Position = 1 THEN 1 ELSE 0 END) * 1.0 / count(*) AS winRate,
        avg(coalesce(CAST(EloChange AS DOUBLE), 0))                    AS avgEloGain,
        avg(CAST(FundedGen AS DOUBLE))                                 AS avgFundedGen,
        avg(coalesce(CAST(Elo AS DOUBLE), 0))                          AS avgElo,
        1.0 - (sum(CASE WHEN PlayerPlace = 1 THEN 1 ELSE 0 END) * 1.0 / count(*)) AS flipRate
    FROM funded
    {where_sql}
    GROUP BY Award
    {having_sql}
    """

    arrow_table = request.app.state.db.cursor().execute(sql, params).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())


@router.get("/filter-options")
def get_awards_filter_options(request: Request):
    db = request.app.state.db.cursor()

    gen_row = db.execute(
        f"""
        SELECT min(FundedGen) AS min_gen, max(FundedGen) AS max_gen
        FROM read_parquet('{parquet_path("gameplayerawards")}')
        WHERE Award IS NOT NULL AND Award <> ''
          AND NOT regexp_matches(Award, '^award_\d+$')
        """
    ).fetchone()
    min_gen = gen_row[0] if gen_row and gen_row[0] is not None else 0
    max_gen = gen_row[1] if gen_row and gen_row[1] is not None else 0

    corp_rows = db.execute(
        f"""
        WITH best_gps AS (
            SELECT
                Corporation,
                row_number() OVER (
                    PARTITION BY TableId, PlayerId
                    ORDER BY UpdatedAt DESC
                ) AS rn
            FROM read_parquet('{parquet_path("gameplayerstats")}')
        )
        SELECT DISTINCT Corporation
        FROM best_gps
        WHERE rn = 1
          AND Corporation IS NOT NULL
          AND trim(Corporation) <> ''
          AND lower(Corporation) <> 'unknown'
        ORDER BY lower(Corporation)
        """
    ).fetchall()

    return JSONResponse(content={
        "fundedGenRange": {"min": int(min_gen), "max": int(max_gen)},
        "corporations": [r[0] for r in corp_rows],
    })
