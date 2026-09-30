// Projects a scraped BGA game log into the replay view model.

import { assignPlayerColors, extractTilePlacement } from '@/lib/gameLog';
import { parseMilestonesAndAwards, type ClaimFundInfo } from '@/lib/replayUtils';
import type { GameLog } from '@/types/gamelog';
import {
  emptyPlayerStats,
  type ClaimVM, type GameInfoVM, type GameSnapshotVM, type GameTimeline, type LogEntryVM,
  type PlayerSnapshotVM, type PlayerStatsVM, type ResourceKey, type SeatId, type TagKey, type TileVM,
} from '../viewModel';
import {
  collectPlayerPreludeNames, computeGenerationBoundaries, countPlayerTiles, foldActivatedCards,
  foldDiscardPile, foldPlacedTiles, foldPlayerTableaux,
} from './folds';

const RESOURCE_TRACKERS: Record<ResourceKey, string> = {
  mc: 'M€', steel: 'Steel', titanium: 'Titanium', plants: 'Plant', energy: 'Energy', heat: 'Heat',
};

// Tracker names differ between scraper versions: older logs have "Space tag", newer "Count of Space tags".
const TAG_TRACKERS: Record<TagKey, [string, string]> = {
  building: ['Building tag', 'Count of Building tags'],
  space: ['Space tag', 'Count of Space tags'],
  science: ['Science tag', 'Count of Science tags'],
  power: ['Energy tag', 'Count of Power tags'],
  earth: ['Earth tag', 'Count of Earth tags'],
  jovian: ['Jovian tag', 'Count of Jovian tags'],
  city: ['City tag', 'Count of City tags'],
  plant: ['Plant tag', 'Count of Plant tags'],
  microbe: ['Microbe tag', 'Count of Microbe tags'],
  animal: ['Animal tag', 'Count of Animal tags'],
  wild: ['Wild tag', 'Count of Wild tags'],
  event: ['Event tag', 'Count of played Events cards'],
};

