import { useEffect, useState } from 'react';
import { getIcon, resourceIcons } from '@/components/replay/replayShared';
import { getCardResourceType } from '@/lib/cardMetadata';
import type { EnginePlayer } from '@/lib/engine/types';
import { cardImage } from './controls';

export interface CardResourceChange {
  cardId: string;
  playerId: number;
  from: number;
  to: number;
}

/** Cards whose resource count differs between two positions, for every player. */
export function diffCardResources(before: EnginePlayer[], after: EnginePlayer[]): CardResourceChange[] {
  const changes: CardResourceChange[] = [];
  for (const player of after) {
    const previous = before.find(p => p.playerId === player.playerId)?.cardResources ?? {};
    const cardIds = new Set([...Object.keys(previous), ...Object.keys(player.cardResources)]);
    for (const cardId of cardIds) {
      const from = previous[cardId] ?? 0;
      const to = player.cardResources[cardId] ?? 0;
      if (from !== to) changes.push({ cardId, playerId: player.playerId, from, to });
    }
  }
  return changes;
}

// How long the old count shows, the new count shows, and the card takes to leave.
const SHOW_OLD_MS = 550;
const HOLD_MS = 1500;
const EXIT_MS = 500;

interface CardResourceBurstProps {
  changes: CardResourceChange[];
  names: Record<string, string>;
  onDone: () => void;
}

/**
 * A card that just gained or lost resources, shown for a moment over the board: the count on it ticks from
 * what it was to what it is, then the card goes away. It does not take clicks, so play carries on under it.
 */
export function CardResourceBurst({ changes, names, onDone }: CardResourceBurstProps) {
  const [phase, setPhase] = useState<'old' | 'new' | 'exit'>('old');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('new'), SHOW_OLD_MS),
      setTimeout(() => setPhase('exit'), SHOW_OLD_MS + HOLD_MS),
      setTimeout(onDone, SHOW_OLD_MS + HOLD_MS + EXIT_MS),
    ];
    return () => timers.forEach(clearTimeout);
    // The burst is keyed by the move it follows, so this runs once for each.
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center gap-6" aria-live="polite">
      {changes.slice(0, 3).map(change => {
        const name = names[change.cardId] ?? change.cardId;
        const type = getCardResourceType(name);
        const icon = type ? getIcon(resourceIcons, type) : undefined;
        const delta = change.to - change.from;
        const shown = phase === 'old' ? change.from : change.to;
        return (
          <div
            key={`${change.playerId}-${change.cardId}`}
            className={`relative w-[230px] ${phase === 'exit' ? 'card-popup-exit' : 'card-popup-enter'}`}
          >
            <img src={cardImage(name)} alt="" className="block w-full rounded-[11px] shadow-[0_18px_50px_rgba(0,0,0,0.7)]" draggable={false} />
            <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
              <div
                key={phase === 'old' ? 'old' : 'new'}
                className={`relative flex items-center gap-2.5 rounded-2xl border bg-black/85 px-5 py-2.5 shadow-xl ${phase === 'old' ? 'border-white/20' : `resource-count-pop ${delta > 0 ? 'border-emerald-400/80' : 'border-rose-400/80'}`}`}
              >
                {icon && <img src={icon} alt="" className="h-11 w-11 object-contain" />}
                <span className="text-4xl font-extrabold tabular-nums text-white">{shown}</span>
                {phase !== 'old' && (
                  <span className={`resource-delta-float absolute -right-3 -top-4 rounded-full px-2.5 py-0.5 text-xl font-extrabold tabular-nums shadow-lg ${delta > 0 ? 'bg-emerald-500 text-emerald-950' : 'bg-rose-500 text-white'}`}>
                    {delta > 0 ? `+${delta}` : `−${-delta}`}
                  </span>
                )}
              </div>
            </div>
            <span className="sr-only">
              {name}: {change.from} to {change.to}{type ? ` ${type}${change.to === 1 ? '' : 's'}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
