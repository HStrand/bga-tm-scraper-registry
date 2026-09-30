import type { PlayableCard } from '@/lib/engine/types';
import { cardImage } from './controls';

const CARD_WIDTH = 150;
/** Card art is 556 x 686. */
const CARD_HEIGHT = Math.round(CARD_WIDTH * 686 / 556);

interface HandProps {
  /** Card ids, in the order the engine holds them. */
  cardIds: string[];
  names: Record<string, string>;
  /** The cards that can be played right now, with what they would cost. */
  playable: PlayableCard[];
  ownerName: string;
  /** Width the fan may take up, in pixels. */
  maxWidth: number;
  onPick: (cardId: string) => void;
}

/**
 * The hand of the player to move, fanned along the bottom edge with the tops of the cards showing.
 * Cards that can be played glow; resting on one lifts it, and clicking it holds it up to read and play.
 */
export function Hand({ cardIds, names, playable, ownerName, maxWidth, onPick }: HandProps) {
  const canPlay = new Map(playable.map(card => [card.cardId, card]));
  // Spread the cards out when there is room, overlap them when there is not.
  const step = cardIds.length > 1 ? Math.min(CARD_WIDTH + 8, Math.max(24, (maxWidth - CARD_WIDTH) / (cardIds.length - 1))) : 0;
  const width = cardIds.length > 0 ? CARD_WIDTH + step * (cardIds.length - 1) : 0;

  return (
    <div className="pointer-events-none flex flex-col items-center" aria-label={`${ownerName}'s hand`}>
      <p className="mb-3 rounded-full bg-black/60 px-3 py-0.5 text-xs text-slate-400">
        <span className="font-semibold text-slate-200">{ownerName}</span>
        {' · '}{cardIds.length} card{cardIds.length === 1 ? '' : 's'}
        {playable.length > 0 && <span className="text-amber-300"> · {playable.length} playable</span>}
      </p>
      <div className="pointer-events-auto relative" style={{ width, height: Math.round(CARD_HEIGHT * 0.54) }}>
        {cardIds.map((cardId, i) => {
          const name = names[cardId] ?? cardId;
          const card = canPlay.get(cardId);
          return (
            <button
              key={cardId}
              type="button"
              onClick={() => onPick(cardId)}
              aria-label={card ? `${name}, playable for ${card.effectiveCost} M€` : `${name}, not playable now`}
              className={`hand-card absolute top-0 ${card ? 'playable' : ''}`}
              style={{ left: i * step, width: CARD_WIDTH, zIndex: i }}
            >
              <img src={cardImage(name)} alt="" className="block w-full rounded-[9px]" draggable={false} />
              {card && (
                <span className="absolute -top-2 left-1 rounded-md bg-amber-400 px-1.5 text-xs font-bold text-slate-950 shadow">
                  {card.effectiveCost}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
