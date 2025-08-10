// Corporation stats data types

export interface CorporationPlayerStatsRow {
  tableId: number;
  map?: string;
  preludeOn?: boolean;
  coloniesOn?: boolean;
  draftOn?: boolean;
  gameMode?: string;
  gameSpeed?: string;
  playerCount?: number;
  durationMinutes?: number;
  generations?: number;
  finalScore?: number;
  finalTr?: number;
  greeneryPoints?: number;
  cityPoints?: number;
  milestonePoints?: number;
  awardPoints?: number;
  cardPoints?: number;
  playerId: number;
  playerName: string;
  elo?: number;
  eloChange?: number;
  position?: number;
}

export interface CorporationStats {
  totalGames: number;
  winRate: number;
  avgElo: number;
  avgEloChange: number;
  avgFinalScore: number;
  avgTr: number;
  avgCardPoints: number;
  avgGreeneryPoints: number;
  avgCityPoints: number;
  avgMilestonePoints: number;
  avgAwardPoints: number;
  avgDuration: number;
  avgGenerations: number;
  positionsCount: Record<number, number>;
  playerCountDistribution: Record<number, number>;
}

export interface CorporationFilters {
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
}

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  label: string;
}

export interface AllCorporationPlayerStatsRow extends CorporationPlayerStatsRow {
  corporation: string;
}

export interface CorporationOverviewRow {
  corporation: string;
  totalGames: number;
  winRate: number;
  avgElo: number;
  avgEloChange: number;
}
