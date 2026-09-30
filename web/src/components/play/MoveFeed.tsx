import { describeMove } from '@/lib/engine/describeMove';
import type { HistoryEntry } from '@/lib/engine/types';

interface MoveFeedProps {
  history: HistoryEntry[];
  cardNames: Record<string, string>;
  players: { id: string; name: string; color: string }[];
  /** Move number of the position on screen; 0 is the position the game started from. */
  currentMoveNumber: number;
  onView: (moveNumber: number) => void;
}

/** The moves played so far, newest first. Clicking one shows the position after it. */
export function MoveFeed({ history, cardNames, players, currentMoveNumber, onView }: MoveFeedProps) {
  const row = (moveNumber: number, label: React.ReactNode) => {
    const isCurrent = moveNumber === currentMoveNumber;
    return (
      <li key={moveNumber}>
        <button
          type="button"
          aria-current={isCurrent ? 'step' : undefined}
          onClick={() => onView(moveNumber)}
          className={`w-full rounded px-2 py-1 text-left text-[13px] leading-snug transition-colors ${isCurrent ? 'bg-amber-500/15 text-white' : 'text-slate-300 hover:bg-white/5'}`}
        >
          {label}
        </button>
      </li>
    );
  };

  const newestFirst = [...history].reverse();
  return (
    <section className="play-panel flex min-h-0 flex-1 flex-col p-2" aria-label="Moves">
      <h2 className="play-heading px-1 pb-1">Moves</h2>
      <ol className="min-h-0 flex-1 space-y-px overflow-y-auto scrollbar-subtle">
        {newestFirst.map((entry, i) => {
          const player = players.find(p => p.id === String(entry.move.playerId));
          const newer = newestFirst[i - 1];
          return [
            (!newer || newer.generation !== entry.generation) && (
              <li key={`gen-${entry.moveNumber}`} className="play-heading px-2 pb-0.5 pt-2">Generation {entry.generation}</li>
            ),
            row(entry.moveNumber, (
              <>
                <span className="font-semibold" style={{ color: player?.color }}>{player?.name ?? `Player ${entry.move.playerId + 1}`}</span>{' '}
                {describeMove(entry.move, cardNames)}
              </>
            )),
          ];
        })}
        {row(0, <span className="text-slate-400">Starting position</span>)}
      </ol>
    </section>
  );
}
