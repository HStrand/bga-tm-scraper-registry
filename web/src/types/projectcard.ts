// Project card stats data types

export interface ProjectCardPlayerStatsRow {
  tableId: number;
  playerId: number;
  map?: string;
  gameMode?: string;
  gameSpeed?: string;
  preludeOn?: boolean;
  coloniesOn?: boolean;
  draftOn?: boolean;
  seenGen?: number;
  drawnGen?: number;
  keptGen?: number;
  draftedGen?: number;
  boughtGen?: number;
  playedGen?: number;
  drawType?: string;
  drawReason?: string;
  vpScored?: number;
  playerName: string;
  elo?: number;
  eloChange?: number;
  position?: number;
}

export interface ProjectCardStats {
  totalGames: number;
  winRate: number;
  avgElo: number;
  avgEloChange: number;
  avgVpScored: number;
}

export interface ProjectCardFilters {
  eloMin?: number;
  eloMax?: number;
  playerCounts: number[];
  maps: string[];
  gameModes: string[];
  gameSpeeds: string[];
  playerName?: string;
  preludeOn?: boolean;
  coloniesOn?: boolean;
  draftOn?: boolean;
  playedGenMin?: number;
  playedGenMax?: number;
}

export interface GenerationData {
  generation: number;
  winRate: number;
  avgEloChange: number;
  gameCount: number;
}

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  label: string;
}

export interface GenerationDistributionData {
  generation: number;
  count: number;
  percentage: number;
}

export interface ProjectCardStatsRow {
  card: string;
  timesPlayed: number;
  winRate: number;
  avgElo: number;
  avgEloChange: number;
}

export interface ProjectCardOverviewRow {
  card: string;
  name: string;
  totalGames: number;
  winRate: number;
  avgElo: number;
  avgEloChange: number;
}

export interface ProjectCardOverviewFilters {
  timesPlayedMin?: number;
  searchTerm?: string;
}
