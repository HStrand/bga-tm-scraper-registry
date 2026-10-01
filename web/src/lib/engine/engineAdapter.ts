// Projects a tm-engine game into the replay view model, so the same components render it as a BGA replay.

import { ALL_MAPS } from '@/data/mapHexes';
import type {
  GameInfoVM, GameSnapshotVM, PlayerSnapshotVM, ResourceKey, SeatId, TileVM,
} from '@/lib/replay/viewModel';
import type { EngineResources, TableResponse } from './types';

/** Used when a game has no import metadata (it was not created from a BGA replay). */
const FALLBACK_COLORS = ['#ff0000', '#0000ff', '#008000', '#ffa500', '#773300'];

const RESOURCE_FIELDS: Record<ResourceKey, keyof EngineResources> = {
  mc: 'megaCredits', steel: 'steel', titanium: 'titanium', plants: 'plants', energy: 'energy', heat: 'heat',
};

function resources(set: EngineResources): Record<ResourceKey, number> {
  return Object.fromEntries(
    (Object.entries(RESOURCE_FIELDS) as [ResourceKey, keyof EngineResources][]).map(([key, field]) => [key, set[field]]),
  ) as Record<ResourceKey, number>;
}

/** Preludes are P01-P35; P36 and up are the Prelude expansion's project cards. */
function isPreludeId(cardId: string): boolean {
  const match = cardId.match(/^P(\d+)$/);
  return match != null && Number(match[1]) <= 35;
}

/** "NuclearZone" -> "Nuclear Zone": the engine's tile types are the tile names without spaces. */
function tileName(engineType: string): string {
  return engineType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export const seatId = (playerId: number): SeatId => String(playerId);

export function engineGameInfo(table: TableResponse): GameInfoVM {
  const { state, meta, cardNames } = table;
  return {
    source: {
      kind: 'engine',
      gameId: state.gameId,
      forkedFrom: meta?.source.tableId ? { tableId: meta.source.tableId, moveIndex: meta.source.moveIndex } : undefined,
    },
    mapName: state.map,
    options: { prelude: state.preludeExpansion, corporateEra: state.corporateEra, draft: state.draftVariant, colonies: false },
    players: state.players.map(player => {
      const seat = meta?.seats.find(s => s.seat === player.playerId);
      return {
        id: seatId(player.playerId),
        name: seat?.name ?? `Player ${player.playerId + 1}`,
        color: seat?.color ?? FALLBACK_COLORS[player.playerId % FALLBACK_COLORS.length],
        corporation: cardNames[player.corporationId] ?? null,
      };
    }),
  };
}

export function engineSnapshot(table: TableResponse): GameSnapshotVM {
  const { state, cardNames } = table;
  const name = (cardId: string) => cardNames[cardId] ?? cardId;

  const players: Record<SeatId, PlayerSnapshotVM> = {};
  for (const player of state.players) {
    const status = table.players.find(p => p.playerId === player.playerId);
    // Empty until the opening choices have been made.
    const corporation = cardNames[player.corporationId];
    const hand = player.hand.map(name);
    players[seatId(player.playerId)] = {
      statsKnown: true,
      tr: player.terraformRating,
      resources: resources(player.resources),
      production: resources(player.production),
      tags: status?.tags ?? {
        building: 0, space: 0, science: 0, power: 0, earth: 0, jovian: 0,
        city: 0, plant: 0, microbe: 0, animal: 0, wild: 0, event: 0,
      },
      tileCounts: {
        cities: status?.tiles.cities ?? 0,
        greeneries: status?.tiles.greeneries ?? 0,
        total: status ? status.tiles.cities + status.tiles.greeneries + status.tiles.specialTiles : 0,
      },
      vp: status ? {
        total: status.points.total,
        breakdown: {
          tr: status.points.tr,
          milestones: status.points.milestones,
          awards: status.points.awards,
          greeneries: status.points.greeneries,
          cities: status.points.cities,
          cards: status.points.vp,
        },
      } : null,
      hand,
      handCount: hand.length,
      headquarters: [...(corporation ? [corporation] : []), ...player.playedCards.filter(isPreludeId).map(name)],
      played: [...player.playedCards.filter(id => !isPreludeId(id)), ...player.playedEvents].map(name),
      sold: [],
      cardResources: Object.fromEntries(Object.entries(player.cardResources).map(([id, count]) => [name(id), count])),
      usedActions: player.usedCardActions.map(name),
      passed: player.passed,
    };
  }

  return {
    index: state.moveNumber,
    generation: state.generation,
    phase: state.phase,
    globals: { temperature: state.temperature, oxygen: state.oxygen, oceans: state.oceansPlaced },
    firstPlayerId: seatId(state.firstPlayerId),
    activePlayerId: seatId(state.activePlayerId),
    players,
    tiles: engineTiles(table),
    milestones: state.claimedMilestones.map(m => ({ name: m.milestoneName, playerId: seatId(m.playerId), generation: null })),
    awards: state.fundedAwards.map(a => ({ name: a.awardName, playerId: seatId(a.playerId), generation: null })),
    piles: { draw: table.drawPileCount, discard: table.discardPileCount },
  };
}

/** The board key of a hex: the replay components key tiles by the map definition's hex names. */
export function hexKeyAt(mapName: string, col: number, row: number): string {
  const hex = ALL_MAPS.find(m => m.dbName === mapName)?.hexes.find(h => h.col === col && h.row === row);
  return hex?.dbKey ?? `Hex ${col},${row}`;
}

function engineTiles({ state }: TableResponse): TileVM[] {
  // The tile just placed is highlighted the way the replay highlights the current move's tile.
  const placed = state.lastMove && 'location' in state.lastMove ? state.lastMove.location : null;

  const onBoard = Object.values(state.placedTiles).map((tile): TileVM => {
    const { col, row } = tile.location;
    return {
      hexKey: hexKeyAt(state.map, col, row),
      col,
      row,
      type: tileName(tile.type),
      placedBy: tile.ownerId != null ? seatId(tile.ownerId) : null,
      placedAt: placed?.col === col && placed?.row === row ? state.moveNumber : -1,
      generation: null,
    };
  });

  const offBoard = state.offMapTiles.map((tile): TileVM => ({
    hexKey: tile.name,
    col: null,
    row: null,
    type: tileName(tile.type),
    placedBy: seatId(tile.ownerId),
    placedAt: -1,
    generation: null,
  }));

  const occupied = new Set(onBoard.map(t => t.hexKey));
  const claims = Object.entries(state.claimedHexes)
    .map(([key, owner]): TileVM => {
      const [col, row] = key.split(',').map(Number);
      return {
        hexKey: hexKeyAt(state.map, col, row), col, row,
        type: 'Land Claim', placedBy: seatId(owner), placedAt: -1, generation: null,
      };
    })
    .filter(claim => !occupied.has(claim.hexKey));

  return [...onBoard, ...offBoard, ...claims];
}
