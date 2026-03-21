import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import type { GameLogMove, GameState } from '@/types/gamelog';

function Badge({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
      {label}: <span className="font-bold">{value}</span>
    </span>
  );
}

interface MovePanelProps {
  move: GameLogMove | undefined;
  gameState: GameState | undefined;
  playerColors: Record<string, string>;
}

export function MovePanel({ move, gameState, playerColors }: MovePanelProps) {
  const cardImage = move?.card_played
    ? getCardImage(move.card_played) ?? getCardPlaceholderImage()
    : null;

  return (
    <div className="lg:w-80 space-y-4">
      {gameState && (
        <div className="flex flex-wrap gap-2">
          <Badge label="Gen" value={gameState.generation} />
          <Badge label="Temp" value={gameState.temperature != null ? `${gameState.temperature}\u00B0C` : null} />
          <Badge label="O2" value={gameState.oxygen != null ? `${gameState.oxygen}%` : null} />
          <Badge label="Oceans" value={gameState.oceans != null ? `${gameState.oceans}/9` : null} />
          <Badge label="Draw" value={gameState.draw_pile} />
          <Badge label="Discard" value={gameState.discard_pile} />
        </div>
      )}

      {move && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: playerColors[move.player_id] }}
            />
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {move.player_name}
            </span>
            <span className="text-xs text-slate-400">{move.action_type}</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">{move.description}</p>
          {move.tile_placed && move.tile_location && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Placed {move.tile_placed} at {move.tile_location}
            </p>
          )}
        </div>
      )}

      {move?.card_played && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {move.card_played}
            {move.card_cost != null && (
              <span className="text-slate-400 ml-1">({move.card_cost} MC)</span>
            )}
          </p>
          <img
            src={cardImage!}
            alt={move.card_played}
            className="w-64 rounded-lg shadow"
          />
        </div>
      )}
    </div>
  );
}
