from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/tile-stats", tags=["tile-stats"])


_TILE_SOURCES = {
    "city": {"parquet": "gamecitylocations", "column": "CityLocation", "has_points": True},
    "greenery": {"parquet": "gamegreenerylocations", "column": "GreeneryLocation", "has_points": False},
}


def _normalized_location_expr(col: str) -> str:
    # Collapse variants like ' Hex 5,3', 'Hex at (5, 3)', 'Tharsis Hex 5,3' into 'Hex 5,3'.
    # The C# service does this in .NET; we do it in-query so the GROUP BY merges them correctly.
    return f"""
    CASE
        WHEN lower(trim({col})) LIKE '%hex%' AND regexp_matches({col}, '(\\d+)\\s*,\\s*(\\d+)')
        THEN 'Hex ' || regexp_extract({col}, '(\\d+)\\s*,\\s*(\\d+)', 1) || ',' || regexp_extract({col}, '(\\d+)\\s*,\\s*(\\d+)', 2)
        ELSE trim({col})
    END
    """


def _excluded_location_predicate(normalized_col: str) -> str:
    # Matches the ExcludedLocations + StartsWith("tile") filter in TilePlacementService.
    return f"""
        lower({normalized_col}) NOT IN ('ganymede colony', 'phobos space haven', 'hex', '')
        AND NOT (lower({normalized_col}) LIKE 'tile%')
    """


def _overview_sql(tile_type: str) -> str:
    src = _TILE_SOURCES[tile_type]
    points_expr = "t.Points" if src["has_points"] else "CAST(NULL AS BIGINT)"
    norm = _normalized_location_expr(f"t.{src['column']}")
    return f"""
    WITH normalized AS (
        SELECT
            g.Map                                                           AS map,
            {norm}                                                          AS tileLocation,
            CAST(gp.EloChange AS DOUBLE)                                    AS elo_change,
            CAST({points_expr} AS DOUBLE)                                   AS points
        FROM read_parquet('{parquet_path(src["parquet"])}') t
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = t.TableId
        JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
          ON gp.TableId = t.TableId AND gp.PlayerId = t.PlayerId
        WHERE g.Map IS NOT NULL
    )
    SELECT
        map,
        tileLocation,
        CAST(count(*) AS BIGINT)                                            AS gameCount,
        avg(coalesce(elo_change, 0))                                        AS avgEloChange,
        avg(coalesce(points, 0))                                            AS avgPoints
    FROM normalized
    WHERE {_excluded_location_predicate("tileLocation")}
    GROUP BY map, tileLocation
    ORDER BY map, avgEloChange DESC
    """


def _by_gen_sql(tile_type: str) -> str:
    src = _TILE_SOURCES[tile_type]
    points_expr = "t.Points" if src["has_points"] else "CAST(NULL AS BIGINT)"
    norm = _normalized_location_expr(f"t.{src['column']}")
    return f"""
    WITH normalized AS (
        SELECT
            g.Map                                                           AS map,
            {norm}                                                          AS tileLocation,
            CAST(t.PlacedGen AS INTEGER)                                    AS placedGen,
            CAST(gp.EloChange AS DOUBLE)                                    AS elo_change,
            CAST({points_expr} AS DOUBLE)                                   AS points
        FROM read_parquet('{parquet_path(src["parquet"])}') t
        JOIN read_parquet('{parquet_path("games_canonical")}') g
          ON g.TableId = t.TableId
        JOIN read_parquet('{parquet_path("gameplayers_canonical")}') gp
          ON gp.TableId = t.TableId AND gp.PlayerId = t.PlayerId
        WHERE g.Map IS NOT NULL AND t.PlacedGen IS NOT NULL
    )
    SELECT
        map,
        tileLocation,
        placedGen,
        CAST(count(*) AS BIGINT)                                            AS gameCount,
        avg(coalesce(elo_change, 0))                                        AS avgEloChange,
        avg(coalesce(points, 0))                                            AS avgPoints
    FROM normalized
    WHERE {_excluded_location_predicate("tileLocation")}
    GROUP BY map, tileLocation, placedGen
    ORDER BY map, tileLocation, placedGen
    """


def _group_by_map(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        m = r.pop("map")
        grouped[m].append(r)
    return grouped


def _validate_tile_type(tile_type: str) -> None:
    if tile_type not in _TILE_SOURCES:
        raise HTTPException(status_code=400, detail=f"unknown tile type: {tile_type}")


@router.get("/{tile_type}/overview")
def get_tile_overview(tile_type: str, request: Request):
    _validate_tile_type(tile_type)
    rows = request.app.state.db.cursor().execute(_overview_sql(tile_type)).fetch_arrow_table().to_pylist()
    return JSONResponse(content=_group_by_map(rows))


@router.get("/{tile_type}/by-gen")
def get_tile_by_gen(tile_type: str, request: Request):
    _validate_tile_type(tile_type)
    rows = request.app.state.db.cursor().execute(_by_gen_sql(tile_type)).fetch_arrow_table().to_pylist()
    return JSONResponse(content=_group_by_map(rows))
