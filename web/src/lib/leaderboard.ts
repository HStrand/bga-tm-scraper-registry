import { api } from './api';
import type {
  PlayerScore,
  PlayerGreeneryStats,
  PlayerParameterStats,
  PlayerMilestoneStats,
  PlayerAwardStats
} from '@/types/leaderboard';

// API functions for leaderboard data
export async function getPlayerScores(): Promise<PlayerScore[]> {
  const response = await api.get('/api/GetPlayerScores');
  return response.data;
}

export async function getPlayerGreeneryStats(): Promise<PlayerGreeneryStats[]> {
  const response = await api.get('/api/GetPlayerGreeneryStats');
  return response.data;
}

export async function getPlayerParameterStats(): Promise<PlayerParameterStats[]> {
  const response = await api.get('/api/GetPlayerParameterStats');
  return response.data;
}

export async function getPlayerMilestoneStats(): Promise<PlayerMilestoneStats[]> {
  const response = await api.get('/api/GetPlayerMilestoneStats');
  return response.data;
}

export async function getPlayerAwardStats(): Promise<PlayerAwardStats[]> {
  const response = await api.get('/api/GetPlayerAwardStats');
  return response.data;
}

// Helper functions for data processing
export function getTopScores(scores: PlayerScore[], limit: number = 100): PlayerScore[] {
  return [...scores]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);
}

export function getTopGreeneries(stats: PlayerGreeneryStats[], limit: number = 25): PlayerGreeneryStats[] {
  return [...stats]
    .sort((a, b) => b.greeneriesPerGame - a.greeneriesPerGame)
    .slice(0, limit);
}

export function getTopParameters(stats: PlayerParameterStats[], limit: number = 25): PlayerParameterStats[] {
  return [...stats]
    .sort((a, b) => b.parameterIncreasesPerGame - a.parameterIncreasesPerGame)
    .slice(0, limit);
}

export function getTopMilestones(
  stats: PlayerMilestoneStats[], 
  milestoneType: 'terraformer' | 'gardener' | 'builder' | 'mayor' | 'planner',
  limit: number = 25
): PlayerMilestoneStats[] {
  const rateField = `${milestoneType}Rate` as keyof PlayerMilestoneStats;
  return [...stats]
    .sort((a, b) => (b[rateField] as number) - (a[rateField] as number))
    .slice(0, limit);
}

export function getTopAwards(
  stats: PlayerAwardStats[], 
  awardType: 'thermalist' | 'banker' | 'scientist' | 'miner' | 'landlord' | 'total',
  limit: number = 25
): PlayerAwardStats[] {
  const rateField = awardType === 'total' ? 'totalAwardRate' : `${awardType}Rate` as keyof PlayerAwardStats;
  return [...stats]
    .sort((a, b) => (b[rateField] as number) - (a[rateField] as number))
    .slice(0, limit);
}
