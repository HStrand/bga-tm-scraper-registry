import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import type { GameLogMove } from '@/types/gamelog';
import { getCubeImage } from './replayShared';

interface MoveLogProps {
  move: GameLogMove | undefined;
  playerColors: Record<string, string>;
}

export function MoveLog({ move, playerColors }: MoveLogProps) {
  if (!move) return null;

  const cardImage = move.card_played
    ? getCardImage(move.card_played) ?? getCardPlaceholderImage()
    : null;

  return (
    <div className="glass-panel rounded-xl p-3 space-y-2">
      {/* Move description */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          {getCubeImage(playerColors[move.player_id]) ? (
            <img src={getCubeImage(playerColors[move.player_id])!} alt="" className="w-5 h-5 flex-shrink-0" />
          ) : (
            <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: playerColors[move.player_id] }} />
          )}
          <span className="font-bold text-white text-sm">
            {move.player_name}
          </span>
          <span className="text-xs text-slate-500">{move.action_type}</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{move.description}</p>
        {move.tile_placed && move.tile_location && (
          <p className="text-[11px] text-slate-400 mt-0.5">
            Placed {move.tile_placed} at {move.tile_location}
          </p>
        )}
      </div>

      {/* Card image */}
      {move.card_played && cardImage && (
        <div>
          <p className="text-xs font-medium text-slate-300 mb-1">
            {move.card_played}
            {move.card_cost != null && (
              <span className="text-slate-500 ml-1">({move.card_cost} MC)</span>
            )}
          </p>
          <img
            src={cardImage}
            alt={move.card_played}
            className="w-full rounded-lg shadow-lg shadow-black/30"
          />
        </div>
      )}
    </div>
  );
}
