import { api } from '@/lib/api';
import type { PlayerScore } from '@/types/leaderboard';
import type { CorporationFilters } from '@/types/corporation';

/**
 * Lightweight filter options for Leaderboard High Scores.
 * Mirrors the server's GetLeaderboardScoreOptions response.
 */
export interface ScoreFilterOptions {
  maps: string[];
  gameModes: string[];
  gameSpeeds: string[];
  playerCounts: number[];
  corporations: string[];
  eloRange: { min: number; max: number };
  generationsRange: { min: number; max: number };
}

/**
 * Build query string from CorporationFilters for High Scores.
 * Note: No timesPlayed filters here.
 */
function buildScoresQuery(filters: CorporationFilters, limit = 25): string {
  const params = new URLSearchParams();

  const pushCsv = (key: string, arr?: (string | number)[]) => {
    if (arr && arr.length > 0) params.set(key, arr.join(','));
  };

  if (filters.eloMin !== undefined) params.set('eloMin', String(filters.eloMin));
  if (filters.eloMax !== undefined) params.set('eloMax', String(filters.eloMax));
  if (filters.generationsMin !== undefined) params.set('generationsMin', String(filters.generationsMin));
  if (filters.generationsMax !== undefined) params.set('generationsMax', String(filters.generationsMax));
  if (filters.playerName) params.set('playerName', filters.playerName);
  if (filters.corporation) params.set('corporation', filters.corporation);
  if (filters.preludeOn !== undefined) params.set('preludeOn', String(filters.preludeOn));
  if (filters.coloniesOn !== undefined) params.set('coloniesOn', String(filters.coloniesOn));
  if (filters.draftOn !== undefined) params.set('draftOn', String(filters.draftOn));

  pushCsv('playerCounts', filters.playerCounts);
  pushCsv('maps', filters.maps);
  pushCsv('modes', filters.gameModes);
  pushCsv('speed', filters.gameSpeeds);

  params.set('limit', String(limit));

  return params.toString();
}

/**
 * Fetch server-provided filter options for High Scores
 */
export async function getLeaderboardScoreOptions(): Promise<ScoreFilterOptions> {
  const res = await api.get<ScoreFilterOptions>('/api/leaderboards/options');
  return res.data;
}

/**
 * Fetch High Scores with server-side filtering applied.
 * Returns already sorted and limited rows.
 */
export async function getHighScores(filters: CorporationFilters, limit = 25): Promise<PlayerScore[]> {
  const qs = buildScoresQuery(filters, limit);
  const url = `/api/leaderboards/scores${qs ? `?${qs}` : ''}`;
  const res = await api.get<PlayerScore[]>(url);
  return res.data;
}
