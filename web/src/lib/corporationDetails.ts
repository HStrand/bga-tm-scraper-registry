import { api } from '@/lib/api';
import type { CorporationFilters, CorporationStats, HistogramBin, CorporationPlayerStatsRow } from '@/types/corporation';

export interface CorporationDetailOptions {
  maps: string[];
  gameModes: string[];
  gameSpeeds: string[];
  playerCounts: number[];
  eloRange: { min: number; max: number };
  generationsRange: { min: number; max: number };
}

export interface CorporationDetailSummary extends CorporationStats {
  eloHistogramBins: HistogramBin[];
  eloChangeHistogramBins: HistogramBin[];
}

function buildQuery(filters: CorporationFilters): string {
  const params = new URLSearchParams();

  const pushCsv = (key: string, arr?: (string | number)[]) => {
    if (arr && arr.length > 0) params.set(key, arr.join(','));
  };

  if (filters.eloMin !== undefined) params.set('eloMin', String(filters.eloMin));
  if (filters.eloMax !== undefined) params.set('eloMax', String(filters.eloMax));
  if (filters.generationsMin !== undefined) params.set('generationsMin', String(filters.generationsMin));
  if (filters.generationsMax !== undefined) params.set('generationsMax', String(filters.generationsMax));
  if (filters.playerName) params.set('playerName', filters.playerName);
  if (filters.preludeOn !== undefined) params.set('preludeOn', String(filters.preludeOn));
  if (filters.coloniesOn !== undefined) params.set('coloniesOn', String(filters.coloniesOn));
  if (filters.draftOn !== undefined) params.set('draftOn', String(filters.draftOn));

  pushCsv('playerCounts', filters.playerCounts);
  pushCsv('maps', filters.maps);
  pushCsv('modes', filters.gameModes);
  pushCsv('speed', filters.gameSpeeds);

  return params.toString();
}

export async function getCorporationDetailOptions(slug: string): Promise<CorporationDetailOptions> {
  const res = await api.get<CorporationDetailOptions>(`/api/corporations/${encodeURIComponent(slug)}/options`);
  return res.data;
}

export async function getCorporationDetailSummary(slug: string, filters: CorporationFilters): Promise<CorporationDetailSummary> {
  const qs = buildQuery(filters);
  const url = `/api/corporations/${encodeURIComponent(slug)}/summary${qs ? `?${qs}` : ''}`;
  const res = await api.get<CorporationDetailSummary>(url);
  return res.data;
}

export interface CorporationGamesResponse {
  rows: CorporationPlayerStatsRow[];
  total: number;
}

export async function getCorporationGames(slug: string, filters: CorporationFilters, limit = 200, offset = 0): Promise<CorporationGamesResponse> {
  const params = new URLSearchParams(buildQuery(filters));
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const url = `/api/corporations/${encodeURIComponent(slug)}/games?${params.toString()}`;
  const res = await api.get<CorporationGamesResponse>(url);
  return res.data;
}
