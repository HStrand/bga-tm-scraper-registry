import { api } from '@/lib/api';

export interface CityPlacementStat {
  cityLocation: string;
  gameCount: number;
  avgEloChange: number;
}

export interface CityPlacementByGen {
  cityLocation: string;
  placedGen: number | null;
  gameCount: number;
  avgEloChange: number;
}

export async function getCityPlacementStats(mapName: string): Promise<CityPlacementStat[]> {
  const res = await api.get<CityPlacementStat[]>(`/api/maps/${encodeURIComponent(mapName)}/city-stats`);
  return res.data ?? [];
}

export async function getCityPlacementByGen(mapName: string): Promise<CityPlacementByGen[]> {
  const res = await api.get<CityPlacementByGen[]>(`/api/maps/${encodeURIComponent(mapName)}/city-stats/by-gen`);
  return res.data ?? [];
}
