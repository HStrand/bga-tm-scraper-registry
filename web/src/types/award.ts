// Award stats data types

export interface AwardRow {
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
  award: string;
  fundedBy: number;
  fundedGen: number;
  playerId: number;
  playerCounter?: number;
  playerName: string;
  elo?: number;
  eloChange?: number;
  position?: number;
  playerPlace?: number;
  corporation?: string;
}

export interface AwardOverviewRow {
  award: string;
  timesFunded: number;
  winRate: number;
  avgEloGain: number;
  avgFundedGen: number;
  avgElo: number;
  flipRate: number;
}

// Reuse the same filters as milestones for consistency, but with fundedGen instead of claimedGen
export interface AwardFilters {
  eloMin?: number;
  eloMax?: number;
  timesPlayedMin?: number;
  timesPlayedMax?: number;
  fundedGenMin?: number;
  fundedGenMax?: number;
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
