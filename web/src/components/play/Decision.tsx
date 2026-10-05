import { useState } from 'react';
import { cardPaymentRules, defaultPayment, hasPaymentChoice, heatRange } from '@/lib/engine/payment';
import type { Prompt } from '@/lib/engine/prompts';
import type { EnginePlayer, MoveBody, PlayableCard } from '@/lib/engine/types';
import { CardPicker, Dialog, PlayButton } from './controls';
import { OpeningChoice } from './OpeningChoice';
import { OptionChoice } from './OptionChoice';
import { HeatAmount, PaymentForm } from './PaymentForm';

interface DecisionProps {
  /** Any prompt but a hex one; those are answered on the board. */
  prompt: Exclude<Prompt, { kind: 'hex' }>;
  /** The player who has to answer. */
  player: EnginePlayer;
  /** That player as shown on the page, so the dialog can say who is deciding. */
  actor?: { name: string; color: string };
  /** What that player can put towards a cost in M€ (heat counts for Helion). */
  spendable: number;
  names: Record<string, string>;
  playerNames: Record<number, string>;
  busy: boolean;
  onMove: (move: MoveBody) => void;
}

/** The one decision the game is waiting on, as a dialog in front of the board. */
export function Decision(props: DecisionProps) {
  const { prompt, actor, busy, onMove } = props;
  const who = actor && <span><b style={{ color: actor.color }}>{actor.name}</b> is choosing</span>;
  return (
    <Dialog title={prompt.title} subtitle={who} wide={prompt.kind !== 'player' && prompt.kind !== 'option'}>
      <DecisionBody {...props} />
      {prompt.skip && (
        <div className="mt-4 flex justify-center">
          <PlayButton disabled={busy} onClick={() => onMove(prompt.skip!.move)}>{prompt.skip.label}</PlayButton>
        </div>
      )}
    </Dialog>
  );
}

function DecisionBody({ prompt, player, spendable, names, playerNames, busy, onMove }: Omit<DecisionProps, 'actor'>) {
  switch (prompt.kind) {
    case 'player':
      return (
        <div className="flex flex-wrap justify-center gap-2">
          {prompt.playerIds.map(id => (
            <PlayButton key={id} variant="primary" disabled={busy} onClick={() => onMove(prompt.move(id))}>
              {playerNames[id] ?? `Player ${id + 1}`}
            </PlayButton>
          ))}
        </div>
      );
    case 'card':
      return <CardChoice prompt={prompt} names={names} busy={busy} onMove={onMove} />;
    case 'cards':
      return <CardsChoice prompt={prompt} player={player} spendable={spendable} names={names} busy={busy} onMove={onMove} />;
    case 'option':
      return <OptionChoice prompt={prompt} player={player} names={names} busy={busy} onMove={onMove} />;
    case 'playCard':
      return <PlayCardChoice cards={prompt.cards} player={player} names={names} busy={busy} onMove={onMove} />;
    case 'setup':
      return <OpeningChoice options={prompt.options} names={names} busy={busy} onMove={onMove} />;
  }
}

/** Pick one card: it lights up when clicked, and a button confirms it. */
function CardChoice({ prompt, names, busy, onMove }: {
  prompt: Extract<Prompt, { kind: 'card' }>;
  names: Record<string, string>;
  busy: boolean;
  onMove: (move: MoveBody) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = new Set(picked ? [picked] : []);
  return (
    <div className="space-y-4">
      <CardPicker cardIds={prompt.cardIds} names={names} selected={selected} disabled={busy} onPick={id => setPicked(id === picked ? null : id)} />
      <div className="flex justify-center">
        <PlayButton variant="primary" disabled={busy || picked == null} onClick={() => picked && onMove(prompt.move(picked))}>
          {prompt.confirmLabel ?? 'Choose'}{picked ? ` ${names[picked] ?? picked}` : ''}
        </PlayButton>
      </div>
    </div>
  );
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
    <div className="space-y-4">
      <CardPicker cardIds={prompt.cardIds} names={names} selected={selected} disabled={busy} onPick={toggle} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        {paysWithHeat && !problem && <HeatAmount cost={cost} player={player} value={heat} onChange={setChosenHeat} />}
        <PlayButton
          variant="primary"
          disabled={busy || problem != null}
          onClick={() => {
            // Keep the engine's card order, not the order of clicking.
            const move = prompt.move(prompt.cardIds.filter(id => selected.has(id)));
            onMove(paysWithHeat ? { ...move, heat } : move);
          }}
        >
          {prompt.confirmLabel} {selected.size}{prompt.costPerCard > 0 ? ` for ${cost} M€` : ''}
        </PlayButton>
        {problem && <span className="text-sm text-slate-400">{problem}</span>}
      </div>
    </div>
  );
}

/** Pick a playable card, then how to pay for it when there is a choice. */
function PlayCardChoice({ cards, player, names, busy, onMove }: {
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

  if (cards.length === 0) return <p className="text-center text-sm text-slate-400">No card in hand can be played now.</p>;
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
