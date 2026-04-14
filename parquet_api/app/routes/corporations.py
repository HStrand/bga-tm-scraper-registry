from fastapi import APIRouter, Request
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
    arrow_table = request.app.state.db.execute(sql).fetch_arrow_table()
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

    arrow_table = request.app.state.db.execute(sql, params).fetch_arrow_table()
    return JSONResponse(content=arrow_table.to_pylist())
