import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { engineApi, EngineError, type EngineApi } from '@/lib/engine/client';
import type { ForkPoint, ForkPointsResponse } from '@/lib/engine/types';
import { PlayButton } from './controls';

interface PlayFromHereProps {
  tableId: string;
  /** Index into the game log's moves of the position on screen. */
  moveIndex: number;
  /** BGA player id -> name. */
  playerNames: Record<string, string>;
  api?: EngineApi;
}

/** The fork point at or nearest before a move: games can only be picked up where a player is about to act. */
export function nearestForkPoint(forkPoints: ForkPoint[], moveIndex: number): ForkPoint | undefined {
  return [...forkPoints].reverse().find(f => f.moveIndex <= moveIndex);
}

/**
 * Starts a playable game from the replay position on screen. The engine decides which positions can be
 * picked up, so this asks it first and says where the game will actually resume.
 */
export function PlayFromHere({ tableId, moveIndex, playerNames, api = engineApi }: PlayFromHereProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [forkPoints, setForkPoints] = useState<ForkPointsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const show = () => {
    setOpen(true);
    setError(null);
    if (forkPoints) return;
    api.forkPoints(tableId)
      .then(setForkPoints)
      .catch(e => setError(e instanceof EngineError ? e.message : 'The game engine could not be reached.'));
  };

  const start = async (fork: ForkPoint) => {
    setStarting(true);
    setError(null);
    try {
      const imported = await api.importBga(tableId, fork.moveIndex);
      navigate(`/play/${imported.gameId}`, { state: { issues: imported.issues } });
    } catch (e) {
      setError(e instanceof EngineError ? e.message : 'The game could not be started.');
      setStarting(false);
    }
  };

  const fork = forkPoints ? nearestForkPoint(forkPoints.forkPoints, moveIndex) : undefined;
  const earliest = forkPoints?.forkPoints[0];
  const blocking = forkPoints?.issues.filter(i => i.severity === 'Blocking') ?? [];

  const describe = (f: ForkPoint) => f.kind === 'GenerationStart'
    ? `the start of generation ${f.generation}`
    : `${playerNames[f.activeBgaPlayerId] ?? 'a player'}'s next action in generation ${f.generation}`;

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
      >
        <Gamepad2 size={16} />
        <span>Play from here</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Play from here"
            className="glass-panel rounded-xl p-5 w-[520px] max-w-[90vw] shadow-2xl space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white">Play from here</h2>

            {!forkPoints && !error && <p className="text-sm text-slate-400">Checking where this game can be picked up...</p>}

            {forkPoints && !forkPoints.eligible && (
              <div className="text-sm text-slate-300 space-y-1">
                <p>This game cannot be played on:</p>
                <ul className="list-disc list-inside text-amber-300">
                  {blocking.map((issue, i) => <li key={i}>{issue.message}</li>)}
                </ul>
              </div>
            )}

            {forkPoints?.eligible && fork && (
              <div className="text-sm text-slate-300 space-y-2">
                <p>
                  The game resumes at <span className="font-semibold text-white">{describe(fork)}</span>, after
                  move {fork.moveNumber ?? fork.moveIndex + 1}. You play every seat, with all hands visible, and
                  the deck holds the cards the real game went on to draw.
                </p>
                {fork.moveIndex < moveIndex && (
                  <p className="text-slate-400">
                    That is {moveIndex - fork.moveIndex} move{moveIndex - fork.moveIndex === 1 ? '' : 's'} before the position
                    shown: a game can only be picked up where a player is about to act.
                  </p>
                )}
              </div>
            )}

            {forkPoints?.eligible && !fork && earliest && (
              <p className="text-sm text-slate-300">
                This game can be picked up from generation 2 onwards. The earliest position
                is {describe(earliest)}, after move {earliest.moveNumber ?? earliest.moveIndex + 1}.
              </p>
            )}

            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              {forkPoints?.eligible && (fork ?? earliest) && (
                <PlayButton variant="primary" disabled={starting} onClick={() => start((fork ?? earliest)!)}>
                  {starting ? 'Starting...' : fork ? 'Play' : 'Play from the earliest position'}
                </PlayButton>
              )}
              <PlayButton disabled={starting} onClick={() => setOpen(false)}>Close</PlayButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
