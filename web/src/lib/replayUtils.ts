import type { GameLogMove, GameState } from '@/types/gamelog';
import type { MilestoneAwardOverlay, AwardOverlay } from '@/data/mapOverlays';

export interface ClaimFundInfo {
  playerId: string;
  playerName: string;
  generation: number;
}

export function parseMilestonesAndAwards(
  moves: GameLogMove[],
  currentStep: number,
): { claimedMilestones: Map<string, ClaimFundInfo>; fundedAwards: Map<string, ClaimFundInfo> } {
  const claimed = new Map<string, ClaimFundInfo>();
  const funded = new Map<string, ClaimFundInfo>();
  for (let i = 0; i <= currentStep; i++) {
    const move = moves[i];
    const gen = move.game_state?.generation ?? 0;
    if (move.action_type === 'claim_milestone') {
      const match = move.description.match(/claims milestone (.+?)(?:\s*\||\s*$)/i);
      if (match) claimed.set(match[1].trim().toUpperCase(), { playerId: move.player_id, playerName: move.player_name, generation: gen });
    } else if (move.action_type === 'fund_award') {
      const match = move.description.match(/funds (.+?) award/i);
      if (match) funded.set(match[1].trim().toLowerCase(), { playerId: move.player_id, playerName: move.player_name, generation: gen });
    }
  }
  return { claimedMilestones: claimed, fundedAwards: funded };
}

export interface StandingsContext {
  playerNames: Record<string, string>;
  playerTrackers?: Record<string, Record<string, number>>;
  playerTileCounts?: Record<string, { cities: number; greeneries: number; total: number }>;
  playerHandCounts?: Record<string, number>;
  gameState?: GameState;
}

export function computeStandings(
  item: MilestoneAwardOverlay | AwardOverlay,
  ctx: StandingsContext,
): { name: string; score: number }[] {
  const pids = Object.keys(ctx.playerTrackers ?? ctx.playerTileCounts ?? {});
  const scores: { name: string; score: number }[] = [];
  for (const pid of pids) {
    const name = ctx.playerNames[pid] ?? pid;
    let score = 0;
    if (item.customScorer && ctx.playerTrackers?.[pid]) {
      score = item.customScorer(ctx.playerTrackers[pid], ctx.playerTileCounts?.[pid]);
    } else if (item.useTR && ctx.gameState?.player_vp) {
      score = ctx.gameState.player_vp[pid]?.total_details?.tr ?? 0;
    } else if (item.useTileCounts && ctx.playerTileCounts?.[pid]) {
      score = ctx.playerTileCounts[pid][item.useTileCounts];
    } else if (item.useHandCount && ctx.playerHandCounts) {
      score = ctx.playerHandCounts[pid] ?? 0;
    } else if (item.trackerKeys && item.trackerKeys.length > 0 && ctx.playerTrackers?.[pid]) {
      const t = ctx.playerTrackers[pid];
      const isAward = 'metric' in item && !('threshold' in item && item.threshold != null);
      if (item.altKeys) {
        score = Math.max(...item.trackerKeys.map(k => t[k] ?? 0));
      } else {
        score = item.trackerKeys.reduce((sum, k) => sum + (t[k] ?? 0), 0);
      }
    }
    scores.push({ name, score });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores;
}
