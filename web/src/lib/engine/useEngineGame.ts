import { useCallback, useEffect, useRef, useState } from 'react';
import { engineApi, EngineError, type EngineApi } from './client';
import type { HistoryEntry, MoveBody, TableResponse } from './types';

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
      const table = await api.submitMove(gameId, engineMove);
      setLatest(table);
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

  return {
    table: past ?? latest,
    history,
    cardNames,
    loading,
    busy,
    error,
    viewingPast: past != null,
    submit,
    viewAt,
    viewLatest,
  };
}
