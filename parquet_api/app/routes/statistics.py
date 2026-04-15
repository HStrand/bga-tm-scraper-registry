from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.db import parquet_path

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


@router.get("/global")
def get_global_statistics(request: Request):
    db = request.app.state.db

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
