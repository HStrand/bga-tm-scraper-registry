import type { GameMeta } from './types';

/** Where a game started: a position in a BGA replay, and the seed that shuffled the cards nobody had seen. */
export interface StartingPosition {
  tableId: string;
  moveIndex: number;
  seed: number;
}

/**
 * The path that deals a fresh game from a starting position. A game's own address (/play/:gameId) is the
 * game itself, moves and all; this is what to pass on for others to play the same position from scratch.
 */
export function startLinkPath({ tableId, moveIndex, seed }: StartingPosition): string {
  return `/play/new?${new URLSearchParams({ table: tableId, move: String(moveIndex), seed: String(seed) })}`;
}

/** The starting position of an imported game, or null for a game that did not come from a replay. */
export function startingPosition(meta: GameMeta | null | undefined): StartingPosition | null {
  return meta?.source.tableId
    ? { tableId: meta.source.tableId, moveIndex: meta.source.moveIndex, seed: meta.shuffleSeed }
    : null;
}

/** Reads a starting position back out of a link's query string; null when it is not a complete one. */
export function parseStartLink(search: string): StartingPosition | null {
  const params = new URLSearchParams(search);
  const tableId = params.get('table');
  const moveIndex = Number(params.get('move'));
  const seed = Number(params.get('seed'));
  if (!tableId || !params.get('move') || !params.get('seed') || !Number.isInteger(moveIndex) || moveIndex < 0 || !Number.isInteger(seed)) {
    return null;
  }
  return { tableId, moveIndex, seed };
}
