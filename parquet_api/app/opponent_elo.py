from __future__ import annotations

from app.db import parquet_path


def _parse_int(s):
    if s is None:
        return None
    try:
        return int(s.strip())
    except (TypeError, ValueError):
        return None


def opponent_elo_clause(qp, table_expr: str = "tableId", player_expr: str = "playerId") -> tuple[str | None, list]:
    """Build a WHERE predicate keeping rows where every opponent's Elo is within oppEloMin/oppEloMax.

    Returns (None, []) when neither bound is given. Games with an unrated opponent are excluded.
    """
    opp_min = _parse_int(qp.get("oppEloMin"))
    opp_max = _parse_int(qp.get("oppEloMax"))
    if opp_min is None and opp_max is None:
        return None, []

    # Uncorrelated on purpose: DuckDB identifiers are case-insensitive, so an unqualified outer
    # `tableId` inside a correlated subquery would bind to the inner TableId.
    having = ["count(*) FILTER (WHERE oe_opp.Elo IS NULL OR oe_opp.Elo <= 0) = 0"]
    params: list = []
    if opp_min is not None:
        having.append("min(oe_opp.Elo) >= ?")
        params.append(opp_min)
    if opp_max is not None:
        having.append("max(oe_opp.Elo) <= ?")
        params.append(opp_max)

    gp = f"read_parquet('{parquet_path('gameplayers_canonical')}')"
    sql = f"""({table_expr}, {player_expr}) IN (
        SELECT oe_self.TableId, oe_self.PlayerId
        FROM {gp} oe_self
        JOIN {gp} oe_opp
          ON oe_opp.TableId = oe_self.TableId AND oe_opp.PlayerId <> oe_self.PlayerId
        GROUP BY oe_self.TableId, oe_self.PlayerId
        HAVING {' AND '.join(having)}
    )"""
    return sql, params
