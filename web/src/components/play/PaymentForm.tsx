import { useState, type ReactNode } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { getIcon, resourceIcons } from '@/components/replay/replayShared';
import { getCardResourceType } from '@/lib/cardMetadata';
import { defaultPayment, heatRange, paymentProblem, paymentValue, type PaymentRules } from '@/lib/engine/payment';
import type { EnginePlayer, Payment } from '@/lib/engine/types';
import { PlayButton } from './controls';

const icon = (name: string) => getIcon(resourceIcons, name);

function ResourceIcon({ name, size = 'h-8 w-8' }: { name: string; size?: string }) {
  const src = icon(name);
  return src ? <img src={src} alt="" className={`${size} flex-shrink-0 object-contain`} draggable={false} /> : null;
}

/** An amount in M€, with the coin. */
function Coins({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-bold tabular-nums text-white ${className}`}>
      <ResourceIcon name="mc" size="h-6 w-6" />
      {amount}
    </span>
  );
}

interface StepperProps {
  /** Names the amount for screen readers, e.g. "Titanium". */
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
}

/** An amount set with − and + or typed, kept between min and max. */
function Stepper({ label, value, min = 0, max, onChange }: StepperProps) {
  // What is being typed, until the field is left. Snapping it into range on every keystroke would turn
  // clearing the field and typing "7" into "27" whenever a minimum applies.
  const [typing, setTyping] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.floor(n) || 0));
  const step = (by: number) => {
    setTyping(null);
    onChange(clamp(value + by));
  };
  const button = 'flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-100 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={button} disabled={value <= min} onClick={() => step(-1)} aria-label={`Less ${label.toLowerCase()}`}>
        <Minus size={18} />
      </button>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={typing ?? value}
        onChange={e => {
          setTyping(e.target.value);
          onChange(clamp(Number(e.target.value)));
        }}
        onBlur={() => setTyping(null)}
        className="h-10 w-14 rounded-lg border border-white/10 bg-black/30 text-center text-xl font-bold tabular-nums text-white [appearance:textfield] focus:border-amber-400 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" className={button} disabled={value >= max} onClick={() => step(1)} aria-label={`More ${label.toLowerCase()}`}>
        <Plus size={18} />
      </button>
      <span className="w-12 text-base tabular-nums text-slate-500">/ {max}</span>
    </div>
  );
}

/** One thing to pay with: its icon, what a unit is worth, and how many to spend. */
function SpendRow({ iconName, label, each, children }: { iconName?: string; label: string; each: number; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {iconName && <ResourceIcon name={iconName} />}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white">{label}</p>
          <p className="text-sm text-slate-400">worth {each} M€ each</p>
        </div>
      </div>
      {children}
    </div>
  );
}

interface PaymentFormProps {
  /** What is being paid for, e.g. "Play Comet"; left out where a heading already says it. */
  title?: string;
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
  const suggested = defaultPayment(rules, player);
  const [spend, setSpend] = useState(suggested);

  const have = player.resources;
  const withMc = (s: Payment): Payment => {
    const covered = paymentValue({ ...s, megaCredits: 0 }, rules);
    return { ...s, megaCredits: Math.max(0, rules.cost - covered) };
  };
  const payment = withMc(spend);
  const problem = paymentProblem(payment, rules, player);
  const total = paymentValue(payment, rules);

  const sameSpend = (a: Payment, b: Payment) =>
    a.steel === b.steel && a.titanium === b.titanium && a.heat === b.heat
    && JSON.stringify(a.cardResources ?? {}) === JSON.stringify(b.cardResources ?? {});
  const mcOnly: Payment = { megaCredits: rules.cost, steel: 0, titanium: 0, heat: 0, cardResources: null };
  const presets = [
    { label: 'Suggested', payment: suggested },
    ...(have.megaCredits >= rules.cost && !sameSpend(mcOnly, suggested) ? [{ label: 'M€ only', payment: mcOnly }] : []),
  ];

  const cardRows = Object.entries(rules.cardResourceValues).filter(([id]) => (player.cardResources[id] ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold text-white">{title ?? 'Cost'}</p>
        <Coins amount={rules.cost} className="text-2xl" />
      </div>

      {presets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {presets.map(preset => {
            const active = sameSpend(preset.payment, spend);
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => setSpend(preset.payment)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${active ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/10'}`}
              >
                <span className="text-sm font-semibold text-slate-300">{preset.label}</span>
                <span className="flex items-center gap-2.5 text-base font-bold tabular-nums text-white">
                  {preset.payment.titanium > 0 && <span className="flex items-center gap-1"><ResourceIcon name="titanium" size="h-6 w-6" />{preset.payment.titanium}</span>}
                  {preset.payment.steel > 0 && <span className="flex items-center gap-1"><ResourceIcon name="steel" size="h-6 w-6" />{preset.payment.steel}</span>}
                  {preset.payment.heat > 0 && <span className="flex items-center gap-1"><ResourceIcon name="heat" size="h-6 w-6" />{preset.payment.heat}</span>}
                  {Object.entries(preset.payment.cardResources ?? {}).filter(([, count]) => count > 0).map(([id, count]) => (
                    <span key={id} className="flex items-center gap-1" title={`Resources on ${names[id] ?? id}`}>
                      <ResourceIcon name={getCardResourceType(names[id] ?? id) ?? ''} size="h-6 w-6" />{count}
                    </span>
                  ))}
                  {withMc(preset.payment).megaCredits > 0 && <span className="flex items-center gap-1"><ResourceIcon name="mc" size="h-6 w-6" />{withMc(preset.payment).megaCredits}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {rules.titaniumValue > 0 && have.titanium > 0 && (
          <SpendRow iconName="titanium" label="Titanium" each={rules.titaniumValue}>
            <Stepper label="Titanium" value={spend.titanium} max={have.titanium} onChange={titanium => setSpend(s => ({ ...s, titanium }))} />
          </SpendRow>
        )}
        {rules.steelValue > 0 && have.steel > 0 && (
          <SpendRow iconName="steel" label="Steel" each={rules.steelValue}>
            <Stepper label="Steel" value={spend.steel} max={have.steel} onChange={steel => setSpend(s => ({ ...s, steel }))} />
          </SpendRow>
        )}
        {rules.canUseHeat && have.heat > 0 && (
          <SpendRow iconName="heat" label="Heat" each={1}>
            <Stepper label="Heat" value={spend.heat} max={have.heat} onChange={heat => setSpend(s => ({ ...s, heat }))} />
          </SpendRow>
        )}
        {cardRows.map(([id, value]) => {
          const cardName = names[id] ?? id;
          return (
            <SpendRow key={id} iconName={getCardResourceType(cardName)} label={`Resources on ${cardName}`} each={value}>
              <Stepper
                label={`Resources on ${cardName}`}
                value={spend.cardResources?.[id] ?? 0}
                max={player.cardResources[id]}
                onChange={count => setSpend(s => ({ ...s, cardResources: { ...(s.cardResources ?? {}), [id]: count } }))}
              />
            </SpendRow>
          );
        })}

        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-3">
            <ResourceIcon name="mc" />
            <div>
              <p className="text-base font-semibold text-white">M€</p>
              <p className="text-sm text-slate-400">covers the rest</p>
            </div>
          </div>
          <p className="text-base tabular-nums text-slate-500">
            <span className={`text-xl font-bold ${payment.megaCredits > have.megaCredits ? 'text-red-400' : 'text-white'}`}>{payment.megaCredits}</span>
            {' '}/ {have.megaCredits}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {problem ? (
          <p role="alert" className="text-base font-medium text-red-400">{problem}</p>
        ) : (
          <p className="flex items-center gap-1.5 text-base text-slate-300">
            <Check size={18} className="text-emerald-400" />
            Pays {total} M€{total > rules.cost && <span className="text-amber-300"> — {total - rules.cost} more than needed</span>}
          </p>
        )}
        <div className="flex gap-2">
          <PlayButton disabled={busy} onClick={onCancel} className="!px-4 !py-2 !text-base">Cancel</PlayButton>
          <PlayButton variant="primary" disabled={busy || problem != null} onClick={() => onConfirm(payment)} className="!px-6 !py-2 !text-base">Pay</PlayButton>
        </div>
      </div>
    </div>
  );
}

