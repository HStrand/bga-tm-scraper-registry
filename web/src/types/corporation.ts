// Corporation stats data types

export interface CorporationPlayerStatsRow {
  tableId: number;
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
  avgFinalScore: number;
  avgDuration: number;
  avgGenerations: number;
  positionsCount: Record<number, number>;
  playerCountDistribution: Record<number, number>;
}

export interface CorporationFilters {
  eloMin?: number;
  eloMax?: number;
  playerCounts: number[];
  minFinalScore?: number;
  positions: number[];
}

export interface HistogramBin {
  min: number;
  max: number;
  count: number;
  label: string;
}
