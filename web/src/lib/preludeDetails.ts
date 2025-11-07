import { api } from '@/lib/api';
import type { PreludeDetailFilters, PreludeStats, CorporationPerformance, HistogramBin, PreludePlayerStatsRow } from '@/types/prelude';

/**
 * Server-side filtering API for Prelude detail page
 */

export interface PreludeDetailOptions {
  maps: string[];
  gameModes: string[];
  gameSpeeds: string[];
  playerCounts: number[];
  corporations: string[];
  eloRange: { min: number; max: number };
}

export interface PreludeDetailSummary extends PreludeStats {
  eloHistogramBins: HistogramBin[];
  eloChangeHistogramBins: HistogramBin[];
  corporationPerformance?: CorporationPerformance[];
}

function buildQuery(filters: PreludeDetailFilters): string {
  const params = new URLSearchParams();

  const pushCsv = (key: string, arr?: (string | number)[]) => {
    if (arr && arr.length > 0) params.set(key, arr.join(','));
  };

  if (filters.eloMin !== undefined) params.set('eloMin', String(filters.eloMin));
  if (filters.eloMax !== undefined) params.set('eloMax', String(filters.eloMax));
  if (filters.playerName) params.set('playerName', filters.playerName);
  if (filters.preludeOn !== undefined) params.set('preludeOn', String(filters.preludeOn));
  if (filters.coloniesOn !== undefined) params.set('coloniesOn', String(filters.coloniesOn));
  if (filters.draftOn !== undefined) params.set('draftOn', String(filters.draftOn));
  if (filters.corporation) params.set('corporation', filters.corporation);

  pushCsv('playerCounts', filters.playerCounts);
  pushCsv('maps', filters.maps);
  pushCsv('modes', filters.gameModes);
  pushCsv('speed', filters.gameSpeeds);
  pushCsv('corporations', filters.corporations);

  return params.toString();
}

export async function getPreludeDetailOptions(cardName: string): Promise<PreludeDetailOptions> {
  const res = await api.get<PreludeDetailOptions>(`/api/preludes/${encodeURIComponent(cardName)}/options`);
  return res.data;
}

export async function getPreludeDetailSummary(cardName: string, filters: PreludeDetailFilters): Promise<PreludeDetailSummary> {
  const qs = buildQuery(filters);
  const url = `/api/preludes/${encodeURIComponent(cardName)}/summary${qs ? `?${qs}` : ''}`;
  const res = await api.get<PreludeDetailSummary>(url);
  return res.data;
}

export interface PreludeRowsResponse {
  rows: PreludePlayerStatsRow[];
  total: number;
}

export async function getPreludePlayerRows(cardName: string, filters: PreludeDetailFilters, limit = 500, offset = 0): Promise<PreludeRowsResponse> {
  const params = new URLSearchParams(buildQuery(filters));
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const url = `/api/preludes/${encodeURIComponent(cardName)}/playerrows?${params.toString()}`;
  const res = await api.get<PreludeRowsResponse>(url);
  return res.data;
}
