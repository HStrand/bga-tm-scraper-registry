from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import open_connection
from app.routes import awards, bundle, cards, combinations, corporations, leaderboards, map_stats, milestones, players, preludes, startinghands, statistics


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = open_connection()
    try:
        yield
    finally:
        app.state.db.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://tfmstats.com",
        "https://www.tfmstats.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(corporations.router)
app.include_router(cards.router)
app.include_router(awards.router)
app.include_router(statistics.router)
app.include_router(bundle.router)
app.include_router(preludes.router)
app.include_router(combinations.router)
app.include_router(startinghands.router)
app.include_router(map_stats.router)
app.include_router(players.router)
app.include_router(milestones.router)
app.include_router(leaderboards.router)
app.include_router(statistics.legacy_router)


@app.get("/health")
def health():
    return {"status": "ok"}
