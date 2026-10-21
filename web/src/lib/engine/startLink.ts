import type { GameMeta } from './types';

/** Where a game started: a position in a BGA replay, and the seed that shuffled the cards nobody had seen. */
export interface StartingPosition {
  tableId: string;
  moveIndex: number;
  seed: number;
}

/**
 * The address of a starting position. It is what the play page shows while playing and what to pass on:
 * everyone who opens it gets a game of their own from this position with the same cards, while the game
 * played in this browser is remembered here and resumed. A game's own address (/play/:gameId) is the game
 * itself, moves and all, and is no longer handed out.
 */
export function startLinkPath({ tableId, moveIndex, seed }: StartingPosition): string {
  return `/play?${new URLSearchParams({ table: tableId, move: String(moveIndex), seed: String(seed) })}`;
}

/** A seed for the cards nobody had seen; the engine accepts any 32-bit integer. */
export function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

const storageKey = ({ tableId, moveIndex, seed }: StartingPosition) => `tfm.play.${tableId}.${moveIndex}.${seed}`;

/** The game this browser is playing from the position, if it has one. Browser storage can be unavailable. */
export function rememberedGameId(start: StartingPosition): string | null {
  try {
    return localStorage.getItem(storageKey(start));
  } catch {
    return null;
  }
}

export function rememberGameId(start: StartingPosition, gameId: string): void {
  try {
    localStorage.setItem(storageKey(start), gameId);
  } catch {
    // Without storage the game is simply dealt again on the next visit.
  }
}

export function forgetGameId(start: StartingPosition): void {
  try {
    localStorage.removeItem(storageKey(start));
  } catch {
    // Nothing was remembered.
  }
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
