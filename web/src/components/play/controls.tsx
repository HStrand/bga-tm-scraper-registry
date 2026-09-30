import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' };

export function PlayButton({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  const colors = variant === 'primary'
    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.35)]'
    : 'bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10';
  return (
    <button
      type="button"
      className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${colors} ${className}`}
      {...props}
    />
  );
}

export const cardImage = (name: string) => getCardImage(name) ?? getCardPlaceholderImage();

interface DialogProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Shown when the dialog can simply be closed (it is not a decision the game is waiting on). */
  onClose?: () => void;
  wide?: boolean;
}

/**
 * A decision in front of the board. It can be tucked away to look at the board and brought back, since
 * most decisions depend on what is on it.
 */
export function Dialog({ title, subtitle, children, onClose, wide }: DialogProps) {
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="fixed left-1/2 top-16 z-[60] -translate-x-1/2 play-panel play-active px-4 py-2 text-sm font-semibold text-amber-200"
      >
        ▼ Back to: {title}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={`play-panel play-active max-h-[88vh] overflow-y-auto scrollbar-subtle p-5 ${wide ? 'w-[min(1100px,94vw)]' : 'w-[min(560px,94vw)]'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            {subtitle && <div className="text-sm text-slate-400">{subtitle}</div>}
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <PlayButton onClick={() => setHidden(true)} title="Hide this to look at the board and the cards">Hide — see the board</PlayButton>
            {onClose && <PlayButton onClick={onClose}>Close</PlayButton>}
          </div>
        </div>
        {children}
      </div>
    </div>
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
  /** Card width in pixels. */
  size?: number;
}

/** A row of cards to click. With `selected`, clicking toggles; without, each click is a choice. */
export function CardPicker({ cardIds, names, onPick, selected, badge, disabled, size = 170 }: CardPickerProps) {
  if (cardIds.length === 0) return <p className="text-sm text-slate-500">No cards.</p>;
  return (
    <div className="flex flex-wrap justify-center gap-3">
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
            aria-label={name}
            title={name}
            onClick={() => onPick(cardId)}
            style={{ width: size }}
            className={`relative rounded-[9px] transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-1 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed ${isSelected ? 'ring-2 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.55)]' : selected ? 'brightness-75' : ''}`}
          >
            <img src={cardImage(name)} alt="" className="block w-full rounded-[9px] shadow-lg" draggable={false} />
            {label && (
              <span className="absolute left-1 top-1 rounded bg-black/85 px-1.5 text-xs font-bold text-amber-300">{label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
