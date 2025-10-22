import { api } from '@/lib/api';
import { MilestoneClaimRow } from '@/types/milestone';

// Cache configuration
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY = 'milestone:claims:v1';

// In-memory cache
let inMemoryCache: {
  data: MilestoneClaimRow[];
  fetchedAt: number;
} | null = null;

interface CacheEntry {
  data: MilestoneClaimRow[];
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
function saveToLocalStorage(data: MilestoneClaimRow[]): void {
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
async function fetchFromAPI(): Promise<MilestoneClaimRow[]> {
  const response = await api.get<MilestoneClaimRow[]>('/api/milestones/claims');
  return response.data;
}

/**
 * Get all milestone claim rows with caching
 */
export async function getAllMilestoneClaimRowsCached(forceRefresh = false): Promise<MilestoneClaimRow[]> {
  // If force refresh, clear caches and fetch fresh
  if (forceRefresh) {
    clearAllMilestoneClaimRowsCache();
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
    console.error('Error fetching milestone claim rows:', error);
    throw error;
  }
}

/**
 * Clear all caches
 */
export function clearAllMilestoneClaimRowsCache(): void {
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
 * SERVER-SIDE FILTERING: Milestones overview
 */
import type { MilestoneOverviewRow } from '@/types/milestone';
import type { CorporationFilters } from '@/types/corporation';

interface MilestonesOverviewApiRow {
  milestone: string;
  timesClaimed: number;
  winRate: number;       // 0..1 from API
  avgEloGain: number;
  avgGenClaimed: number;
  avgElo: number;
}

export interface MilestonesFilterOptions {
  claimedGenRange: { min: number; max: number };
  corporations: string[];
}

const MILESTONES_OPTIONS_CACHE_KEY = 'milestones:options:v1';
let milestonesOptionsInMemory: { data: MilestonesFilterOptions; fetchedAt: number } | null = null;
const MILESTONES_OPTIONS_TTL_MS = 30 * 60 * 1000;

function buildMilestonesQuery(filters: CorporationFilters): string {
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
  if (filters.playedGenMin !== undefined) params.set('claimedGenMin', String(filters.playedGenMin));
  if (filters.playedGenMax !== undefined) params.set('claimedGenMax', String(filters.playedGenMax));
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

export async function getMilestonesOverview(filters: CorporationFilters): Promise<MilestoneOverviewRow[]> {
  const qs = buildMilestonesQuery(filters);
  const url = `/api/milestones/overview${qs ? `?${qs}` : ''}`;
  const res = await api.get<MilestonesOverviewApiRow[]>(url);
  const rows = res.data ?? [];
  // API already returns proper types/ranges
  return rows.map(r => ({
    milestone: r.milestone,
    timesClaimed: r.timesClaimed,
    winRate: r.winRate ?? 0,
    avgEloGain: r.avgEloGain ?? 0,
    avgGenClaimed: r.avgGenClaimed ?? 0,
    avgElo: r.avgElo ?? 0,
  }));
}

export async function getMilestonesFilterOptions(forceRefresh = false): Promise<MilestonesFilterOptions> {
  const now = Date.now();
  const fresh = (t: number) => now - t < MILESTONES_OPTIONS_TTL_MS;

  if (forceRefresh) {
    milestonesOptionsInMemory = null;
    try { localStorage.removeItem(MILESTONES_OPTIONS_CACHE_KEY); } catch {}
  }

  if (milestonesOptionsInMemory && fresh(milestonesOptionsInMemory.fetchedAt)) {
    return milestonesOptionsInMemory.data;
  }

  try {
    const ls = localStorage.getItem(MILESTONES_OPTIONS_CACHE_KEY);
    if (ls) {
      const parsed = JSON.parse(ls) as { data: MilestonesFilterOptions; fetchedAt: number };
      if (fresh(parsed.fetchedAt)) {
        milestonesOptionsInMemory = parsed;
        return parsed.data;
      }
    }
  } catch {
    // ignore
  }

  const res = await api.get<MilestonesFilterOptions>('/api/milestones/options');
  const data = res.data;

  milestonesOptionsInMemory = { data, fetchedAt: now };
  try {
    localStorage.setItem(MILESTONES_OPTIONS_CACHE_KEY, JSON.stringify(milestonesOptionsInMemory));
  } catch {
    // ignore storage quota errors
  }

  return data;
}
