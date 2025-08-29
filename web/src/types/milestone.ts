// Milestone stats data types

export interface MilestoneStats {
  name: string;
  timesClaimed: number;
  winRate: number;
  avgEloGain: number;
  avgGenClaimed: number;
  avgElo: number;
}

export interface MilestoneClaimRow {
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
  milestone: string;
  claimedGen?: number;
  playerId: number;
  playerName: string;
  elo?: number;
  eloChange?: number;
  position?: number;
  corporation?: string;
}

export interface MilestoneOverviewRow {
  milestone: string;
  timesClaimed: number;
  winRate: number;
  avgEloGain: number;
  avgGenClaimed: number;
  avgElo: number;
}

// Reuse the same filters as corporations for consistency
export interface MilestoneFilters {
  eloMin?: number;
  eloMax?: number;
  timesPlayedMin?: number;
  timesPlayedMax?: number;
  playedGenMin?: number;
  playedGenMax?: number;
  playerCounts: number[];
  corporation?: string;
  maps: string[];
  gameModes: string[];
  gameSpeeds: string[];
  playerName?: string;
  preludeOn?: boolean;
  coloniesOn?: boolean;
  draftOn?: boolean;
  generationsMin?: number;
  generationsMax?: number;
}
