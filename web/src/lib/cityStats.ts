import { api } from '@/lib/api';

export interface TilePlacementStat {
  tileLocation: string;
  gameCount: number;
  avgEloChange: number;
  avgPoints: number;
}

export interface TilePlacementByGen {
  tileLocation: string;
  placedGen: number | null;
  gameCount: number;
  avgEloChange: number;
  avgPoints: number;
}

export type TileType = 'city' | 'greenery';

type OverviewData = Record<string, TilePlacementStat[]>;
type ByGenData = Record<string, TilePlacementByGen[]>;

const TTL_MS = 10 * 60 * 1000;
const OVERVIEW_LS_PREFIX = 'tile-stats:overview:v1:';
const BYGEN_LS_PREFIX = 'tile-stats:by-gen:v1:';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const overviewMemCache: Partial<Record<TileType, CacheEntry<OverviewData>>> = {};
const byGenMemCache: Partial<Record<TileType, CacheEntry<ByGenData>>> = {};

function isFresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && Date.now() - entry.fetchedAt < TTL_MS;
}

function lsGet<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!isFresh(entry)) {
      localStorage.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function lsSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, fetchedAt: Date.now() }));
  } catch {
    // quota / serialization errors — silently skip, memory cache still works
  }
}

export async function getAllTilePlacementStats(
  tileType: TileType,
  forceRefresh = false,
): Promise<OverviewData> {
  const lsKey = OVERVIEW_LS_PREFIX + tileType;
  if (forceRefresh) {
    delete overviewMemCache[tileType];
    localStorage.removeItem(lsKey);
  }
  const mem = overviewMemCache[tileType];
  if (isFresh(mem)) return mem.data;
  const ls = lsGet<OverviewData>(lsKey);
  if (ls) {
    overviewMemCache[tileType] = ls;
    return ls.data;
  }
  const res = await api.get<OverviewData>(`/api/tile-stats/${tileType}/overview`);
  const data = res.data ?? {};
  overviewMemCache[tileType] = { data, fetchedAt: Date.now() };
  lsSet(lsKey, data);
  return data;
}

export async function getAllTilePlacementByGen(
  tileType: TileType,
  forceRefresh = false,
): Promise<ByGenData> {
  const lsKey = BYGEN_LS_PREFIX + tileType;
  if (forceRefresh) {
    delete byGenMemCache[tileType];
    localStorage.removeItem(lsKey);
  }
  const mem = byGenMemCache[tileType];
  if (isFresh(mem)) return mem.data;
  const ls = lsGet<ByGenData>(lsKey);
  if (ls) {
    byGenMemCache[tileType] = ls;
    return ls.data;
  }
  const res = await api.get<ByGenData>(`/api/tile-stats/${tileType}/by-gen`);
  const data = res.data ?? {};
  byGenMemCache[tileType] = { data, fetchedAt: Date.now() };
  lsSet(lsKey, data);
  return data;
}

export function clearTilePlacementCache(): void {
  for (const t of ['city', 'greenery'] as TileType[]) {
    delete overviewMemCache[t];
    delete byGenMemCache[t];
    localStorage.removeItem(OVERVIEW_LS_PREFIX + t);
    localStorage.removeItem(BYGEN_LS_PREFIX + t);
  }
}