/** A player's BGA tracker values as view-model stats. */
export function bgaPlayerStats(trackers: Record<string, number>): PlayerStatsVM {
  const stats = emptyPlayerStats();
  for (const [key, tracker] of Object.entries(RESOURCE_TRACKERS) as [ResourceKey, string][]) {
    stats.resources[key] = trackers[tracker] ?? 0;
    stats.production[key] = trackers[`${tracker} Production`] ?? 0;
  }
  for (const [key, [name, altName]] of Object.entries(TAG_TRACKERS) as [TagKey, [string, string]][]) {
    stats.tags[key] = trackers[name] ?? trackers[altName] ?? 0;
  }
  return stats;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * starting_player is a player id in most logs but a player name in some parses, occasionally spelled
 * differently from the players list.
 */
export function resolveBgaPlayerRef(gameLog: GameLog, ref: string | null | undefined): SeatId | undefined {
  if (!ref) return undefined;
  if (gameLog.players[ref]) return ref;
  const players = Object.entries(gameLog.players);
  const wanted = ref.toLowerCase();
  const byName = players.find(([, p]) => p.player_name === ref)
    ?? players.find(([, p]) => p.player_name.toLowerCase() === wanted);
  if (byName) return byName[0];
  const close = players.filter(([, p]) => editDistance(p.player_name.toLowerCase(), wanted) <= 2);
  return close.length === 1 ? close[0][0] : undefined;
}

function buildInfo(gameLog: GameLog): GameInfoVM {
  const ids = Object.keys(gameLog.players);
  const colors = assignPlayerColors(ids, gameLog.players);
  return {
    source: { kind: 'bga', tableId: gameLog.replay_id, perspective: gameLog.player_perspective },
    mapName: gameLog.map,
    options: {
      prelude: gameLog.prelude_on ?? null,
      corporateEra: gameLog.corporate_era_on ?? null,
      draft: gameLog.draft_on ?? null,
      colonies: gameLog.colonies_on ?? null,
    },
    players: ids.map(id => {
      const p = gameLog.players[id];
      // Rating before the game: BGA reports the rating after it and the change.
      const rank = p.elo_data?.game_rank;
      const change = p.elo_data?.game_rank_change ?? 0;
      return {
        id,
        name: p.player_name,
        color: colors[id],
        corporation: p.corporation ?? null,
        elo: rank != null ? rank - change : null,
      };
    }),
  };
}

function buildLog(gameLog: GameLog): LogEntryVM[] {
  return gameLog.moves.map((move, index) => {
    const placement = extractTilePlacement(move);
    return {
      index,
      moveNumber: move.move_number,
      playerId: gameLog.players[move.player_id] ? move.player_id : null,
      playerName: move.player_name,
      actionType: move.action_type,
      description: move.description,
      cardPlayed: move.card_played ?? undefined,
      tile: placement ? { type: placement.tileType, hexKey: placement.dbKey } : undefined,
      generation: move.game_state?.generation ?? null,
      hidden: move.action_type === 'game_state_change' ? true : undefined,
    };
  });
}

function toClaims(claims: Map<string, ClaimFundInfo>): ClaimVM[] {
  return Array.from(claims.entries()).map(([name, info]) => ({
    name,
    playerId: info.playerId,
    generation: info.generation,
  }));
}

export function buildBgaTimeline(gameLog: GameLog): GameTimeline {
  const info = buildInfo(gameLog);
  const generationBoundaries = computeGenerationBoundaries(gameLog);
  const playerPreludeNames = collectPlayerPreludeNames(gameLog);

  const buildSnapshot = (index: number): GameSnapshotVM => {
    const state = gameLog.moves[index]?.game_state;
    const placedTiles = foldPlacedTiles(gameLog, index);
    const tileCounts = countPlayerTiles(placedTiles);
    const tableaux = foldPlayerTableaux(gameLog, index, playerPreludeNames);
    const activated = foldActivatedCards(gameLog, index, generationBoundaries);
    const { claimedMilestones, fundedAwards } = parseMilestonesAndAwards(gameLog.moves, index);

    const players: Record<SeatId, PlayerSnapshotVM> = {};
    for (const { id } of info.players) {
      const trackers = state?.player_trackers?.[id];
      const vp = state?.player_vp?.[id];
      const details = vp?.total_details;
      const tableau = tableaux.get(id);
      const hand = tableau?.hand ?? [];
      players[id] = {
        statsKnown: !!trackers,
        ...(trackers ? bgaPlayerStats(trackers) : emptyPlayerStats()),
        // TR is not among the trackers; the scoring breakdown carries it.
        tr: details?.tr ?? null,
        tileCounts: tileCounts[id] ?? { cities: 0, greeneries: 0, total: 0 },
        vp: vp ? {
          total: vp.total ?? null,
          breakdown: details ? {
            tr: details.tr ?? null,
            milestones: details.milestones ?? null,
            awards: details.awards ?? null,
            greeneries: details.greeneries ?? null,
            cities: details.cities ?? null,
            cards: details.cards ?? null,
          } : null,
        } : null,
        hand,
        handCount: hand.length,
        headquarters: tableau?.headquarters ?? [],
        played: tableau?.played ?? [],
        sold: tableau?.sold ?? [],
        cardResources: tableau?.cardResources ?? {},
        usedActions: Array.from(activated.get(id) ?? []),
      };
    }

    const tiles: TileVM[] = Array.from(placedTiles.values()).map(tile => {
      const coords = tile.dbKey.match(/(\d+),(\d+)/);
      return {
        hexKey: tile.dbKey,
        col: coords ? parseInt(coords[1], 10) : null,
        row: coords ? parseInt(coords[2], 10) : null,
        type: tile.tileType,
        placedBy: tile.playerId,
        placedAt: tile.moveIndex,
        generation: gameLog.moves[tile.moveIndex]?.game_state?.generation ?? null,
      };
    });

    return {
      index,
      generation: state?.generation ?? null,
      globals: state ? { temperature: state.temperature, oxygen: state.oxygen, oceans: state.oceans } : null,
      firstPlayerId: resolveBgaPlayerRef(gameLog, state?.starting_player),
      players,
      tiles,
      milestones: toClaims(claimedMilestones),
      awards: toClaims(fundedAwards),
      piles: {
        draw: state?.draw_pile ?? null,
        discard: state?.discard_pile ?? null,
        discardCards: foldDiscardPile(gameLog, index),
      },
    };
  };

  let last: GameSnapshotVM | null = null;

  return {
    info,
    length: gameLog.moves.length,
    log: buildLog(gameLog),
    generationBoundaries,
    snapshotAt(index) {
      if (last?.index !== index) last = buildSnapshot(index);
      return last;
    },
  };
}
