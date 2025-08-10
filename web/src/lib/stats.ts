import axios from "axios";

export interface Statistics {
  totalIndexedGames: number;
  scrapedGamesTotal: number;
  scrapedGamesByUser: number;
  totalPlayers: number;
  averageEloInScrapedGames?: number | null;
  medianEloInScrapedGames?: number | null;
}

// Default email used for the GetStatistics endpoint (not shown in UI)
const DEFAULT_EMAIL = "stats@bga.tm"; // change if you need a different default

// Optional Functions key support via env (if needed by your deployment)
// Define VITE_FUNCTIONS_KEY in your env to automatically add it as a header.
const FUNCTIONS_KEY = import.meta.env.VITE_FUNCTIONS_KEY as string | undefined;

export async function getStatistics(email: string = DEFAULT_EMAIL): Promise<Statistics> {
  const url = `/api/GetStatistics?email=${encodeURIComponent(email)}`;
  const headers: Record<string, string> = {};
  if (FUNCTIONS_KEY) {
    headers["x-functions-key"] = FUNCTIONS_KEY;
  }
  const res = await axios.get(url, { headers });
  // Normalize casing from the backend model to TS interface keys
  const raw = res.data || {};
  return {
    totalIndexedGames: raw.totalIndexedGames ?? raw.TotalIndexedGames ?? 0,
    scrapedGamesTotal: raw.scrapedGamesTotal ?? raw.ScrapedGamesTotal ?? 0,
    scrapedGamesByUser: raw.scrapedGamesByUser ?? raw.ScrapedGamesByUser ?? 0,
    totalPlayers: raw.totalPlayers ?? raw.TotalPlayers ?? 0,
    averageEloInScrapedGames: raw.averageEloInScrapedGames ?? raw.AverageEloInScrapedGames ?? null,
    medianEloInScrapedGames: raw.medianEloInScrapedGames ?? raw.MedianEloInScrapedGames ?? null,
  };
}
