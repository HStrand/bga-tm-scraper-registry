export interface StartingHandStatsRow {
  card: string;
  offeredGames: number;
  keptGames: number;
  notKeptGames: number;
  keepRate: number | null;
  avgEloChangeOffered: number | null;
  avgEloChangeKept: number | null;
  avgEloChangeNotKept: number | null;
}

export interface StartingHandOverviewRow {
  card: string;       // slug
  name: string;       // display name
  offeredGames: number;
  keptGames: number;
  notKeptGames: number;
  keepRate: number | null;
  avgEloChangeOffered: number | null;
  avgEloChangeKept: number | null;
  avgEloChangeNotKept: number | null;
}

export interface StartingHandOverviewFilters {
  offeredGamesMin?: number;
  searchTerm?: string;
}
