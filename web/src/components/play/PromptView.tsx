import { useState } from 'react';
import { cardPaymentRules, defaultPayment, hasPaymentChoice, heatRange } from '@/lib/engine/payment';
import type { Prompt } from '@/lib/engine/prompts';
import type { EnginePlayer, MoveBody, PlayableCard } from '@/lib/engine/types';
import { CardPicker, PlayButton } from './controls';
import { HeatAmount, PaymentForm } from './PaymentForm';

interface PromptViewProps {
  prompt: Prompt;
  /** The player who has to answer. */
  player: EnginePlayer;
  /** What that player can put towards a cost in M€ (heat counts for Helion). */
  spendable: number;
  names: Record<string, string>;
  playerNames: Record<number, string>;
  busy: boolean;
  onMove: (move: MoveBody) => void;
}

/** The one decision the game is waiting on. Hex prompts are answered on the board, the rest here. */
export function PromptView(props: PromptViewProps) {
  const { prompt, busy, onMove } = props;
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold text-white">{prompt.title}</p>
      <PromptBody {...props} />
      {prompt.skip && (
        <PlayButton disabled={busy} onClick={() => onMove(prompt.skip!.move)}>{prompt.skip.label}</PlayButton>
      )}
    </div>
  );
}

function PromptBody({ prompt, player, spendable, names, playerNames, busy, onMove }: PromptViewProps) {
  switch (prompt.kind) {
    case 'hex':
      return (
        <p className="text-sm text-slate-300">
          {prompt.locations.length > 0 ? 'Click one of the highlighted hexes on the board.' : 'There is no hex to place it on.'}
        </p>
      );
    case 'player':
      return (
        <div className="flex flex-wrap gap-2">
          {prompt.playerIds.map(id => (
            <PlayButton key={id} variant="primary" disabled={busy} onClick={() => onMove(prompt.move(id))}>
              {playerNames[id] ?? `Player ${id + 1}`}
            </PlayButton>
          ))}
        </div>
      );
    case 'card':
      return <CardPicker cardIds={prompt.cardIds} names={names} disabled={busy} onPick={id => onMove(prompt.move(id))} />;
    case 'cards':
      return <CardsChoice prompt={prompt} player={player} spendable={spendable} names={names} busy={busy} onMove={onMove} />;
    case 'option':
      return (
        <div className="flex flex-col items-start gap-2">
          {prompt.options.map((option, i) => (
            <PlayButton key={i} variant="primary" disabled={busy} onClick={() => onMove(option.move)}>{option.label}</PlayButton>
          ))}
        </div>
      );
    case 'playCard':
      return <PlayCardChoice cards={prompt.cards} player={player} names={names} busy={busy} onMove={onMove} />;
  }
}

function CardsChoice({ prompt, player, spendable, names, busy, onMove }: {
  prompt: Extract<Prompt, { kind: 'cards' }>;
  player: EnginePlayer;
  spendable: number;
  names: Record<string, string>;
  busy: boolean;
  onMove: (move: MoveBody) => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Null until the player sets it: the least heat that the selection needs.
  const [chosenHeat, setChosenHeat] = useState<number | null>(null);

  const toggle = (cardId: string) => setSelected(current => {
    const next = new Set(current);
    if (!next.delete(cardId)) next.add(cardId);
    return next;
  });

  const cost = selected.size * prompt.costPerCard;
  const problem = selected.size < prompt.min ? `Choose ${prompt.min === prompt.max ? prompt.min : `at least ${prompt.min}`}.`
    : selected.size > prompt.max ? `Choose at most ${prompt.max}.`
    : cost > spendable ? `That costs ${cost} M€; only ${spendable} available.`
    : null;

  // Helion may pay for cards with heat, and chooses how much.
  const paysWithHeat = cost > 0 && spendable > player.resources.megaCredits;
  const range = heatRange(cost, player);
  const heat = Math.max(range.min, Math.min(range.max, chosenHeat ?? range.min));

  return (
    <div className="space-y-2">
      <CardPicker cardIds={prompt.cardIds} names={names} selected={selected} disabled={busy} onPick={toggle} />
      <div className="flex items-center gap-3">
        <PlayButton
          variant="primary"
          disabled={busy || problem != null}
          // Keep the engine's card order, not the order of clicking.
          onClick={() => {
            const move = prompt.move(prompt.cardIds.filter(id => selected.has(id)));
            onMove(paysWithHeat ? { ...move, heat } : move);
          }}
        >
          {prompt.confirmLabel} {selected.size}{prompt.costPerCard > 0 ? ` for ${cost} M€` : ''}
        </PlayButton>
        {problem && <span className="text-sm text-slate-400">{problem}</span>}
      </div>
      {paysWithHeat && !problem && <HeatAmount cost={cost} player={player} value={heat} onChange={setChosenHeat} />}
    </div>
  );
}

/** Pick a playable card, then how to pay for it when there is a choice. */
export function PlayCardChoice({ cards, player, names, busy, onMove }: {
  cards: PlayableCard[];
  player: EnginePlayer;
  names: Record<string, string>;
  busy: boolean;
  onMove: (move: MoveBody) => void;
}) {
  const [paying, setPaying] = useState<PlayableCard | null>(null);

  if (paying) {
    return (
      <PaymentForm
        title={`Play ${names[paying.cardId] ?? paying.cardId}`}
        rules={cardPaymentRules(paying)}
        player={player}
        names={names}
        busy={busy}
        onConfirm={payment => onMove({ type: 'PlayCard', cardId: paying.cardId, payment })}
        onCancel={() => setPaying(null)}
      />
    );
  }

  const pick = (cardId: string) => {
    const card = cards.find(c => c.cardId === cardId)!;
    const rules = cardPaymentRules(card);
    if (hasPaymentChoice(rules, player)) setPaying(card);
    else onMove({ type: 'PlayCard', cardId, payment: defaultPayment(rules, player) });
  };

  if (cards.length === 0) return <p className="text-sm text-slate-500">No card in hand can be played now.</p>;
  return (
    <CardPicker
      cardIds={cards.map(c => c.cardId)}
      names={names}
      disabled={busy}
      badge={id => String(cards.find(c => c.cardId === id)?.effectiveCost ?? '')}
      onPick={pick}
    />
  );
}
