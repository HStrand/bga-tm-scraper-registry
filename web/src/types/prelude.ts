// Prelude stats data types

export interface PreludeStatsRow {
  card: string;
  timesPlayed: number;
  winRate: number;
  avgElo: number;
  avgEloChange: number;
}

export interface PreludeOverviewRow {
  prelude: string;
  name: string;
  totalGames: number;
  winRate: number;
  avgElo: number;
  avgEloChange: number;
}

export interface PreludeFilters {
  timesPlayedMin?: number;
  searchTerm?: string;
}
