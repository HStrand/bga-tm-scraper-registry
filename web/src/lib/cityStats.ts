import { api } from '@/lib/api';

export interface TilePlacementStat {
  tileLocation: string;
  gameCount: number;
  avgEloChange: number;
}

export interface TilePlacementByGen {
  tileLocation: string;
  placedGen: number | null;
  gameCount: number;
  avgEloChange: number;
}

export type TileType = 'city' | 'greenery';

// Returns { [mapName]: TilePlacementStat[] }
export async function getAllTilePlacementStats(tileType: TileType): Promise<Record<string, TilePlacementStat[]>> {
  const res = await api.get<Record<string, TilePlacementStat[]>>(`/api/tile-stats/${tileType}/overview`);
  return res.data ?? {};
}

// Returns { [mapName]: TilePlacementByGen[] }
export async function getAllTilePlacementByGen(tileType: TileType): Promise<Record<string, TilePlacementByGen[]>> {
  const res = await api.get<Record<string, TilePlacementByGen[]>>(`/api/tile-stats/${tileType}/by-gen`);
  return res.data ?? {};
}
