import type { GameLogMove } from '@/types/gamelog';
import type { MilestoneAwardOverlay, AwardOverlay, StatRef } from '@/data/mapOverlays';
import type { GameSnapshotVM, PlayerSnapshotVM } from '@/lib/replay/viewModel';

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
    if (move.action_type === 'claim_milestone' || move.description.match(/claims milestone /i)) {
      const match = move.description.match(/claims milestone (.+?)(?:\s*\||\s*$)/i);
      if (match) claimed.set(match[1].trim().toUpperCase(), { playerId: move.player_id, playerName: move.player_name, generation: gen });
    }
    if (move.action_type === 'fund_award' || move.description.match(/funds .+? award/i)) {
      const match = move.description.match(/funds (.+?) award/i);
      if (match) funded.set(match[1].trim().toLowerCase(), { playerId: move.player_id, playerName: move.player_name, generation: gen });
    }
  }
  return { claimedMilestones: claimed, fundedAwards: funded };
}

export interface StandingsContext {
  /** Players in display order. */
  players: { id: string; name: string }[];
  snapshot: GameSnapshotVM;
  /** hexKey -> [col, row] for all hexes on the map */
  hexCoords?: Map<string, [number, number]>;
}

function statValue(player: PlayerSnapshotVM, stat: StatRef): number {
  if ('resource' in stat) return player.resources[stat.resource];
  if ('production' in stat) return player.production[stat.production];
  return player.tags[stat.tag];
}

export function computeStandings(
  item: MilestoneAwardOverlay | AwardOverlay,
  ctx: StandingsContext,
): { name: string; score: number }[] {
  // Rank the players the source has stats for; without any, those who own tiles.
  const withStats = ctx.players.filter(p => ctx.snapshot.players[p.id]?.statsKnown);
  const ranked = withStats.length > 0
    ? withStats
    : ctx.players.filter(p => (ctx.snapshot.players[p.id]?.tileCounts.total ?? 0) > 0);
  const scores: { name: string; score: number }[] = [];
  for (const { id, name } of ranked) {
    const player = ctx.snapshot.players[id];
    let score = 0;
    if (item.customScorer) {
      score = item.customScorer({
        player,
        playerId: id,
        tiles: ctx.snapshot.tiles,
        hexCoords: ctx.hexCoords,
      });
    } else if (item.useTR) {
      score = player.tr ?? 0;
    } else if (item.useTileCounts) {
      score = player.tileCounts[item.useTileCounts];
    } else if (item.useHandCount) {
      score = player.hand?.length ?? player.handCount ?? 0;
    } else if (item.stats) {
      score = item.stats.reduce((sum, stat) => sum + statValue(player, stat), 0);
    }
    // Add wild tags to score when applicable
    if (item.includeWildTags) {
      score += player.tags.wild;
    }
    scores.push({ name, score });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores;
}
