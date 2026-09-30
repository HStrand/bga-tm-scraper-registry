import axios, { isAxiosError } from 'axios';
import type {
  EngineMove, ForkPointsResponse, HistoryEntry, ImportIssue, ImportResponse, TableResponse,
} from './types';

// The engine is a separate Functions app from the stats API. In development Vite proxies /engine-api to it
// (see vite.config.ts); in production set VITE_ENGINE_API_BASE to its /api root.
const ENGINE_BASE = ((import.meta.env.VITE_ENGINE_API_BASE as string | undefined) ?? '/engine-api').replace(/\/$/, '');
const ENGINE_KEY = import.meta.env.VITE_ENGINE_FUNCTIONS_KEY as string | undefined;

const http = axios.create({
  baseURL: ENGINE_BASE,
  headers: ENGINE_KEY ? { 'x-functions-key': ENGINE_KEY } : undefined,
});

/** A request the engine answered with a refusal: an illegal move, or a position that cannot be imported. */
export class EngineError extends Error {
  constructor(message: string, readonly status: number | null, readonly issues: ImportIssue[] = []) {
    super(message);
    this.name = 'EngineError';
  }
}

async function call<T>(request: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await request()).data;
  } catch (e) {
    if (isAxiosError(e)) {
      const body = e.response?.data as { error?: string; issues?: ImportIssue[] } | undefined;
      const issues = body?.issues ?? [];
      const blocking = issues.filter(i => i.severity === 'Blocking').map(i => i.message);
      const message = body?.error ?? (blocking.length ? blocking.join(' ') : null)
        // A 5xx with no message is the engine (or the proxy in front of it) being down, not a refused move.
        ?? (!e.response || e.response.status >= 500
          ? 'The game engine could not be reached. Nothing was changed; try again once it is running.'
          : `The game engine returned ${e.response.status}.`);
      throw new EngineError(message, e.response?.status ?? null, issues);
    }
    throw e;
  }
}

export const engineApi = {
  /** Whether a scraped game can be played on from, and after which moves. */
  forkPoints: (tableId: string) =>
    call<ForkPointsResponse>(() => http.get(`/import/bga/${encodeURIComponent(tableId)}/fork-points`)),

  /** Create a game from a position in a scraped game. The move index snaps back to the nearest fork point. */
  importBga: (tableId: string, moveIndex: number, seed?: number) =>
    call<ImportResponse>(() => http.post('/games/import/bga', { tableId, moveIndex, seed })),

  /** The table as it stands, or as it stood after move `at`. */
  table: (gameId: string, at?: number) =>
    call<TableResponse>(() => http.get(`/games/${encodeURIComponent(gameId)}/table`, { params: at == null ? undefined : { at } })),

  submitMove: (gameId: string, move: EngineMove) =>
    call<TableResponse>(() => http.post(`/games/${encodeURIComponent(gameId)}/table/moves`, move)),

  /** The moves played so far, with the names of all cards (moves name cards that have since left play). */
  history: (gameId: string) =>
    call<{ moves: HistoryEntry[]; cardNames: Record<string, string> }>(
      () => http.get(`/games/${encodeURIComponent(gameId)}/history`)),
};

export type EngineApi = typeof engineApi;
