import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { engineApi, EngineError, type EngineApi } from '@/lib/engine/client';
import { forgetGameId, parseStartLink, rememberGameId, rememberedGameId, type StartingPosition } from '@/lib/engine/startLink';
import type { ImportIssue } from '@/lib/engine/types';
import { GamePlayPage } from './GamePlayPage';

/**
 * A starting position's page (/play?table=…&move=…&seed=…): the game this browser plays from it. The first
 * visit deals a fresh game from the position and remembers it in browser storage; later visits, reloads and
 * other tabs resume it. The address never names the game, so passing it on gives others a game of their own
 * with the same cards in the same order rather than a seat at this one.
 */
export function NewGamePage({ api = engineApi }: { api?: EngineApi }) {
  const search = useLocation().search;
  const start = parseStartLink(search);
  const [game, setGame] = useState<{ gameId: string; issues: ImportIssue[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One deal per position, however often the effect runs.
  const dealing = useRef<string | null>(null);

  useEffect(() => {
    if (!start) return;
    const remembered = rememberedGameId(start);
    if (remembered) {
      setGame({ gameId: remembered, issues: [] });
      return;
    }
    if (dealing.current === search) return;
    dealing.current = search;
    setGame(null);
    deal(api, start)
      .then(setGame)
      .catch(e => setError(e instanceof EngineError ? e.message : 'The game could not be started.'))
      .finally(() => { dealing.current = null; });
  }, [api, search]); // eslint-disable-line react-hooks/exhaustive-deps -- start is derived from search

  const dealAgain = useCallback(async () => {
    if (!start) return;
    forgetGameId(start);
    setGame(null);
    setError(null);
    try {
      setGame(await deal(api, start));
    } catch (e) {
      setError(e instanceof EngineError ? e.message : 'The game could not be started.');
    }
  }, [api, search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!start || error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p role="alert" className="rounded-lg border border-red-800/40 bg-red-900/20 p-4 font-medium text-red-300">
          {error ?? 'This link does not name a starting position.'}
        </p>
        {start && (
          <Link to={`/replay/${start.tableId}`} className="text-sm font-semibold text-amber-400 hover:text-amber-300">Open the replay instead</Link>
        )}
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-slate-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
        Dealing a fresh game from this position...
      </div>
    );
  }

  return <GamePlayPage key={game.gameId} gameId={game.gameId} issues={game.issues} onDealAgain={dealAgain} api={api} />;
}

async function deal(api: EngineApi, start: StartingPosition): Promise<{ gameId: string; issues: ImportIssue[] }> {
  const imported = await api.importBga(start.tableId, start.moveIndex, start.seed);
  if (!imported.gameId) throw new EngineError(imported.issues[0]?.message ?? 'The position could not be imported.', 422);
  rememberGameId(start, imported.gameId);
  return { gameId: imported.gameId, issues: imported.issues };
}
