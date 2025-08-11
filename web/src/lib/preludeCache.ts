import { api } from '@/lib/api';
import { PreludeStatsRow, PreludePlayerStatsRow } from '@/types/prelude';

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
