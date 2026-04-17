from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/statistics", tags=["statistics"])
legacy_router = APIRouter(prefix="/api", tags=["statistics"])


@router.get("/global")
def get_global_statistics(request: Request):
    db = request.app.state.db.cursor()

    total_indexed_games = db.execute(
        f"SELECT count(*) FROM read_parquet('{parquet_path('games')}')"
    ).fetchone()[0]

    scraped_games_total = db.execute(
        f"SELECT count(*) FROM read_parquet('{parquet_path('games')}') WHERE ScrapedAt IS NOT NULL"
    ).fetchone()[0]

    total_players = db.execute(
        f"SELECT count(*) FROM read_parquet('{parquet_path('players')}')"
    ).fetchone()[0]

    total_card_draws = db.execute(
        f"SELECT count(*) FROM read_parquet('{parquet_path('gamecards')}')"
    ).fetchone()[0]

    total_greeneries = db.execute(
        f"SELECT count(*) FROM read_parquet('{parquet_path('gamegreenerylocations')}')"
    ).fetchone()[0]

    total_cities = db.execute(
        f"SELECT count(*) FROM read_parquet('{parquet_path('gamecitylocations')}')"
    ).fetchone()[0]

    total_milestones = db.execute(
        f"SELECT count(*) FROM read_parquet('{parquet_path('gamemilestones')}')"
    ).fetchone()[0]

    total_awards = db.execute(
        f"""
        SELECT count(*) FROM (
            SELECT DISTINCT TableId, Award
            FROM read_parquet('{parquet_path('gameplayerawards')}')
            WHERE Award IS NOT NULL AND Award <> ''
              AND NOT regexp_matches(Award, '^award_\\d+$')
        )
        """
    ).fetchone()[0]

    return JSONResponse(content={
        "totalIndexedGames": total_indexed_games,
        "scrapedGamesTotal": scraped_games_total,
        "totalPlayers": total_players,
        "totalCardDraws": total_card_draws,
        "totalNumberOfGreeneries": total_greeneries,
        "totalNumberOfCities": total_cities,
        "totalNumberOfMilestones": total_milestones,
        "totalNumberOfAwards": total_awards,
    })


# Legacy URL — the Azure Function GetStatistics used to serve this. Per-user scraper dashboard.
@legacy_router.get("/GetStatistics")
def get_statistics(request: Request):
    email = (request.query_params.get("email") or "").strip()
    db = request.app.state.db.cursor()

    row = db.execute(
        f"""
        SELECT
            (SELECT count(*) FROM read_parquet('{parquet_path('games')}')) AS total_games,
            (SELECT count(*) FROM read_parquet('{parquet_path('games')}') WHERE ScrapedAt IS NOT NULL) AS scraped_total,
            (SELECT count(*) FROM read_parquet('{parquet_path('players')}')) AS total_players
        """
    ).fetchone()
    total_games, scraped_total, total_players = row

    scraped_by_user = 0
    if email:
        scraped_by_user = db.execute(
            f"SELECT count(*) FROM read_parquet('{parquet_path('games')}') WHERE ScrapedBy = ?",
            [email],
        ).fetchone()[0]

    elo_row = db.execute(
        f"""
        SELECT
            avg(CAST(gp.Elo AS DOUBLE))     AS avg_elo,
            median(CAST(gp.Elo AS DOUBLE))  AS median_elo
        FROM read_parquet('{parquet_path('gameplayers_canonical')}') gp
        JOIN read_parquet('{parquet_path('games')}') g ON g.TableId = gp.TableId
        WHERE g.ScrapedAt IS NOT NULL AND gp.Elo IS NOT NULL
        """
    ).fetchone()
    avg_elo, median_elo = elo_row

    return JSONResponse(content={
        "totalIndexedGames": int(total_games),
        "scrapedGamesTotal": int(scraped_total),
        "scrapedGamesByUser": int(scraped_by_user),
        "totalPlayers": int(total_players),
        "averageEloInScrapedGames": round(avg_elo) if avg_elo is not None else None,
        "medianEloInScrapedGames": round(median_elo) if median_elo is not None else None,
    })
