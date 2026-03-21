import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ALL_MAPS, type MapDefinition } from '@/data/mapHexes';
import { fetchGameLog, extractTilePlacement, assignPlayerColors } from '@/lib/gameLog';
import { ReplayMap, type PlacedTile } from '@/components/replay/ReplayMap';
import { MovePanel } from '@/components/replay/MovePanel';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { PlayerTableau } from '@/components/replay/PlayerTableau';
import type { GameLog } from '@/types/gamelog';

export function GameReplayPage() {
  const { tableId, playerId } = useParams<{ tableId: string; playerId: string }>();
  const [gameLog, setGameLog] = useState<GameLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [tableauPlayerId, setTableauPlayerId] = useState<string | null>(null);

  // --- data fetching ---
  useEffect(() => {
    if (!tableId || !playerId) return;
    setLoading(true);
    setError(null);
    fetchGameLog(tableId, playerId)
      .then(data => { setGameLog(data); setCurrentStep(0); })
      .catch(() => setError('Game not found.'))
      .finally(() => setLoading(false));
  }, [tableId, playerId]);

  // --- derived state ---
  const mapDefinition = useMemo<MapDefinition | undefined>(
    () => gameLog ? ALL_MAPS.find(m => m.dbName === gameLog.map) : undefined,
    [gameLog],
  );

  const playerColors = useMemo(
    () => gameLog ? assignPlayerColors(Object.keys(gameLog.players)) : {},
    [gameLog],
  );

  const placedTiles = useMemo(() => {
    if (!gameLog) return new Map<string, PlacedTile>();
    const map = new Map<string, PlacedTile>();
    for (let i = 0; i <= currentStep; i++) {
      const placement = extractTilePlacement(gameLog.moves[i]);
      if (placement) {
        map.set(placement.dbKey, {
          dbKey: placement.dbKey,
          tileType: placement.tileType,
          playerId: gameLog.moves[i].player_id,
          moveIndex: i,
        });
      }
    }
    return map;
  }, [gameLog, currentStep]);

  const offMapTiles = useMemo(() => {
    if (!mapDefinition) return [] as PlacedTile[];
    const hexKeys = new Set(mapDefinition.hexes.map(h => h.dbKey));
    return Array.from(placedTiles.values()).filter(t => !hexKeys.has(t.dbKey));
  }, [placedTiles, mapDefinition]);

  const playerTableaux = useMemo(() => {
    if (!gameLog) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const id of Object.keys(gameLog.players)) {
      map.set(id, []);
    }
    for (let i = 0; i <= currentStep; i++) {
      const move = gameLog.moves[i];
      if (move?.card_played) {
        map.get(move.player_id)?.push(move.card_played);
      }
    }
    return map;
  }, [gameLog, currentStep]);

  // --- jump ---
  const jumpTo = useCallback((target: number) => {
    if (!gameLog) return;
    setCurrentStep(Math.max(0, Math.min(target, gameLog.moves.length - 1)));
  }, [gameLog]);

  // --- keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!gameLog) return;
      if (e.key === 'ArrowLeft' && currentStep > 0) setCurrentStep(s => s - 1);
      else if (e.key === 'ArrowRight' && currentStep < gameLog.moves.length - 1) setCurrentStep(s => s + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameLog, currentStep]);

  // --- render ---
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-8">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        Loading game replay...
      </div>
    );
  }

  if (error || !gameLog) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
        {error ?? 'Game not found.'}
      </div>
    );
  }

  const currentMove = gameLog.moves[currentStep];
  const gameState = currentMove?.game_state;

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
          Game Replay {mapDefinition ? `\u2014 ${mapDefinition.name}` : ''}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          {gameLog.game_date && <span>{gameLog.game_date}</span>}
          {Object.entries(gameLog.players).map(([id, p]) => {
            const cardCount = playerTableaux.get(id)?.length ?? 0;
            return (
              <button
                key={id}
                onClick={() => setTableauPlayerId(id)}
                className="flex items-center gap-1.5 hover:underline"
              >
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: playerColors[id] }} />
                {p.player_name} ({p.corporation})
                <span className="text-xs bg-slate-200 dark:bg-slate-700 rounded-full px-1.5 py-0.5">{cardCount}</span>
              </button>
            );
          })}
          {gameLog.winner && (
            <span className="font-medium text-amber-600 dark:text-amber-400">Winner: {gameLog.winner}</span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          {mapDefinition ? (
            <ReplayMap
              mapDefinition={mapDefinition}
              placedTiles={placedTiles}
              playerColors={playerColors}
              currentStep={currentStep}
            />
          ) : (
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-8 text-center text-slate-500 dark:text-slate-400">
              Map &ldquo;{gameLog.map}&rdquo; not available for visualization.
            </div>
          )}

          {offMapTiles.length > 0 && (
            <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">Off-map tiles:</span>{' '}
              {offMapTiles.map((t, i) => (
                <span key={t.dbKey}>
                  {i > 0 && ', '}
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ backgroundColor: playerColors[t.playerId] }} />
                  {t.dbKey} ({t.tileType} &mdash; {gameLog.players[t.playerId]?.player_name ?? t.playerId})
                </span>
              ))}
            </div>
          )}
        </div>

        <MovePanel move={currentMove} gameState={gameState} playerColors={playerColors} />
      </div>

      <ReplayControls
        currentStep={currentStep}
        totalMoves={gameLog.moves.length}
        gameState={gameState}
        isAnimating={false}
        onPrev={() => setCurrentStep(s => s - 1)}
        onNext={() => setCurrentStep(s => s + 1)}
        onJump={jumpTo}
      />

      {tableauPlayerId && gameLog.players[tableauPlayerId] && (
        <PlayerTableau
          playerName={gameLog.players[tableauPlayerId].player_name}
          corporation={gameLog.players[tableauPlayerId].corporation}
          color={playerColors[tableauPlayerId]}
          cards={playerTableaux.get(tableauPlayerId) ?? []}
          onClose={() => setTableauPlayerId(null)}
        />
      )}
    </div>
  );
}
