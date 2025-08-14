import { api } from '@/lib/api';
import { ProjectCardStatsRow, CardStatsMode } from '@/types/projectcard';

// Cache configuration
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY_PLAYED = 'cards:played:v1';
const CACHE_KEY_OPTION = 'cards:option:v1';

// In-memory caches
let inMemoryCachePlayed: {
  data: ProjectCardStatsRow[];
  fetchedAt: number;
} | null = null;

let inMemoryCacheOption: {
  data: ProjectCardStatsRow[];
  fetchedAt: number;
} | null = null;

interface CacheEntry {
  data: ProjectCardStatsRow[];
  fetchedAt: number;
}

/**
 * Check if cache entry is still fresh
 */
function isCacheFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < TTL_MS;
}

/**
 * Get cache key for mode
 */
function getCacheKey(mode: CardStatsMode): string {
  return mode === 'played' ? CACHE_KEY_PLAYED : CACHE_KEY_OPTION;
}

/**
 * Get in-memory cache for mode
 */
function getInMemoryCache(mode: CardStatsMode) {
  return mode === 'played' ? inMemoryCachePlayed : inMemoryCacheOption;
}

/**
 * Set in-memory cache for mode
 */
function setInMemoryCache(mode: CardStatsMode, cache: { data: ProjectCardStatsRow[]; fetchedAt: number; } | null) {
  if (mode === 'played') {
    inMemoryCachePlayed = cache;
  } else {
    inMemoryCacheOption = cache;
  }
}

/**
 * Get data from localStorage cache
 */
function getFromLocalStorage(mode: CardStatsMode): CacheEntry | null {
  try {
    const cacheKey = getCacheKey(mode);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    
    const entry: CacheEntry = JSON.parse(cached);
    if (!isCacheFresh(entry.fetchedAt)) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return entry;
  } catch (error) {
    console.warn('Error reading from localStorage cache:', error);
    const cacheKey = getCacheKey(mode);
    localStorage.removeItem(cacheKey);
    return null;
  }
}

/**
 * Save data to localStorage cache
 */
function saveToLocalStorage(mode: CardStatsMode, data: ProjectCardStatsRow[]): void {
  try {
    const entry: CacheEntry = {
      data,
      fetchedAt: Date.now(),
    };
    const cacheKey = getCacheKey(mode);
    localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (error) {
    console.warn('Error saving to localStorage cache:', error);
  }
}

/**
 * Fetch fresh data from API
 */
async function fetchFromAPI(mode: CardStatsMode): Promise<ProjectCardStatsRow[]> {
  const endpoint = mode === 'played' ? '/api/cards/stats' : '/api/cards/option-stats';
  const response = await api.get<ProjectCardStatsRow[]>(endpoint);
  return response.data;
}

/**
 * Get all project card stats with caching
 */
export async function getAllProjectCardStatsCached(forceRefresh = false, mode: CardStatsMode = 'played'): Promise<ProjectCardStatsRow[]> {
  // If force refresh, clear caches and fetch fresh
  if (forceRefresh) {
    clearProjectCardStatsCache(mode);
  }
  
  // Check in-memory cache first
  const inMemoryCache = getInMemoryCache(mode);
  if (inMemoryCache && isCacheFresh(inMemoryCache.fetchedAt)) {
    return inMemoryCache.data;
  }
  
  // Check localStorage cache
  const localStorageEntry = getFromLocalStorage(mode);
  if (localStorageEntry) {
    // Update in-memory cache
    setInMemoryCache(mode, localStorageEntry);
    return localStorageEntry.data;
  }
  
  // Fetch fresh data from API
  try {
    const data = await fetchFromAPI(mode);
    
    // Update both caches
    const cacheEntry = {
      data,
      fetchedAt: Date.now(),
    };
    setInMemoryCache(mode, cacheEntry);
    saveToLocalStorage(mode, data);
    
    return data;
  } catch (error) {
    console.error(`Error fetching project card ${mode} stats:`, error);
    throw error;
  }
}

/**
 * Clear cache for specific mode
 */
export function clearProjectCardStatsCache(mode: CardStatsMode): void {
  setInMemoryCache(mode, null);
  const cacheKey = getCacheKey(mode);
  localStorage.removeItem(cacheKey);
}

/**
 * Clear all caches (backward compatibility)
 */
export function clearAllProjectCardStatsCache(): void {
  clearProjectCardStatsCache('played');
  clearProjectCardStatsCache('option');
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(mode: CardStatsMode = 'played'): {
  inMemory: boolean;
  localStorage: boolean;
  lastFetched?: Date;
} {
  const inMemoryCache = getInMemoryCache(mode);
  const localEntry = getFromLocalStorage(mode);
  
  return {
    inMemory: inMemoryCache !== null && isCacheFresh(inMemoryCache.fetchedAt),
    localStorage: localEntry !== null,
    lastFetched: inMemoryCache?.fetchedAt ? new Date(inMemoryCache.fetchedAt) : 
                 localEntry?.fetchedAt ? new Date(localEntry.fetchedAt) : undefined,
  };
}
