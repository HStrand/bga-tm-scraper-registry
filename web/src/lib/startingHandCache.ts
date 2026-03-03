import { api } from '@/lib/api';
import { StartingHandStatsRow } from '@/types/startinghand';

// Cache configuration
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY = 'startinghands:v1';

// In-memory cache
let inMemoryCache: {
  data: StartingHandStatsRow[];
  fetchedAt: number;
} | null = null;

interface CacheEntry {
  data: StartingHandStatsRow[];
  fetchedAt: number;
}

function isCacheFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < TTL_MS;
}

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

function saveToLocalStorage(data: StartingHandStatsRow[]): void {
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

async function fetchFromAPI(): Promise<StartingHandStatsRow[]> {
  const response = await api.get<StartingHandStatsRow[]>('/api/startinghands/stats');
  return response.data;
}

export async function getStartingHandStatsCached(forceRefresh = false): Promise<StartingHandStatsRow[]> {
  if (forceRefresh) {
    clearStartingHandStatsCache();
  }

  // Check in-memory cache first
  if (inMemoryCache && isCacheFresh(inMemoryCache.fetchedAt)) {
    return inMemoryCache.data;
  }

  // Check localStorage cache
  const localStorageEntry = getFromLocalStorage();
  if (localStorageEntry) {
    inMemoryCache = localStorageEntry;
    return localStorageEntry.data;
  }

  // Fetch fresh data from API
  try {
    const data = await fetchFromAPI();

    const cacheEntry = {
      data,
      fetchedAt: Date.now(),
    };
    inMemoryCache = cacheEntry;
    saveToLocalStorage(data);

    return data;
  } catch (error) {
    console.error('Error fetching starting hand stats:', error);
    throw error;
  }
}

export function clearStartingHandStatsCache(): void {
  inMemoryCache = null;
  localStorage.removeItem(CACHE_KEY);
}
