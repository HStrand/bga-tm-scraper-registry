import { api } from '@/lib/api';
import { CombinationBaselines, CombinationComboRow, ComboType } from '@/types/combination';

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const BASELINES_CACHE_KEY = 'combo-baselines:v1';
const COMBO_CACHE_KEY_PREFIX = 'combo-data:v1:';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

function isCacheFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < TTL_MS;
}

// --- In-memory caches ---
let baselinesMemCache: CacheEntry<CombinationBaselines> | null = null;
const combosMemCache: Partial<Record<ComboType, CacheEntry<CombinationComboRow[]>>> = {};

// --- localStorage helpers ---

function getFromLocalStorage<T>(key: string): CacheEntry<T> | null {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const entry: CacheEntry<T> = JSON.parse(cached);
    if (!isCacheFresh(entry.fetchedAt)) {
      localStorage.removeItem(key);
      return null;
    }
    return entry;
  } catch (error) {
    console.warn('Error reading from localStorage cache:', error);
    localStorage.removeItem(key);
    return null;
  }
}

function saveToLocalStorage<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn('Error saving to localStorage cache:', error);
  }
}

// --- Baselines ---

export async function getCombinationBaselinesCached(forceRefresh = false): Promise<CombinationBaselines> {
  if (forceRefresh) {
    baselinesMemCache = null;
    localStorage.removeItem(BASELINES_CACHE_KEY);
  }

  if (baselinesMemCache && isCacheFresh(baselinesMemCache.fetchedAt)) {
    return baselinesMemCache.data;
  }

  const localEntry = getFromLocalStorage<CombinationBaselines>(BASELINES_CACHE_KEY);
  if (localEntry) {
    baselinesMemCache = localEntry;
    return localEntry.data;
  }

  const response = await api.get<CombinationBaselines>('/api/combinations/baselines');
  const data = response.data;

  baselinesMemCache = { data, fetchedAt: Date.now() };
  saveToLocalStorage(BASELINES_CACHE_KEY, data);

  return data;
}

// --- Combos ---

export async function getCombinationCombosCached(type: ComboType, forceRefresh = false): Promise<CombinationComboRow[]> {
  const lsKey = COMBO_CACHE_KEY_PREFIX + type;

  if (forceRefresh) {
    delete combosMemCache[type];
    localStorage.removeItem(lsKey);
  }

  const memEntry = combosMemCache[type];
  if (memEntry && isCacheFresh(memEntry.fetchedAt)) {
    return memEntry.data;
  }

  const localEntry = getFromLocalStorage<CombinationComboRow[]>(lsKey);
  if (localEntry) {
    combosMemCache[type] = localEntry;
    return localEntry.data;
  }

  const response = await api.get<CombinationComboRow[]>(`/api/combinations/combos/${type}`);
  const data = response.data;

  combosMemCache[type] = { data, fetchedAt: Date.now() };
  saveToLocalStorage(lsKey, data);

  return data;
}

export function clearCombinationCaches(): void {
  baselinesMemCache = null;
  localStorage.removeItem(BASELINES_CACHE_KEY);
  for (const type of ['corp-prelude', 'corp-card', 'prelude-prelude', 'prelude-card', 'card-card'] as ComboType[]) {
    delete combosMemCache[type];
    localStorage.removeItem(COMBO_CACHE_KEY_PREFIX + type);
  }
}
