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

function statsPath(mapName: string, tileType: TileType): string {
  const slug = tileType === 'city' ? 'city-stats' : 'greenery-stats';
  return `/api/maps/${encodeURIComponent(mapName)}/${slug}`;
}

export async function getTilePlacementStats(mapName: string, tileType: TileType): Promise<TilePlacementStat[]> {
  const res = await api.get<TilePlacementStat[]>(statsPath(mapName, tileType));
  return res.data ?? [];
}

export async function getTilePlacementByGen(mapName: string, tileType: TileType): Promise<TilePlacementByGen[]> {
  const res = await api.get<TilePlacementByGen[]>(`${statsPath(mapName, tileType)}/by-gen`);
  return res.data ?? [];
}
