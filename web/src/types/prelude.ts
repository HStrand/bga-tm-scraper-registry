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

// Filters for prelude detail page
export interface PreludeDetailFilters {
  eloMin?: number;
  eloMax?: number;
  playerName?: string;
  maps: string[];
  gameModes: string[];
  gameSpeeds: string[];
  playerCounts: number[];
  corporations: string[];
  preludeOn?: boolean;
  coloniesOn?: boolean;
  draftOn?: boolean;
}

// Player stats for individual prelude detail page
export interface PreludePlayerStatsRow {
  tableId: number;
  playerId: number;
  map: string;
  gameMode: string;
  gameSpeed: string;
  playerCount?: number;
  preludeOn: boolean;
  coloniesOn: boolean;
  draftOn: boolean;
  seenGen?: number;
  drawnGen?: number;
  keptGen?: number;
  draftedGen?: number;
  boughtGen?: number;
  playedGen?: number;
  drawType: string;
  drawReason: string;
  vpScored?: number;
  playerName: string;
  elo?: number;
  eloChange?: number;
  position?: number;
  corporation: string;
}

// Computed stats for prelude header
export interface PreludeStats {
  totalGames: number;
  winRate: number;
  avgElo: number;
  avgEloChange: number;
}

// Corporation performance data for charts
export interface CorporationPerformance {
  corporation: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
  avgEloChange: number;
}

// Histogram bin data
export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  label: string;
}
