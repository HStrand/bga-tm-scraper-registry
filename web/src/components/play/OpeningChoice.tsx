import { useState } from 'react';
import type { MoveBody, SetupOptions } from '@/lib/engine/types';
import { CardPicker, PlayButton } from './controls';

interface OpeningChoiceProps {
  options: SetupOptions;
  names: Record<string, string>;
  busy: boolean;
  onMove: (move: MoveBody) => void;
}

/**
 * A player's opening, chosen in one go as at the table: a corporation, the preludes to keep and the project
 * cards to buy from the corporation's starting M€.
 */
export function OpeningChoice({ options, names, busy, onMove }: OpeningChoiceProps) {
  const [corporation, setCorporation] = useState<string | null>(null);
  const [preludes, setPreludes] = useState<ReadonlySet<string>>(new Set());
  const [cards, setCards] = useState<ReadonlySet<string>>(new Set());

  const toggle = (set: (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void) => (cardId: string) =>
    set(current => {
      const next = new Set(current);
      if (!next.delete(cardId)) next.add(cardId);
      return next;
    });

  const { preludesToKeep, costPerCard } = options;
  const cost = cards.size * costPerCard;
  const funds = corporation ? options.startingMegaCredits[corporation] ?? 0 : null;

  const problem = !corporation ? 'Choose a corporation.'
    : preludes.size !== preludesToKeep ? `Keep ${preludesToKeep} preludes.`
    : cost > funds! ? `${cards.size} cards cost ${cost} M€; ${names[corporation] ?? corporation} starts with ${funds}.`
    : null;

  return (
    <div className="space-y-4">
      {/* Side by side when there is room, so the whole deal can be weighed at a glance. */}
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
        <section aria-label="Corporation">
          <h3 className="play-heading mb-2">Corporation</h3>
          <CardPicker
            cardIds={options.availableCorporations}
            names={names}
            selected={new Set(corporation ? [corporation] : [])}
            disabled={busy}
            size={180}
            onPick={id => setCorporation(id === corporation ? null : id)}
          />
        </section>

        {preludesToKeep > 0 && (
          <section aria-label="Preludes">
            <h3 className="play-heading mb-2">Preludes · keep {preludesToKeep} of {options.availablePreludes.length}</h3>
            <CardPicker cardIds={options.availablePreludes} names={names} selected={preludes} disabled={busy} size={150} onPick={toggle(setPreludes)} />
          </section>
        )}
      </div>

      <section aria-label="Project cards">
        <h3 className="play-heading mb-2">Project cards · {costPerCard} M€ each</h3>
        <CardPicker cardIds={options.availableCards} names={names} selected={cards} disabled={busy} size={160} onPick={toggle(setCards)} />
      </section>

      <div className="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-slate-950 px-5 py-3">
        {funds != null && (
          <span className="text-sm text-slate-300">
            {cards.size} card{cards.size === 1 ? '' : 's'} for {cost} M€, leaving <b className="text-white">{funds - cost} M€</b>
          </span>
        )}
        <PlayButton
          variant="primary"
          disabled={busy || problem != null}
          onClick={() => onMove({
            type: 'Setup',
            corporationId: corporation!,
            // Keep the order the cards were dealt in, not the order of clicking.
            preludeIds: options.availablePreludes.filter(id => preludes.has(id)),
            cardIdsToBuy: options.availableCards.filter(id => cards.has(id)),
          })}
        >
          {corporation ? `Start as ${names[corporation] ?? corporation}` : 'Start'}
        </PlayButton>
        {problem && <span className="text-sm text-slate-400">{problem}</span>}
      </div>
    </div>
  );
}
