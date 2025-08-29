// Player Score types
export interface PlayerScore {
  tableId: number;
  playerId: number;
  playerName: string;
  corporation: string;
  map: string;
  coloniesOn: boolean;
  gameMode: string;
  gameSpeed: string;
  preludeOn: boolean;
  draftOn: boolean;
  generations: number | null;
  playerCount: number | null;
  finalScore: number;
  elo: number | null;
}

// Player Greenery Stats types
export interface PlayerGreeneryStats {
  playerId: number;
  name: string;
  greeneries: number;
  gameCount: number;
  greeneriesPerGame: number;
  greeneriesPerGeneration: number;
}

// Player Parameter Stats types
export interface PlayerParameterStats {
  playerId: number;
  name: string;
  parameterIncreases: number;
  gameCount: number;
  parameterIncreasesPerGame: number;
}

// Player Milestone Stats types
export interface PlayerMilestoneStats {
  playerId: number;
  playerName: string;
  tharsisGames: number;
  terraformer: number;
  gardener: number;
  builder: number;
  mayor: number;
  planner: number;
  terraformerRate: number;
  gardenerRate: number;
  builderRate: number;
  mayorRate: number;
  plannerRate: number;
  totalMilestoneRate: number;
}

// Player Award Stats types
export interface PlayerAwardStats {
  playerId: number;
  playerName: string;
  tharsisGames: number;
  thermalist: number;
  banker: number;
  scientist: number;
  miner: number;
  landlord: number;
  totalFirsts: number;
  thermalistRate: number;
  bankerRate: number;
  scientistRate: number;
  minerRate: number;
  landlordRate: number;
  totalAwardRate: number;
}

// Leaderboard view types
export type LeaderboardView = 'scores' | 'greeneries' | 'parameters' | 'milestones' | 'awards';

export type MilestoneType = 'terraformer' | 'gardener' | 'builder' | 'mayor' | 'planner' | 'total';
export type AwardType = 'thermalist' | 'banker' | 'scientist' | 'miner' | 'landlord' | 'total';

// Filters for high scores view
export interface HighScoreFilters {
  corporation?: string;
  map?: string;
  coloniesOn?: boolean;
  gameMode?: string;
  gameSpeed?: string;
  preludeOn?: boolean;
  draftOn?: boolean;
  generations?: number;
  playerCount?: number;
}
