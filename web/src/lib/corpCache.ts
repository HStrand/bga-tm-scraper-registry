import axios from 'axios';
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
  const response = await axios.get<AllCorporationPlayerStatsRow[]>('/api/corporations/playerstats');
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
