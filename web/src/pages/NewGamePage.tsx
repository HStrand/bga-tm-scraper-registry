import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { engineApi, EngineError, type EngineApi } from '@/lib/engine/client';
import { parseStartLink } from '@/lib/engine/startLink';

/**
 * Deals a fresh game from a shared starting position (/play/new?table=…&move=…&seed=…) and moves on to it.
 * Everyone who opens the link gets a game of their own with the same cards in the same order.
 */
export function NewGamePage({ api = engineApi }: { api?: EngineApi }) {
  const navigate = useNavigate();
  const start = parseStartLink(useLocation().search);
  const [error, setError] = useState<string | null>(null);
  // One game per visit, however often the effect runs.
  const requested = useRef(false);

  useEffect(() => {
    if (!start || requested.current) return;
    requested.current = true;

    api.importBga(start.tableId, start.moveIndex, start.seed)
      // Replacing the address means Back does not deal yet another game.
      .then(imported => navigate(`/play/${imported.gameId}`, { replace: true, state: { issues: imported.issues } }))
      .catch(e => setError(e instanceof EngineError ? e.message : 'The game could not be started.'));
  }, [api, navigate, start]);

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

  return (
    <div className="flex h-screen items-center justify-center gap-2 text-slate-400">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
      Dealing a fresh game from this position...
    </div>
  );
}
