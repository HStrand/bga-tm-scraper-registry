import { api } from '@/lib/api';
import { AwardRow } from '@/types/award';

// Cache configuration
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY = 'award:rows:v2';

// In-memory cache
let inMemoryCache: {
  data: AwardRow[];
  fetchedAt: number;
} | null = null;

interface CacheEntry {
  data: AwardRow[];
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
function saveToLocalStorage(data: AwardRow[]): void {
  try {
    const entry: CacheEntry = {
      data,
      fetchedAt: Date.now(),
    };
    const json = JSON.stringify(entry);

    // Conservative threshold to avoid exceeding localStorage quota (~5MB typical).
    // Leave headroom for other keys and browser differences.
    const MAX_LOCALSTORAGE_BYTES = 2_400_000;

    // Use TextEncoder to measure byte size accurately (UTF-8).
    const bytes = new TextEncoder().encode(json).length;

    if (bytes > MAX_LOCALSTORAGE_BYTES) {
      console.warn(
        `Skipping localStorage cache: payload ${bytes} bytes exceeds threshold ${MAX_LOCALSTORAGE_BYTES}`
      );
      return;
    }

    localStorage.setItem(CACHE_KEY, json);
  } catch (error) {
    // QuotaExceededError or other issues — do not break UX; skip persistent cache.
    console.warn('Error saving to localStorage cache (skipping):', error);
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Fetch fresh data from API
 */
async function fetchFromAPI(): Promise<AwardRow[]> {
  const response = await api.get<AwardRow[]>('/api/awards/rows');
  return response.data;
}

/**
 * Get all award rows with caching
 */
export async function getAllAwardRowsCached(forceRefresh = false): Promise<AwardRow[]> {
  // If force refresh, clear caches and fetch fresh
  if (forceRefresh) {
    clearAllAwardRowsCache();
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
    console.error('Error fetching award rows:', error);
    throw error;
  }
}

/**
 * Clear all caches
 */
export function clearAllAwardRowsCache(): void {
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
 * SERVER-SIDE FILTERING: Awards overview
 */
import type { CorporationFilters } from '@/types/corporation';
import type { AwardOverviewRow } from '@/types/award';

interface AwardsOverviewApiRow {
  award: string;
  timesFunded: number;
  winRate: number;       // fraction 0..1
  avgEloGain: number;
  avgFundedGen: number;
  avgElo: number;
  flipRate: number;      // fraction 0..1
}

export interface AwardsFilterOptions {
  fundedGenRange: { min: number; max: number };
  corporations: string[];
}

const AWARDS_OPTIONS_CACHE_KEY = 'awards:options:v1';
let awardsOptionsInMemory: { data: AwardsFilterOptions; fetchedAt: number } | null = null;
const AWARDS_OPTIONS_TTL_MS = 30 * 60 * 1000;

function buildAwardsQuery(filters: CorporationFilters): string {
  const params = new URLSearchParams();

  const pushCsv = (key: string, arr?: (string | number)[]) => {
    if (arr && arr.length > 0) params.set(key, arr.join(','));
  };

  if (filters.eloMin !== undefined) params.set('eloMin', String(filters.eloMin));
  if (filters.eloMax !== undefined) params.set('eloMax', String(filters.eloMax));
  if (filters.generationsMin !== undefined) params.set('generationsMin', String(filters.generationsMin));
  if (filters.generationsMax !== undefined) params.set('generationsMax', String(filters.generationsMax));
  if (filters.timesPlayedMin !== undefined) params.set('timesPlayedMin', String(filters.timesPlayedMin));
  if (filters.timesPlayedMax !== undefined) params.set('timesPlayedMax', String(filters.timesPlayedMax));
  if (filters.playedGenMin !== undefined) params.set('fundedGenMin', String(filters.playedGenMin));
  if (filters.playedGenMax !== undefined) params.set('fundedGenMax', String(filters.playedGenMax));
  if (filters.playerName) params.set('playerName', filters.playerName);
  if (filters.corporation) params.set('corporation', filters.corporation);
  if (filters.preludeOn !== undefined) params.set('preludeOn', String(filters.preludeOn));
  if (filters.coloniesOn !== undefined) params.set('coloniesOn', String(filters.coloniesOn));
  if (filters.draftOn !== undefined) params.set('draftOn', String(filters.draftOn));

  pushCsv('playerCounts', filters.playerCounts);
  pushCsv('maps', filters.maps);
  pushCsv('modes', filters.gameModes);
  pushCsv('speeds', filters.gameSpeeds);

  return params.toString();
}

export async function getAwardsOverview(filters: CorporationFilters): Promise<AwardOverviewRow[]> {
  const qs = buildAwardsQuery(filters);
  const url = `/api/awards/overview${qs ? `?${qs}` : ''}`;
  const res = await api.get<AwardsOverviewApiRow[]>(url);
  const rows = res.data ?? [];
  // API is already in the UI shape and returns fractions for rates
  return rows.map(r => ({
    award: r.award,
    timesFunded: r.timesFunded,
    winRate: r.winRate ?? 0,
    avgEloGain: r.avgEloGain ?? 0,
    avgFundedGen: r.avgFundedGen ?? 0,
    avgElo: r.avgElo ?? 0,
    flipRate: r.flipRate ?? 0,
  }));
}

export async function getAwardsFilterOptions(forceRefresh = false): Promise<AwardsFilterOptions> {
  const now = Date.now();
  const fresh = (t: number) => now - t < AWARDS_OPTIONS_TTL_MS;

  if (forceRefresh) {
    awardsOptionsInMemory = null;
    try { localStorage.removeItem(AWARDS_OPTIONS_CACHE_KEY); } catch {}
  }

  if (awardsOptionsInMemory && fresh(awardsOptionsInMemory.fetchedAt)) {
    return awardsOptionsInMemory.data;
  }

  try {
    const ls = localStorage.getItem(AWARDS_OPTIONS_CACHE_KEY);
    if (ls) {
      const parsed = JSON.parse(ls) as { data: AwardsFilterOptions; fetchedAt: number };
      if (fresh(parsed.fetchedAt)) {
        awardsOptionsInMemory = parsed;
        return parsed.data;
      }
    }
  } catch {
    // ignore
  }

  const res = await api.get<AwardsFilterOptions>('/api/awards/options');
  const data = res.data;

  awardsOptionsInMemory = { data, fetchedAt: now };
  try {
    localStorage.setItem(AWARDS_OPTIONS_CACHE_KEY, JSON.stringify(awardsOptionsInMemory));
  } catch {
    // ignore storage quota errors
  }

  return data;
}
