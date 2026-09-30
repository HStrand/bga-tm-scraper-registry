import { useState } from 'react';
import { defaultPayment, heatRange, paymentProblem, type PaymentRules } from '@/lib/engine/payment';
import type { EnginePlayer, Payment } from '@/lib/engine/types';
import { PlayButton } from './controls';

interface PaymentFormProps {
  /** What is being paid for, e.g. "Play Comet". */
  title: string;
  rules: PaymentRules;
  player: EnginePlayer;
  names: Record<string, string>;
  busy: boolean;
  onConfirm: (payment: Payment) => void;
  onCancel: () => void;
}

/**
 * Chooses how to pay a cost: how much steel, titanium, heat and card resources to spend. MC makes up
 * whatever those leave uncovered.
 */
export function PaymentForm({ title, rules, player, names, busy, onConfirm, onCancel }: PaymentFormProps) {
  const [spend, setSpend] = useState(() => defaultPayment(rules, player));

  const fromCards = Object.entries(spend.cardResources ?? {})
    .reduce((sum, [id, count]) => sum + count * (rules.cardResourceValues[id] ?? 0), 0);
  const covered = spend.steel * rules.steelValue + spend.titanium * rules.titaniumValue + spend.heat + fromCards;
  const payment: Payment = { ...spend, megaCredits: Math.max(0, rules.cost - covered) };
  const problem = paymentProblem(payment, rules, player);

  const amount = (label: string, value: number, max: number, each: number, onChange: (n: number) => void) => (
    <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
      <span>{label} <span className="text-slate-500">({each} M€ each, {max} available)</span></span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={e => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
        className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-right text-white"
      />
    </label>
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-white">{title} <span className="text-slate-400">— {rules.cost} M€</span></p>
      {rules.titaniumValue > 0 && player.resources.titanium > 0
        && amount('Titanium', spend.titanium, player.resources.titanium, rules.titaniumValue, titanium => setSpend(s => ({ ...s, titanium })))}
      {rules.steelValue > 0 && player.resources.steel > 0
        && amount('Steel', spend.steel, player.resources.steel, rules.steelValue, steel => setSpend(s => ({ ...s, steel })))}
      {rules.canUseHeat && player.resources.heat > 0
        && amount('Heat', spend.heat, player.resources.heat, 1, heat => setSpend(s => ({ ...s, heat })))}
      {Object.entries(rules.cardResourceValues).filter(([id]) => (player.cardResources[id] ?? 0) > 0).map(([id, value]) => (
        <div key={id}>
          {amount(`Resources on ${names[id] ?? id}`, spend.cardResources?.[id] ?? 0, player.cardResources[id], value,
            count => setSpend(s => ({ ...s, cardResources: { ...(s.cardResources ?? {}), [id]: count } })))}
        </div>
      ))}
      <p className="text-sm text-slate-300">
        M€: <span className="font-bold text-white">{payment.megaCredits}</span>
        <span className="text-slate-500"> of {player.resources.megaCredits}</span>
      </p>
      {problem && <p className="text-sm text-red-400">{problem}</p>}
      <div className="flex gap-2">
        <PlayButton variant="primary" disabled={busy || problem != null} onClick={() => onConfirm(payment)}>Pay</PlayButton>
        <PlayButton disabled={busy} onClick={onCancel}>Cancel</PlayButton>
      </div>
    </div>
  );
}

/** A number field for the heat Helion spends in place of M€, kept within what the cost and the player allow. */
export function HeatAmount({ cost, player, value, onChange }: {
  cost: number;
  player: EnginePlayer;
  value: number;
  onChange: (heat: number) => void;
}) {
  const { min, max } = heatRange(cost, player);
  // What is being typed, until the field is left. Snapping it into range on every keystroke would turn
  // clearing the field and typing "7" into "27" whenever some heat is required.
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      Heat
      <input
        type="number"
        min={min}
        max={max}
        value={typing ?? value}
        onChange={e => {
          setTyping(e.target.value);
          onChange(Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))));
        }}
        onBlur={() => setTyping(null)}
        className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-right text-white"
      />
      <span className="text-slate-500">+ {Math.max(0, cost - value)} M€</span>
    </label>
  );
}

interface HeatSplitFormProps {
  /** What is being paid for, e.g. "Asteroid". */
  title: string;
  cost: number;
  player: EnginePlayer;
  busy: boolean;
  onConfirm: (heat: number) => void;
  onCancel: () => void;
}

/** Helion's choice of how much of a cost in M€ to pay with heat. */
export function HeatSplitForm({ title, cost, player, busy, onConfirm, onCancel }: HeatSplitFormProps) {
  const [heat, setHeat] = useState(() => heatRange(cost, player).min);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-white">{title} <span className="text-slate-400">— {cost} M€</span></p>
      <HeatAmount cost={cost} player={player} value={heat} onChange={setHeat} />
      <div className="flex gap-2">
        <PlayButton variant="primary" disabled={busy} onClick={() => onConfirm(heat)}>Pay</PlayButton>
        <PlayButton disabled={busy} onClick={onCancel}>Cancel</PlayButton>
      </div>
    </div>
  );
}
