import { api } from "@/lib/api";

export interface Statistics {
  totalIndexedGames: number;
  scrapedGamesTotal: number;
  scrapedGamesByUser: number;
  totalPlayers: number;
  averageEloInScrapedGames?: number | null;
  medianEloInScrapedGames?: number | null;
}

export interface GlobalStatistics {
  totalIndexedGames: number;
  scrapedGamesTotal: number;
  totalPlayers: number;
  averageEloInScrapedGames?: number | null;
  totalCardDraws: number;
  totalPlayerTrackerChanges: number;
  totalNumberOfGreeneries: number;
  totalNumberOfCities: number;
  totalNumberOfAwards: number;
  totalNumberOfMilestones: number;
  totalNumberOfGlobalParameterIncreases: number;
}

// Default email used for the GetStatistics endpoint (not shown in UI)
const DEFAULT_EMAIL = "stats@bga.tm"; // change if you need a different default

// Optional Functions key support via env (if needed by your deployment)
// Define VITE_FUNCTIONS_KEY in your env to automatically add it as a header.

export async function getStatistics(email: string = DEFAULT_EMAIL): Promise<Statistics> {
  const url = `/api/GetStatistics?email=${encodeURIComponent(email)}`;
  const res = await api.get(url);
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

export async function getGlobalStatistics(): Promise<GlobalStatistics> {
  const url = `/api/GetGlobalStatistics`;
  const res = await api.get(url);
  // Normalize casing from the backend model to TS interface keys
  const raw = res.data || {};
  return {
    totalIndexedGames: raw.totalIndexedGames ?? raw.TotalIndexedGames ?? 0,
    scrapedGamesTotal: raw.scrapedGamesTotal ?? raw.ScrapedGamesTotal ?? 0,
    totalPlayers: raw.totalPlayers ?? raw.TotalPlayers ?? 0,
    averageEloInScrapedGames: raw.averageEloInScrapedGames ?? raw.AverageEloInScrapedGames ?? null,
    totalCardDraws: raw.totalCardDraws ?? raw.TotalCardDraws ?? 0,
    totalPlayerTrackerChanges: raw.totalPlayerTrackerChanges ?? raw.TotalPlayerTrackerChanges ?? 0,
    totalNumberOfGreeneries: raw.totalNumberOfGreeneries ?? raw.TotalNumberOfGreeneries ?? 0,
    totalNumberOfCities: raw.totalNumberOfCities ?? raw.TotalNumberOfCities ?? 0,
    totalNumberOfAwards: raw.totalNumberOfAwards ?? raw.TotalNumberOfAwards ?? 0,
    totalNumberOfMilestones: raw.totalNumberOfMilestones ?? raw.TotalNumberOfMilestones ?? 0,
    totalNumberOfGlobalParameterIncreases: raw.totalNumberOfGlobalParameterIncreases ?? raw.TotalNumberOfGlobalParameterIncreases ?? 0,
  };
}
