import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ALL_MAPS, type MapDefinition } from '@/data/mapHexes';
import { fetchGameLog, extractTilePlacement, parseTileLocationToDbKey, assignPlayerColors } from '@/lib/gameLog';
import { ReplayMap, type PlacedTile } from '@/components/replay/ReplayMap';
import { MovePanel } from '@/components/replay/MovePanel';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { PlayerTableau } from '@/components/replay/PlayerTableau';
import { DiscardPileModal } from '@/components/replay/DiscardPileModal';
import type { GameLog } from '@/types/gamelog';

export function GameReplayPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const [gameLog, setGameLog] = useState<GameLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [tableauPlayerId, setTableauPlayerId] = useState<string | null>(null);
  const [showDiscardPile, setShowDiscardPile] = useState(false);

  // --- data fetching ---
  useEffect(() => {
    if (!tableId) return;
    setLoading(true);
    setError(null);
    fetchGameLog(tableId)
      .then(data => { setGameLog(data); setCurrentStep(0); })
      .catch(() => setError('Game not found.'))
      .finally(() => setLoading(false));
  }, [tableId]);

  // --- derived state ---
  const mapDefinition = useMemo<MapDefinition | undefined>(
    () => gameLog ? ALL_MAPS.find(m => m.dbName === gameLog.map) : undefined,
    [gameLog],
  );

  const playerColors = useMemo(
    () => gameLog ? assignPlayerColors(Object.keys(gameLog.players), gameLog.players) : {},
    [gameLog],
  );

  const playerNames = useMemo(
    () => gameLog
      ? Object.fromEntries(Object.entries(gameLog.players).map(([id, p]) => [id, p.player_name]))
      : {},
    [gameLog],
  );

  const playerCorporations = useMemo(
    () => gameLog
      ? Object.fromEntries(Object.entries(gameLog.players).map(([id, p]) => [id, p.corporation]))
      : {},
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
      // Merge special tiles from game_state
      const specialTiles = gameLog.moves[i]?.game_state?.special_tiles;
      if (specialTiles) {
        for (const [pid, tiles] of Object.entries(specialTiles)) {
          for (const [tileName, location] of Object.entries(tiles)) {
            const dbKey = parseTileLocationToDbKey(location);
            if (!map.has(dbKey)) {
              map.set(dbKey, { dbKey, tileType: tileName, playerId: pid, moveIndex: i });
            } else {
              // Update existing tile with special type info
              const existing = map.get(dbKey)!;
              existing.tileType = tileName;
            }
          }
        }
      }
    }
    return map;
  }, [gameLog, currentStep]);

  const playerTileCounts = useMemo(() => {
    const counts: Record<string, { cities: number; greeneries: number; total: number }> = {};
    for (const tile of placedTiles.values()) {
      const t = tile.tileType.toLowerCase();
      if (t === 'ocean') continue; // oceans are not player-owned tiles
      if (!counts[tile.playerId]) counts[tile.playerId] = { cities: 0, greeneries: 0, total: 0 };
      const c = counts[tile.playerId];
      c.total++;
      if (t === 'city' || t.includes('capital')) c.cities++;
      else if (t === 'forest' || t === 'greenery') c.greeneries++;
    }
    return counts;
  }, [placedTiles]);

  const offMapTiles = useMemo(() => {
    if (!mapDefinition) return [] as PlacedTile[];
    const hexKeys = new Set(mapDefinition.hexes.map(h => h.dbKey));
    return Array.from(placedTiles.values()).filter(t => !hexKeys.has(t.dbKey));
  }, [placedTiles, mapDefinition]);

  const generationBoundaries = useMemo(() => {
    if (!gameLog) return new Map<number, { start: number; end: number }>();
    const map = new Map<number, { start: number; end: number }>();
    for (let i = 0; i < gameLog.moves.length; i++) {
      const gen = gameLog.moves[i]?.game_state?.generation;
      if (gen == null) continue;
      const entry = map.get(gen);
      if (!entry) {
        map.set(gen, { start: i, end: i });
      } else {
        entry.end = i;
      }
    }
    return map;
  }, [gameLog]);

  // Build a set of prelude card names per player for separation
  const playerPreludeNames = useMemo(() => {
    if (!gameLog) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    for (const [id, p] of Object.entries(gameLog.players)) {
      const preludes = p.starting_hand?.preludes;
      map.set(id, preludes ? new Set(preludes) : new Set());
    }
    return map;
  }, [gameLog]);

  const playerTableaux = useMemo(() => {
    if (!gameLog) return new Map<string, { headquarters: string[]; played: string[]; hand: string[]; sold: string[]; cardResources: Record<string, number> }>();
    const map = new Map<string, { headquarters: string[]; played: string[]; hand: string[]; sold: string[]; cardResources: Record<string, number> }>();
    for (const [id, p] of Object.entries(gameLog.players)) {
      // Corporation is always first in headquarters
      map.set(id, { headquarters: [p.corporation], played: [], hand: [], sold: [], cardResources: {} });
    }
    // First pass: collect all played cards per player
    const allPlayed = new Map<string, string[]>();
    for (const id of Object.keys(gameLog.players)) allPlayed.set(id, []);
    for (let i = 0; i <= currentStep; i++) {
      const move = gameLog.moves[i];
      if (move?.card_played) {
        allPlayed.get(move.player_id)?.push(move.card_played);
      }
    }
    for (let i = 0; i <= currentStep; i++) {
      const move = gameLog.moves[i];
      // Use the hand snapshot when available (keyed by player id in game_state)
      const playerHands = move?.game_state?.player_hands;
      if (playerHands) {
        for (const [pid, hand] of Object.entries(playerHands)) {
          const entry = map.get(pid);
          if (entry) entry.hand = [...hand];
        }
      }
      // Track sold cards
      if (move?.cards_sold) {
        const entry = map.get(move.player_id);
        if (entry) {
          for (const card of move.cards_sold) entry.sold.push(card);
        }
      }
      // Extract card resources from game_state.player_vp.details.card_resources
      const playerVp = move?.game_state?.player_vp;
      if (playerVp) {
        for (const [pid, vp] of Object.entries(playerVp)) {
          const cr = vp.details?.card_resources;
          if (cr) {
            const entry = map.get(pid);
            if (entry) {
              const resources: Record<string, number> = {};
              for (const [cardName, res] of Object.entries(cr)) {
                resources[cardName] = res.count;
              }
              entry.cardResources = resources;
            }
          }
        }
      }
    }
    // Reconcile: played cards that are no longer in hand go to played/headquarters
    for (const [pid, cards] of allPlayed) {
      const entry = map.get(pid);
      if (!entry) continue;
      const handSet = new Set(entry.hand);
      for (const card of cards) {
        if (!handSet.has(card)) {
          const preludeNames = playerPreludeNames.get(pid);
          if (preludeNames?.has(card)) {
            entry.headquarters.push(card);
          } else {
            entry.played.push(card);
          }
        }
      }
    }
    return map;
  }, [gameLog, currentStep, playerPreludeNames]);

  const discardPile = useMemo(() => {
    if (!gameLog) return [];
    const cards: string[] = [];
    for (let i = 0; i <= currentStep; i++) {
      const move = gameLog.moves[i];
      if (move?.cards_discarded) cards.push(...move.cards_discarded);
      if (move?.cards_sold) cards.push(...move.cards_sold);
    }
    return cards;
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
          {gameLog.winner && currentStep === gameLog.moves.length - 1 && (
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

          <ReplayControls
            currentStep={currentStep}
            totalMoves={gameLog.moves.length}
            gameState={gameState}
            isAnimating={false}
            onPrev={() => setCurrentStep(s => s - 1)}
            onNext={() => setCurrentStep(s => s + 1)}
            onJump={jumpTo}
            generationBoundaries={generationBoundaries}
          />
        </div>

        <div className="lg:w-80 lg:self-start lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto flex-shrink-0">
          <MovePanel move={currentMove} gameState={gameState} playerColors={playerColors} playerNames={playerNames} playerCorporations={playerCorporations} playerTileCounts={playerTileCounts} onOpenTableau={setTableauPlayerId} onOpenDiscardPile={() => setShowDiscardPile(true)} />
        </div>
      </div>

      {tableauPlayerId && gameLog.players[tableauPlayerId] && (
        <PlayerTableau
          playerName={gameLog.players[tableauPlayerId].player_name}
          corporation={gameLog.players[tableauPlayerId].corporation}
          color={playerColors[tableauPlayerId]}
          headquarters={playerTableaux.get(tableauPlayerId)?.headquarters ?? []}
          played={playerTableaux.get(tableauPlayerId)?.played ?? []}
          hand={playerTableaux.get(tableauPlayerId)?.hand ?? []}
          sold={playerTableaux.get(tableauPlayerId)?.sold ?? []}
          cardResources={playerTableaux.get(tableauPlayerId)?.cardResources ?? {}}
          onClose={() => setTableauPlayerId(null)}
        />
      )}

      {showDiscardPile && (
        <DiscardPileModal cards={discardPile} onClose={() => setShowDiscardPile(false)} />
      )}
    </div>
  );
}
