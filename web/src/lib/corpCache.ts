import { api } from '@/lib/api';
import { AllCorporationPlayerStatsRow } from '@/types/corporation';

// Cache configuration
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY = 'corp:all:v1';

// In-memory cache
let inMemoryCache: {
  data: AllCorporationPlayerStatsRow[];
  fetchedAt: number;
} | null = null;

interface CacheEntry {
  data: AllCorporationPlayerStatsRow[];
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
function saveToLocalStorage(data: AllCorporationPlayerStatsRow[]): void {
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
async function fetchFromAPI(): Promise<AllCorporationPlayerStatsRow[]> {
  const response = await api.get<AllCorporationPlayerStatsRow[]>('/api/corporations/playerstats');
  return response.data;
}

/**
 * Get all corporation stats with caching
 */
export async function getAllCorporationStatsCached(forceRefresh = false): Promise<AllCorporationPlayerStatsRow[]> {
  // If force refresh, clear caches and fetch fresh
  if (forceRefresh) {
    clearAllCorporationStatsCache();
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
    console.error('Error fetching corporation stats:', error);
    throw error;
  }
}

/**
 * Clear all caches
 */
export function clearAllCorporationStatsCache(): void {
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
 * SERVER-SIDE FILTERING
 * Fetch aggregated corporation rankings from the API for the given filters.
 * Returns data mapped to CorporationOverviewRow (winRate as 0..1 fraction).
 */
export interface CorporationRankingsApiRow {
  corporation: string;   // e.g. "Mining Guild"
  winRate: number;       // percent 0..100 from API
  avgEloGain: number;
  gamesPlayed: number;
  avgElo: number;
}

import type { CorporationFilters, CorporationOverviewRow } from '@/types/corporation';

/**
 * Build query string from filters
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

  pushCsv('playerCounts', filters.playerCounts);
  pushCsv('maps', filters.maps);
  pushCsv('modes', filters.gameModes);
  pushCsv('speed', filters.gameSpeeds);

  return params.toString();
}

/**
 * Call /api/corporations/rankings and map to CorporationOverviewRow
 */
export async function getCorporationRankings(filters: CorporationFilters): Promise<CorporationOverviewRow[]> {
  const qs = buildRankingsQuery(filters);
  const url = `/api/corporations/rankings${qs ? `?${qs}` : ''}`;
  const res = await api.get<CorporationRankingsApiRow[]>(url);
  const rows = res.data;

  // Map API rows to UI shape; convert corporation to slug and winRate to fraction
  const { nameToSlug } = await import('@/lib/corp');
  return rows.map(r => ({
    corporation: nameToSlug(r.corporation),
    totalGames: r.gamesPlayed,
    winRate: (r.winRate ?? 0) / 100,
    avgElo: r.avgElo ?? 0,
    avgEloChange: r.avgEloGain ?? 0,
  }));
}
