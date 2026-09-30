import fs from 'node:fs';
import path from 'node:path';
import { EngineError, type EngineApi } from '@/lib/engine/client';
import type { EngineMove, ForkPointsResponse, ImportResponse, TableResponse } from '@/lib/engine/types';

// Real responses from the engine, written by tm-engine's HotSeatSession_PlaysThroughTheEndpoints test
// (run it with TM_CONTRACT_FIXTURE_DIR pointing here to refresh them). They pin the JSON contract.
const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/engine');

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf-8')) as T;

export interface Exchange {
  /** The move sent; absent for the first entry, which is the table as imported. */
  move?: EngineMove;
  table: TableResponse;
}

/**
 * A hot-seat session on the Elysium game imported at the start of generation 4: the opening table and
 * then sixty moves with the table each produced.
 */
export const session = read<Exchange[]>('hot-seat-session.json');

export const forkPointsFixture = read<ForkPointsResponse>('fork-points.json');
export const importFixture = read<ImportResponse>('import.json');

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).sort(([a], [b]) => a.localeCompare(b)))
    : v);

export const sameMove = (a: EngineMove, b: EngineMove) => canonical(a) === canonical(b);

/**
 * An engine that replays the recorded session: it accepts exactly the move that was recorded next and
 * answers with the recorded table, and refuses anything else the way the engine refuses an illegal move.
 */
export function recordedEngine(): EngineApi & { position: () => number } {
  let position = 0;
  return {
    position: () => position,
    forkPoints: async () => forkPointsFixture,
    importBga: async () => importFixture,
    // Like the engine, a past position comes without legal moves and reports the game's latest move number.
    table: async (_gameId, at) => at == null || at === position
      ? session[position].table
      : { ...session[at].table, legalMoves: {}, latestMoveNumber: session[position].table.state.moveNumber },
    history: async () => ({ moves: [], cardNames: {} }),
    submitMove: async (_gameId, move) => {
      const next = session[position + 1];
      if (!next?.move || !sameMove(next.move, move)) {
        throw new EngineError(`Expected ${JSON.stringify(next?.move)} but got ${JSON.stringify(move)}`, 400);
      }
      position++;
      return next.table;
    },
  };
}
