import { useEffect, useState } from 'react';
import type { Draw } from '@/lib/engine/useEngineGame';
import { cardImage } from './controls';

// The cards stay long enough to be read, a little longer for each one more; then they leave.
const HOLD_MS = 2400;
const HOLD_PER_EXTRA_CARD_MS = 600;
const MAX_HOLD_MS = 5000;
const EXIT_MS = 500;

interface CardDrawBurstProps {
  draw: Draw;
  names: Record<string, string>;
  players: { id: number; name: string; color: string }[];
  onDone: () => void;
}

/**
 * Cards a move drew, shown for a moment over the board before they join the hand. The page places it in an
 * overlay that takes no clicks, so play carries on under it.
 */
export function CardDrawBurst({ draw, names, players, onDone }: CardDrawBurstProps) {
  const [leaving, setLeaving] = useState(false);
  const count = draw.byPlayer.reduce((sum, d) => sum + d.cardIds.length, 0);

  useEffect(() => {
    const hold = Math.min(MAX_HOLD_MS, HOLD_MS + HOLD_PER_EXTRA_CARD_MS * Math.max(0, count - 1));
    const timers = [
      setTimeout(() => setLeaving(true), hold),
      setTimeout(onDone, hold + EXIT_MS),
    ];
    return () => timers.forEach(clearTimeout);
    // The burst is keyed by the move it follows, so this runs once for each.
  }, []);

  const width = count > 4 ? 150 : count > 2 ? 180 : 220;

  return (
    <div role="status" aria-label="Cards drawn" className={`flex flex-col items-center gap-4 ${leaving ? 'card-popup-exit' : ''}`}>
      {draw.byPlayer.map(d => {
        const owner = players.find(p => p.id === d.playerId);
        return (
          <div key={d.playerId} className="flex flex-col items-center gap-3">
            <p className="rounded-full border border-white/15 bg-black/80 px-4 py-1.5 text-base text-slate-200 shadow-lg">
              <b style={{ color: owner?.color }}>{owner?.name ?? `Player ${d.playerId + 1}`}</b>
              {' '}draws {d.cardIds.length === 1 ? 'a card' : `${d.cardIds.length} cards`}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {d.cardIds.map((cardId, i) => {
                const name = names[cardId] ?? cardId;
                return (
                  <img
                    key={cardId}
                    src={cardImage(name)}
                    alt={name}
                    draggable={false}
                    style={{ width, animationDelay: `${i * 90}ms` }}
                    className="card-popup-enter block rounded-[11px] shadow-[0_18px_50px_rgba(0,0,0,0.7)]"
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
