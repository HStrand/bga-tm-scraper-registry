import { getIcon, oxygenImg, resourceIcons, temperatureImg } from '@/components/replay/replayShared';
import { getCardPlaceholderImage } from '@/lib/card';
import { getCardResourceType } from '@/lib/cardMetadata';
import { optionArt, type ArtIcon, type ArtPart } from '@/lib/engine/optionArt';
import type { OptionPrompt } from '@/lib/engine/prompts';
import type { EnginePlayer, MoveBody } from '@/lib/engine/types';
import { cardImage, PlayButton } from './controls';

/** The picture for something spent or gained. Terraform rating has no icon of its own. */
export function ArtIconImage({ icon, className = 'h-9 w-9' }: { icon: ArtIcon; className?: string }) {
  if (icon === 'tr') {
    return <span className={`${className} flex items-center justify-center rounded-md bg-amber-500 text-sm font-extrabold text-slate-950`}>TR</span>;
  }
  const src = icon === 'temperature' ? temperatureImg
    : icon === 'oxygen' ? oxygenImg
    : icon === 'card' ? getCardPlaceholderImage()
    : getIcon(resourceIcons, icon);
  if (!src) return null;
  return <img src={src} alt="" draggable={false} className={`${className} object-contain ${icon === 'card' ? 'rounded-[3px]' : ''}`} />;
}

function Part({ part, sign }: { part: ArtPart; sign: '+' | '−' }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`text-2xl font-extrabold tabular-nums ${sign === '+' ? 'text-emerald-300' : 'text-rose-300'}`}>
        {part.upTo && <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">up to</span>}
        {sign}{part.amount}
      </span>
      <span className={part.production ? 'rounded-md bg-[#7a4a1e] p-1 ring-1 ring-black/40' : ''}>
        <ArtIconImage icon={part.icon} className={part.production ? 'h-7 w-7' : 'h-9 w-9'} />
      </span>
    </span>
  );
}

interface OptionChoiceProps {
  prompt: OptionPrompt;
  player: EnginePlayer;
  names: Record<string, string>;
  busy: boolean;
  onMove: (move: MoveBody) => void;
}

/**
 * A choice between a few options. Options that add, remove or trade resources are drawn with their icons;
 * the card the choice comes from is shown beside them with what is on it now.
 */
export function OptionChoice({ prompt, player, names, busy, onMove }: OptionChoiceProps) {
  const sourceId = prompt.sourceCardId ?? null;
  const sourceName = sourceId ? names[sourceId] ?? sourceId : null;
  const resourceType = sourceName ? getCardResourceType(sourceName) : undefined;
  const resourceIcon = resourceType ? getIcon(resourceIcons, resourceType) : undefined;
  const onCard = sourceId ? player.cardResources[sourceId] ?? 0 : 0;

  const options = prompt.options.map(option => ({ ...option, art: optionArt(option.label) }));
  const illustrated = options.some(o => o.art);

  if (!illustrated && !sourceName) {
    return (
      <div className="flex flex-col items-stretch gap-2">
        {options.map((option, i) => (
          <PlayButton key={i} variant="primary" disabled={busy} onClick={() => onMove(option.move)}>{option.label}</PlayButton>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-4">
      {sourceName && (
        <div className="relative w-[150px] flex-shrink-0 self-center">
          <img src={cardImage(sourceName)} alt={sourceName} className="block w-full rounded-[9px] shadow-lg" draggable={false} />
          {resourceIcon && (
            <span
              className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-black/85 px-3 py-1 text-lg font-bold tabular-nums text-white shadow-lg"
              title={`${onCard} on ${sourceName}`}
            >
              <img src={resourceIcon} alt="" className="h-6 w-6 object-contain" />
              {onCard}
            </span>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
        {options.map((option, i) => (
          <button
            key={i}
            type="button"
            disabled={busy}
            onClick={() => onMove(option.move)}
            className="group rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-amber-400/70 hover:bg-amber-400/10 focus:outline-none focus-visible:border-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {option.art && (
              <span aria-hidden="true" className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {option.art.spend.map((part, j) => <Part key={`s${j}`} part={part} sign="−" />)}
                {option.art.spend.length > 0 && option.art.gain.length > 0 && <span className="text-2xl text-slate-400">→</span>}
                {option.art.gain.map((part, j) => <Part key={`g${j}`} part={part} sign="+" />)}
              </span>
            )}
            <span className={`block text-slate-200 group-hover:text-white ${option.art ? 'text-sm' : 'text-base font-semibold'}`}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
