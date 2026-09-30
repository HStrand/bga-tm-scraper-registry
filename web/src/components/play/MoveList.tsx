import { useEffect, useRef } from 'react';
import { describeMove } from '@/lib/engine/describeMove';
import type { HistoryEntry } from '@/lib/engine/types';

interface MoveListProps {
  history: HistoryEntry[];
  cardNames: Record<string, string>;
  players: { id: string; name: string; color: string }[];
  /** Move number of the position on screen; 0 is the position the game started from. */
  currentMoveNumber: number;
  onView: (moveNumber: number) => void;
}

/** The moves played so far. Clicking one shows the position after it. */
export function MoveList({ history, cardNames, players, currentMoveNumber, onView }: MoveListProps) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView?.({ block: 'nearest' });
  }, [currentMoveNumber, history.length]);

  const row = (moveNumber: number, label: React.ReactNode) => {
    const isCurrent = moveNumber === currentMoveNumber;
    return (
      <li key={moveNumber}>
        <button
          ref={isCurrent ? current : undefined}
          type="button"
          aria-current={isCurrent ? 'step' : undefined}
          onClick={() => onView(moveNumber)}
          className={`w-full text-left px-2 py-1 rounded text-sm transition-colors ${isCurrent ? 'bg-amber-500/20 text-white' : 'text-slate-300 hover:bg-white/5'}`}
        >
          {label}
        </button>
      </li>
    );
  };

  let generation: number | null = null;
  return (
    <div className="glass-panel rounded-xl p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Moves</h2>
      <ol className="max-h-72 overflow-y-auto space-y-0.5 pr-1">
        {row(0, <span className="text-slate-400">Starting position</span>)}
        {history.map(entry => {
          const player = players.find(p => p.id === String(entry.move.playerId));
          const heading = entry.generation !== generation
            ? <li key={`gen-${entry.generation}-${entry.moveNumber}`} className="px-2 pt-2 text-xs font-semibold text-slate-500">Generation {entry.generation}</li>
            : null;
          generation = entry.generation;
          return [
            heading,
            row(entry.moveNumber, (
              <>
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: player?.color }} />
                <span className="font-medium">{player?.name ?? `Player ${entry.move.playerId + 1}`}</span>{' '}
                {describeMove(entry.move, cardNames)}
              </>
            )),
          ];
        })}
      </ol>
    </div>
  );
}
