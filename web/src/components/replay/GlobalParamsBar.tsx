import { getCardPlaceholderImage } from '@/lib/card';
import type { GameState } from '@/types/gamelog';
import { Badge, temperatureImg, oxygenImg, oceanImg } from './replayShared';

interface GlobalParamsBarProps {
  gameState: GameState | undefined;
  onOpenDiscardPile?: () => void;
}

export function GlobalParamsBar({ gameState, onOpenDiscardPile }: GlobalParamsBarProps) {
  if (!gameState) return null;
  return (
    <div className="glass-panel rounded-xl p-3">
      <div className="flex flex-wrap gap-2">
        <Badge label="Gen" value={gameState.generation} large />
        <Badge label="Temp" value={gameState.temperature != null ? `${gameState.temperature}\u00B0C` : null} icon={temperatureImg} hideLabel large />
        <Badge label="O2" value={gameState.oxygen != null ? `${gameState.oxygen}%` : null} icon={oxygenImg} hideLabel large />
        <Badge label="Oceans" value={gameState.oceans != null ? `${gameState.oceans}/9` : null} icon={oceanImg} hideLabel large />
        <Badge label="Draw" value={gameState.draw_pile ?? 0} icon={getCardPlaceholderImage()} />
        {onOpenDiscardPile ? (
          <button onClick={onOpenDiscardPile} className="hover:opacity-80 transition-opacity">
            <Badge label="Discard" value={gameState.discard_pile ?? 0} icon={getCardPlaceholderImage()} />
          </button>
        ) : (
          <Badge label="Discard" value={gameState.discard_pile ?? 0} icon={getCardPlaceholderImage()} />
        )}
      </div>
    </div>
  );
}
