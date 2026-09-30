import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' };

export function PlayButton({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  const colors = variant === 'primary'
    ? 'bg-amber-600 hover:bg-amber-500 text-white'
    : 'bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10';
  return (
    <button
      type="button"
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colors} ${className}`}
      {...props}
    />
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

interface CardPickerProps {
  cardIds: string[];
  names: Record<string, string>;
  onPick: (cardId: string) => void;
  selected?: ReadonlySet<string>;
  /** Small label over a card, such as its cost. */
  badge?: (cardId: string) => string | undefined;
  disabled?: boolean;
}

/** A row of cards to click. With `selected`, clicking toggles; without, each click is a choice. */
export function CardPicker({ cardIds, names, onPick, selected, badge, disabled }: CardPickerProps) {
  if (cardIds.length === 0) return <p className="text-sm text-slate-500">No cards.</p>;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
      {cardIds.map(cardId => {
        const name = names[cardId] ?? cardId;
        const isSelected = selected?.has(cardId) ?? false;
        const label = badge?.(cardId);
        return (
          <button
            key={cardId}
            type="button"
            disabled={disabled}
            aria-pressed={selected ? isSelected : undefined}
            title={name}
            onClick={() => onPick(cardId)}
            className={`relative rounded text-left transition-[filter,box-shadow] hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed ${isSelected ? 'ring-2 ring-amber-400' : ''}`}
          >
            <img src={getCardImage(name) ?? getCardPlaceholderImage()} alt="" className="w-full rounded shadow-sm" />
            {label && (
              <span className="absolute top-0.5 left-0.5 rounded bg-black/80 px-1 text-[11px] font-bold text-amber-300">{label}</span>
            )}
            <span className="block text-[10px] text-center text-slate-300 truncate mt-0.5">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