/** The heat Helion spends in place of M€, kept within what the cost and the player allow. */
export function HeatAmount({ cost, player, value, onChange }: {
  cost: number;
  player: EnginePlayer;
  value: number;
  onChange: (heat: number) => void;
}) {
  const { min, max } = heatRange(cost, player);
  return (
    <div className="flex items-center gap-3 text-base text-slate-300">
      <ResourceIcon name="heat" />
      <Stepper label="Heat" value={value} min={min} max={max} onChange={onChange} />
      <span className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-white">
        <ResourceIcon name="mc" size="h-6 w-6" />
        <span>+ {Math.max(0, cost - value)} M€</span>
      </span>
    </div>
  );
}

interface HeatSplitFormProps {
  /** What is being paid for, e.g. "Asteroid"; left out where a heading already says it. */
  title?: string;
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold text-white">{title ?? 'Cost'}</p>
        <Coins amount={cost} className="text-2xl" />
      </div>
      <p className="text-sm text-slate-400">Heat can stand in for M€, one for one.</p>
      <HeatAmount cost={cost} player={player} value={heat} onChange={setHeat} />
      <div className="flex justify-end gap-2">
        <PlayButton disabled={busy} onClick={onCancel} className="!px-4 !py-2 !text-base">Cancel</PlayButton>
        <PlayButton variant="primary" disabled={busy} onClick={() => onConfirm(heat)} className="!px-6 !py-2 !text-base">Pay</PlayButton>
      </div>
    </div>
  );
}
