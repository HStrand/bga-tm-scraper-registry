import { api } from '@/lib/api';
import { PreludeStatsRow, PreludePlayerStatsRow, PreludeOverviewRow } from '@/types/prelude';
import type { CorporationFilters } from '@/types/corporation';

/**
 * Legacy aggregated stats (no filters) for other pages – kept intact.
 */

// Cache configuration
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY = 'preludes:all:v1';

// In-memory cache
let inMemoryCache: {
  data: PreludeStatsRow[];
  fetchedAt: number;
} | null = null;

interface CacheEntry {
  data: PreludeStatsRow[];
  fetchedAt: number;
}

/**
 * Check if cache entry is still fresh
 */
function isCacheFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < TTL_MS;
}

/**
 * Get data from localStorage cache
 */
function getFromLocalStorage(): CacheEntry | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const entry: CacheEntry = JSON.parse(cached);
    if (!isCacheFresh(entry.fetchedAt)) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return entry;
  } catch (error) {
    console.warn('Error reading from localStorage cache:', error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

/**
 * Save data to localStorage cache
 */
function saveToLocalStorage(data: PreludeStatsRow[]): void {
  try {
    const entry: CacheEntry = {
      data,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (error) {
    console.warn('Error saving to localStorage cache:', error);
  }
}

/**
 * Fetch fresh data from API
 */
async function fetchFromAPI(): Promise<PreludeStatsRow[]> {
  const response = await api.get<PreludeStatsRow[]>('/api/preludes/stats');
  return response.data;
}

/**
 * Get all prelude stats with caching
 */
export async function getAllPreludeStatsCached(forceRefresh = false): Promise<PreludeStatsRow[]> {
  // If force refresh, clear caches and fetch fresh
  if (forceRefresh) {
    clearAllPreludeStatsCache();
  }
  
  // Check in-memory cache first
  if (inMemoryCache && isCacheFresh(inMemoryCache.fetchedAt)) {
    return inMemoryCache.data;
  }
  
  // Check localStorage cache
  const localStorageEntry = getFromLocalStorage();
  if (localStorageEntry) {
    // Update in-memory cache
    inMemoryCache = localStorageEntry;
    return localStorageEntry.data;
  }
  
  // Fetch fresh data from API
  try {
    const data = await fetchFromAPI();
    
    // Update both caches
    inMemoryCache = {
      data,
      fetchedAt: Date.now(),
    };
    saveToLocalStorage(data);
    
    return data;
  } catch (error) {
    console.error('Error fetching prelude stats:', error);
    throw error;
  }
}

/**
 * Clear all caches
 */
export function clearAllPreludeStatsCache(): void {
  inMemoryCache = null;
  localStorage.removeItem(CACHE_KEY);
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): {
  inMemory: boolean;
  localStorage: boolean;
  lastFetched?: Date;
} {
  const localEntry = getFromLocalStorage();
  
  return {
    inMemory: inMemoryCache !== null && isCacheFresh(inMemoryCache.fetchedAt),
    localStorage: localEntry !== null,
    lastFetched: inMemoryCache?.fetchedAt ? new Date(inMemoryCache.fetchedAt) : 
                 localEntry?.fetchedAt ? new Date(localEntry.fetchedAt) : undefined,
  };
}

/**
 * Fetch prelude player stats from API (no caching for individual prelude stats)
 */
export async function getPreludePlayerStats(preludeName: string): Promise<PreludePlayerStatsRow[]> {
  try {
    const response = await api.get<PreludePlayerStatsRow[]>(`/api/preludes/${encodeURIComponent(preludeName)}/playerstats`);
    return response.data;
  } catch (error) {
    console.error('Error fetching prelude player stats:', error);
    throw error;
  }
}

/**
 * SERVER-SIDE FILTERING for Preludes Overview (mirrors corporations pattern)
 */

export interface PreludeRankingsApiRow {
  prelude: string;     // display name e.g. "Acquired Space Agency"
  winRate: number;     // percent 0..100 from API
  avgEloGain: number;
  gamesPlayed: number;
  avgElo: number;
}

export interface PreludeFilterOptions {
  maps: string[];
  gameModes: string[];
  gameSpeeds: string[];
  playerCounts: number[];
  eloRange: { min: number; max: number };
  generationsRange: { min: number; max: number };
  corporations: string[];
}

/**
 * Build query string from filters (same keys as corp; adds corporation)
 */
function buildRankingsQuery(filters: CorporationFilters): string {
  const params = new URLSearchParams();

  const pushCsv = (key: string, arr?: (string | number)[]) => {
    if (arr && arr.length > 0) params.set(key, arr.join(','));
  };

  if (filters.eloMin !== undefined) params.set('eloMin', String(filters.eloMin));
  if (filters.eloMax !== undefined) params.set('eloMax', String(filters.eloMax));
  if (filters.timesPlayedMin !== undefined) params.set('timesPlayedMin', String(filters.timesPlayedMin));
  if (filters.timesPlayedMax !== undefined) params.set('timesPlayedMax', String(filters.timesPlayedMax));
  if (filters.generationsMin !== undefined) params.set('generationsMin', String(filters.generationsMin));
  if (filters.generationsMax !== undefined) params.set('generationsMax', String(filters.generationsMax));
  if (filters.playerName) params.set('playerName', filters.playerName);
  if (filters.preludeOn !== undefined) params.set('preludeOn', String(filters.preludeOn));
  if (filters.coloniesOn !== undefined) params.set('coloniesOn', String(filters.coloniesOn));
  if (filters.draftOn !== undefined) params.set('draftOn', String(filters.draftOn));
  if (filters.corporation) params.set('corporation', filters.corporation);

  pushCsv('playerCounts', filters.playerCounts);
  pushCsv('maps', filters.maps);
  pushCsv('modes', filters.gameModes);
  pushCsv('speed', filters.gameSpeeds);

  return params.toString();
}

/**
 * Call /api/preludes/rankings and map to PreludeOverviewRow
 * Note: returns winRate as 0..1 fraction, includes both slug and display name.
 */
export async function getPreludeRankings(filters: CorporationFilters): Promise<PreludeOverviewRow[]> {
  const qs = buildRankingsQuery(filters);
  const url = `/api/preludes/rankings${qs ? `?${qs}` : ''}`;
  const res = await api.get<PreludeRankingsApiRow[]>(url);
  const rows = res.data;

  const { preludeNameToSlug } = await import('@/lib/prelude');
  return rows.map(r => ({
    prelude: preludeNameToSlug(r.prelude),
    name: r.prelude,
    totalGames: r.gamesPlayed,
    winRate: (r.winRate ?? 0) / 100,
    avgElo: r.avgElo ?? 0,
    avgEloChange: r.avgEloGain ?? 0,
  }));
}

/**
 * Lightweight filter options for prelude overview.
 * Uses in-memory + localStorage cache similar to corp options cache.
 */
const OPTIONS_CACHE_KEY = 'prelude:options:v1';
let optionsInMemory: { data: PreludeFilterOptions; fetchedAt: number } | null = null;
const OPTIONS_TTL_MS = 30 * 60 * 1000;

export async function getPreludeFilterOptions(forceRefresh = false): Promise<PreludeFilterOptions> {
  const now = Date.now();
  const fresh = (t: number) => now - t < OPTIONS_TTL_MS;

  if (forceRefresh) {
    optionsInMemory = null;
    try { localStorage.removeItem(OPTIONS_CACHE_KEY); } catch {}
  }

  if (optionsInMemory && fresh(optionsInMemory.fetchedAt)) {
    return optionsInMemory.data;
  }

  try {
    const ls = localStorage.getItem(OPTIONS_CACHE_KEY);
    if (ls) {
      const parsed = JSON.parse(ls) as { data: PreludeFilterOptions; fetchedAt: number };
      if (fresh(parsed.fetchedAt)) {
        optionsInMemory = parsed;
        return parsed.data;
      }
    }
  } catch {
    // ignore cache parsing errors
  }

  const res = await api.get<PreludeFilterOptions>('/api/preludes/options');
  const data = res.data;

  optionsInMemory = { data, fetchedAt: now };
  try {
    localStorage.setItem(OPTIONS_CACHE_KEY, JSON.stringify(optionsInMemory));
  } catch {
    // ignore storage quota errors
  }

  return data;
}
