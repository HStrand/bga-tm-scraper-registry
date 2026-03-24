import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Info } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { ALL_MAPS, type MapDefinition } from '@/data/mapHexes';
import { fetchGameLog, extractTilePlacement, parseTileLocationToDbKey, assignPlayerColors } from '@/lib/gameLog';
import { ReplayMap, type PlacedTile } from '@/components/replay/ReplayMap';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { GlobalParamsBar } from '@/components/replay/GlobalParamsBar';
import { MoveLog } from '@/components/replay/MoveLog';
import { PlayerCard } from '@/components/replay/PlayerCard';
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
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<string>>(new Set());
  const collapseTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handlePlayerExpand = useCallback((pid: string) => {
    const existing = collapseTimeouts.current.get(pid);
    if (existing) {
      clearTimeout(existing);
      collapseTimeouts.current.delete(pid);
    }
    setExpandedPlayerIds(prev => {
      if (prev.has(pid)) return prev;
      const next = new Set(prev);
      next.add(pid);
      return next;
    });
  }, []);

  const handlePlayerCollapse = useCallback((pid: string) => {
    collapseTimeouts.current.set(pid, setTimeout(() => {
      collapseTimeouts.current.delete(pid);
      setExpandedPlayerIds(prev => {
        if (!prev.has(pid)) return prev;
        const next = new Set(prev);
        next.delete(pid);
        return next;
      });
    }, 150));
  }, []);

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

  const playerElos = useMemo(
    () => gameLog
      ? Object.fromEntries(Object.entries(gameLog.players).map(([id, p]) => [id, p.elo_data?.game_rank ?? null]))
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

  // --- missing features detection ---
  const missingFeatures = useMemo(() => {
    if (!gameLog) return [];
    const missing: { key: string; label: string }[] = [];
    const hasPlayerHands = gameLog.moves.some(m => m.game_state?.player_hands);
    const hasCardsDiscarded = gameLog.moves.some(m => m.cards_discarded);
    const hasSpecialTiles = gameLog.moves.some(m => m.game_state?.special_tiles);
    if (!hasPlayerHands) missing.push({ key: 'player_hands', label: 'Player hands' });
    if (!hasCardsDiscarded) missing.push({ key: 'cards_discarded', label: 'Cards discarded' });
    if (!hasSpecialTiles) missing.push({ key: 'special_tiles', label: 'Special tile placements' });
    return missing;
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
      <div className="flex items-center gap-2 text-slate-400 py-8">
        <div className="w-5 h-5 border-2 border-slate-600 border-t-amber-500 rounded-full animate-spin" />
        Loading game replay...
      </div>
    );
  }

  if (error || !gameLog) {
    return (
      <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-4 text-red-300">
        {error ?? 'Game not found.'}
      </div>
    );
  }

  const currentMove = gameLog.moves[currentStep];
  const gameState = currentMove?.game_state;

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white mb-1 tracking-tight glow-white">
          Table {tableId}
          {mapDefinition && (
            <span className="text-slate-400 font-normal" style={{ textShadow: 'none' }}> &mdash; {mapDefinition.name}</span>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          {gameLog.game_date && <span>{gameLog.game_date}</span>}
          {gameLog.game_speed && <span className="text-slate-500">{gameLog.game_speed}</span>}
          {([
            ['Prelude', gameLog.prelude_on],
            ['Colonies', gameLog.colonies_on],
            ['Draft', gameLog.draft_on],
            ['Corp Era', gameLog.corporate_era_on],
          ] as const).map(([label, val]) => val != null && (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${val ? 'bg-green-500 glow-green' : 'bg-slate-600'}`} />
              <span className={val ? 'text-slate-300' : 'text-slate-500'}>{label}</span>
            </span>
          ))}
          {gameLog.winner && currentStep === gameLog.moves.length - 1 && (
            <span className="font-medium text-amber-400 glow-amber">Winner: {gameLog.winner}</span>
          )}
        </div>
      </div>

      {missingFeatures.length > 0 && (
        <div className="mb-4 w-fit bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2 text-sm text-amber-300 flex items-center gap-2">
          <span>Older scraper version. Some features are missing.</span>
          <div className="relative group flex-shrink-0">
            <Info className="w-4 h-4 cursor-help text-amber-400" />
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover:block z-50 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap border border-slate-700">
              <p className="font-medium mb-1">Missing features:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {missingFeatures.map(f => <li key={f.key}>{f.label}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main content — 3 column layout */}
      <div className="flex gap-4">
        {/* Left: Player cards */}
        <div className="w-[320px] flex-shrink-0 space-y-3">
          {gameState?.player_vp && Object.keys(gameState.player_vp).map(pid => {
            const tableau = playerTableaux.get(pid);
            return (
              <PlayerCard
                key={pid}
                playerId={pid}
                playerName={playerNames[pid] ?? pid}
                corporation={playerCorporations[pid] ?? ''}
                color={playerColors[pid] ?? '#888'}
                elo={playerElos?.[pid] ?? null}
                vp={gameState.player_vp?.[pid]}
                trackers={gameState.player_trackers?.[pid]}
                tileCounts={playerTileCounts?.[pid]}
                isStartingPlayer={gameState.starting_player === pid}
                isExpanded={expandedPlayerIds.has(pid)}
                onExpand={() => handlePlayerExpand(pid)}
                onCollapse={() => handlePlayerCollapse(pid)}
                headquarters={tableau?.headquarters ?? []}
                played={tableau?.played ?? []}
                hand={tableau?.hand ?? []}
                sold={tableau?.sold ?? []}
                cardResources={tableau?.cardResources ?? {}}
              />
            );
          })}
        </div>

        {/* Center: Map + controls */}
        <div className="flex-1 min-w-0 text-center">
          {mapDefinition ? (
            <ReplayMap
              mapDefinition={mapDefinition}
              placedTiles={placedTiles}
              playerColors={playerColors}
              currentStep={currentStep}
            />
          ) : (
            <div className="glass-panel rounded-xl p-8 text-center text-slate-400">
              Map &ldquo;{gameLog.map}&rdquo; not available for visualization.
            </div>
          )}

          {offMapTiles.length > 0 && (
            <div className="mt-3 text-sm text-slate-400 text-left">
              <span className="font-medium text-slate-300">Off-map tiles:</span>{' '}
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

        {/* Right: Global params + Move log */}
        <div className="w-[380px] flex-shrink-0 space-y-3 lg:self-start lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto scrollbar-hidden">
          <GlobalParamsBar gameState={gameState} onOpenDiscardPile={() => setShowDiscardPile(true)} />
          <MoveLog moves={gameLog.moves} currentStep={currentStep} generationBoundaries={generationBoundaries} playerColors={playerColors} onJump={jumpTo} />
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
