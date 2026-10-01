import { useCallback, useEffect, useRef, useState } from 'react';
import { engineApi, EngineError, type EngineApi } from './client';
import type { HistoryEntry, MoveBody, TableResponse } from './types';

/** Cards that turned up in hands as a result of the last move, other than ones the player picked themselves. */
export interface Draw {
  moveNumber: number;
  byPlayer: { playerId: number; cardIds: string[] }[];
}

export interface EngineGame {
  /** The table being shown: the latest one, or an earlier position being looked back at. */
  table: TableResponse | null;
  history: HistoryEntry[];
  cardNames: Record<string, string>;
  loading: boolean;
  /** A move is on its way to the engine. */
  busy: boolean;
  /** Why the game could not be loaded, or why the last move was refused. */
  error: string | null;
  /** Whether an earlier position is being shown rather than the latest. */
  viewingPast: boolean;
  /** What the last move drew, until dismissed. */
  draw: Draw | null;
  dismissDraw: () => void;
  submit: (seat: number, move: MoveBody) => Promise<void>;
  /** Show the position after the given move; moves can only be made from the latest one. */
  viewAt: (moveNumber: number) => Promise<void>;
  viewLatest: () => void;
}

/** Loads a hot-seat game from the engine and keeps it up to date as moves are made. */
export function useEngineGame(gameId: string | undefined, api: EngineApi = engineApi): EngineGame {
  const [latest, setLatest] = useState<TableResponse | null>(null);
  const [past, setPast] = useState<TableResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cardNames, setCardNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pastTables = useRef(new Map<number, TableResponse>());
  const [draw, setDraw] = useState<Draw | null>(null);
  // The latest table as of the last render, for comparing hands after a move without a stale closure.
  const latestRef = useRef<TableResponse | null>(null);
  latestRef.current = latest;

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLatest(null);
    setPast(null);
    pastTables.current.clear();

    Promise.all([api.table(gameId), api.history(gameId)])
      .then(([table, played]) => {
        if (cancelled) return;
        setLatest(table);
        setHistory(played.moves);
        setCardNames({ ...played.cardNames, ...table.cardNames });
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof EngineError ? e.message : 'The game could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [gameId, api]);

  const submit = useCallback(async (seat: number, move: MoveBody) => {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    try {
      const engineMove = { ...move, playerId: seat };
      const before = latestRef.current;
      const table = await api.submitMove(gameId, engineMove);
      setLatest(table);
      if (before) setDraw(cardsDrawn(before, table, move));
      setPast(null);
      setCardNames(names => ({ ...names, ...table.cardNames }));
      setHistory(moves => [
        ...moves,
        { moveNumber: table.state.moveNumber, generation: table.state.generation, move: table.state.lastMove ?? engineMove },
      ]);
    } catch (e) {
      setError(e instanceof EngineError ? e.message : 'The move could not be sent.');
    } finally {
      setBusy(false);
    }
  }, [gameId, api]);

  const viewAt = useCallback(async (moveNumber: number) => {
    if (!gameId || !latest) return;
    if (moveNumber >= latest.state.moveNumber) {
      setPast(null);
      return;
    }
    setError(null);
    try {
      const table = pastTables.current.get(moveNumber) ?? await api.table(gameId, moveNumber);
      pastTables.current.set(moveNumber, table);
      setPast(table);
    } catch (e) {
      setError(e instanceof EngineError ? e.message : 'That position could not be loaded.');
    }
  }, [gameId, latest, api]);

  const viewLatest = useCallback(() => setPast(null), []);
  const dismissDraw = useCallback(() => setDraw(null), []);

  return {
    table: past ?? latest,
    history,
    cardNames,
    loading,
    busy,
    error,
    viewingPast: past != null,
    draw,
    dismissDraw,
    submit,
    viewAt,
    viewLatest,
  };
}

/**
 * Cards that appeared in any hand between two tables, leaving out the ones the players picked themselves:
 * those the move named (bought, drafted) and, when the opening choices take effect, those bought from the deal.
 */
function cardsDrawn(before: TableResponse, after: TableResponse, move: MoveBody): Draw | null {
  const chosen = new Set([
    ...('cardIds' in move ? move.cardIds : 'cardId' in move ? [move.cardId] : []),
    ...(before.state.setup?.dealtCards.flat() ?? []),
  ]);
  const byPlayer = after.state.players.flatMap(player => {
    const had = new Set(before.state.players.find(p => p.playerId === player.playerId)?.hand ?? []);
    const cardIds = player.hand.filter(id => !had.has(id) && !chosen.has(id));
    return cardIds.length > 0 ? [{ playerId: player.playerId, cardIds }] : [];
  });
  return byPlayer.length > 0 ? { moveNumber: after.state.moveNumber, byPlayer } : null;
}
