import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Info, Share2, Check, Copy } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ALL_MAPS, type MapDefinition } from '@/data/mapHexes';
import { fetchGameLog, extractTilePlacement, parseTileLocationToDbKey, assignPlayerColors } from '@/lib/gameLog';
import { getMapOverlays } from '@/data/mapOverlays';
import { parseMilestonesAndAwards } from '@/lib/replayUtils';
import { ReplayMap, type PlacedTile } from '@/components/replay/ReplayMap';
import { ReplayControls } from '@/components/replay/ReplayControls';
import { GlobalParamsBar } from '@/components/replay/GlobalParamsBar';
import { MoveLog } from '@/components/replay/MoveLog';
import { PlayerCard } from '@/components/replay/PlayerCard';
import { PlayerTableau } from '@/components/replay/PlayerTableau';
import { DiscardPileModal } from '@/components/replay/DiscardPileModal';
import { StartingHandModal, type StartingHandPlayerData } from '@/components/replay/StartingHandModal';
import { DraftModal, type DraftData, type DraftPlayerData } from '@/components/replay/DraftModal';
import type { GameLog } from '@/types/gamelog';

export function GameReplayPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const [searchParams] = useSearchParams();
  const [gameLog, setGameLog] = useState<GameLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [tableauPlayerId, setTableauPlayerId] = useState<string | null>(null);
  const [showDiscardPile, setShowDiscardPile] = useState(false);
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<string>>(new Set());
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareIncludeMove, setShareIncludeMove] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);
  const [startingHandOpen, setStartingHandOpen] = useState(true);
  const [draftOpen, setDraftOpen] = useState(false);
  const prevDraftGen = useRef<number | null>(null);
  const [mapScale, setMapScale] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
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
      .then(data => {
        setGameLog(data);
        const moveParam = parseInt(searchParams.get('move') ?? '', 10);
        const initial = !isNaN(moveParam) && moveParam >= 1 ? Math.min(moveParam - 1, data.moves.length - 1) : 0;
        setCurrentStep(initial);
      })
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
      ? Object.fromEntries(Object.entries(gameLog.players).map(([id, p]) => {
          const rank = p.elo_data?.game_rank;
          const change = p.elo_data?.game_rank_change ?? 0;
          return [id, rank != null ? rank - change : null];
        }))
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
    const overlays = getMapOverlays(mapDefinition.name);
    const renderedOffMap = new Set(overlays.offMapTiles?.map(t => t.name) ?? []);
    return Array.from(placedTiles.values()).filter(t => !hexKeys.has(t.dbKey) && !renderedOffMap.has(t.dbKey));
  }, [placedTiles, mapDefinition]);

  const { claimedMilestones, fundedAwards } = useMemo(() => {
    if (!gameLog) return { claimedMilestones: new Map(), fundedAwards: new Map() };
    return parseMilestonesAndAwards(gameLog.moves, currentStep);
  }, [gameLog, currentStep]);

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
    // Determine which players have selected their starting hand by currentStep
    const hasKept = new Set<string>();
    for (let i = 0; i <= currentStep; i++) {
      const ck = gameLog.moves[i]?.cards_kept;
      if (ck) for (const pid of Object.keys(ck)) hasKept.add(pid);
    }
    for (const [id, p] of Object.entries(gameLog.players)) {
      // Only show corporation in headquarters after it's been selected
      const showCorp = !p.starting_hand || hasKept.has(id);
      map.set(id, { headquarters: showCorp ? [p.corporation] : [], played: [], hand: [], sold: [], cardResources: {} });
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
    // Move kept preludes and corporation cards from hand to headquarters
    for (const [pid, entry] of map) {
      const preludeNames = playerPreludeNames.get(pid);
      const corp = gameLog.players[pid]?.corporation;
      const isHQ = (c: string) => (preludeNames?.has(c)) || (corp && c === corp);
      const kept = entry.hand.filter(isHQ);
      if (kept.length > 0) {
        entry.hand = entry.hand.filter(c => !isHQ(c));
        for (const card of kept) {
          if (!entry.headquarters.includes(card)) entry.headquarters.push(card);
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
            if (!entry.headquarters.includes(card)) entry.headquarters.push(card);
          } else {
            entry.played.push(card);
          }
        }
      }
    }
    return map;
  }, [gameLog, currentStep, playerPreludeNames]);

  // Build starting hand data for the modal — sensitive to currentStep
  const startingHandData = useMemo(() => {
    if (!gameLog) return null;
    const hasAny = Object.values(gameLog.players).some(p => p.starting_hand);
    if (!hasAny) return null;

    // Find the move index where each player's cards_kept appears
    const keptMoveByPlayer = new Map<string, number>();
    const keptCardsByPlayer = new Map<string, string[]>();
    for (let i = 0; i < gameLog.moves.length; i++) {
      const move = gameLog.moves[i];
      if (move.cards_kept) {
        for (const [pid, cards] of Object.entries(move.cards_kept)) {
          if (!keptMoveByPlayer.has(pid)) {
            keptMoveByPlayer.set(pid, i);
            keptCardsByPlayer.set(pid, cards);
          }
        }
      }
    }

    // If all players have kept and currentStep is past all of them, hide the modal entirely
    const pids = Object.keys(gameLog.players).filter(pid => gameLog.players[pid].starting_hand);
    const lastKeptMove = Math.max(...pids.map(pid => keptMoveByPlayer.get(pid) ?? -1));
    if (lastKeptMove >= 0 && currentStep > lastKeptMove) return null;

    const result: Record<string, StartingHandPlayerData> = {};
    for (const pid of pids) {
      const player = gameLog.players[pid];
      const keptAt = keptMoveByPlayer.get(pid);
      const hasKept = keptAt != null && currentStep >= keptAt;
      const tableau = playerTableaux.get(pid);

      // Kept preludes: from headquarters (only relevant after kept)
      const keptPreludes = hasKept
        ? (tableau?.headquarters ?? []).filter(c => player.starting_hand?.preludes?.includes(c))
        : [];

      // Kept project cards: from cards_kept data
      const keptProjectCards = hasKept ? (keptCardsByPlayer.get(pid) ?? []) : [];

      result[pid] = {
        playerName: player.player_name,
        color: playerColors[pid] ?? '#888',
        corporation: player.corporation,
        startingHand: player.starting_hand!,
        hasKept,
        keptCorporation: hasKept ? player.corporation : null,
        keptPreludes,
        keptProjectCards,
      };
    }
    return result;
  }, [gameLog, currentStep, playerTableaux, playerColors]);

  // Compute active draft data based on currentStep
  const draftData = useMemo((): DraftData | null => {
    if (!gameLog) return null;

    // Find all draft sequences (grouped by generation)
    // A draft sequence starts with a card_options move and ends with the last cards_kept move
    interface DraftSequence {
      startIdx: number;
      endIdx: number; // last cards_kept move
      generation: number;
    }
    const sequences: DraftSequence[] = [];
    let seqStart: number | null = null;
    let seqGen = 0;
    let lastKeptIdx = -1;

    for (let i = 0; i < gameLog.moves.length; i++) {
      const m = gameLog.moves[i];
      if (m.action_type !== 'draft') {
        if (seqStart != null) {
          sequences.push({ startIdx: seqStart, endIdx: lastKeptIdx >= seqStart ? lastKeptIdx : i - 1, generation: seqGen });
          seqStart = null;
        }
        continue;
      }
      if (m.card_options && seqStart == null) {
        seqStart = i;
        seqGen = m.game_state?.generation ?? 0;
      }
      if (m.cards_kept) lastKeptIdx = i;
    }
    if (seqStart != null) {
      sequences.push({ startIdx: seqStart, endIdx: lastKeptIdx >= seqStart ? lastKeptIdx : gameLog.moves.length - 1, generation: seqGen });
    }

    // Find the active sequence for currentStep (show until 1 move after last kept)
    const activeSeq = sequences.find(s => currentStep >= s.startIdx && currentStep <= s.endIdx);
    if (!activeSeq) return null;

    // Build player data by replaying draft moves up to currentStep
    const pids = Object.keys(gameLog.players);
    const players: Record<string, DraftPlayerData> = {};
    for (const pid of pids) {
      players[pid] = {
        playerName: gameLog.players[pid].player_name,
        color: playerColors[pid] ?? '#888',
        options: [],
        drafted: [],
        keptCards: null,
      };
    }

    // Current hand per player (cards in front of them, not yet picked from)
    const currentHand = new Map<string, string[]>();
    // Full initial pool for inferring missing picks
    let initialPool: Set<string> | null = null;
    const cardsPerPlayer = { count: 0 };

    let direction: 'left' | 'right' = 'right';
    let firstOptions: Map<string, Set<string>> | null = null;

    for (let i = activeSeq.startIdx; i <= Math.min(currentStep, activeSeq.endIdx); i++) {
      const m = gameLog.moves[i];
      if (m.action_type !== 'draft') continue;

      // Process card_drafted BEFORE card_options on the same move,
      // since the pick is from the previous hand, then new hands arrive
      if (m.card_drafted && m.player_id && !m.cards_kept) {
        const hand = currentHand.get(m.player_id);
        if (hand) {
          const idx = hand.indexOf(m.card_drafted);
          if (idx >= 0) hand.splice(idx, 1);
        }
        if (!players[m.player_id]?.drafted.includes(m.card_drafted)) {
          players[m.player_id]?.drafted.push(m.card_drafted);
        }
      }

      if (m.card_options) {
        // Set each player's current hand (new pass of cards arriving)
        for (const [pid, cards] of Object.entries(m.card_options)) {
          currentHand.set(pid, [...cards]);
        }

        // Capture initial pool from first card_options
        if (!initialPool) {
          initialPool = new Set();
          for (const cards of Object.values(m.card_options)) {
            for (const c of cards) initialPool.add(c);
          }
          cardsPerPlayer.count = initialPool.size / pids.length;
        }

        // Auto-draft forced picks (1 card remaining)
        for (const [pid, cards] of Object.entries(m.card_options)) {
          if (cards.length === 1) {
            if (!players[pid]?.drafted.includes(cards[0])) {
              players[pid]?.drafted.push(cards[0]);
            }
            currentHand.set(pid, []);
          }
        }

        // Detect direction from second card_options move
        if (!firstOptions) {
          firstOptions = new Map();
          for (const [pid, cards] of Object.entries(m.card_options)) {
            firstOptions.set(pid, new Set(cards));
          }
        } else {
          const pidList = Object.keys(m.card_options);
          if (pidList.length >= 2) {
            const cur1 = new Set(m.card_options[pidList[1]] ?? []);
            const prev0 = firstOptions.get(pidList[0]);
            if (prev0 && [...cur1].every(c => prev0.has(c))) {
              direction = 'right';
            } else {
              const curLast = new Set(m.card_options[pidList[pidList.length - 1]] ?? []);
              if (prev0 && [...curLast].every(c => prev0.has(c))) {
                direction = 'left';
              }
            }
          }
        }
      }

      if (m.cards_kept) {
        for (const [pid, cards] of Object.entries(m.cards_kept)) {
          if (players[pid]) players[pid].keptCards = cards;
        }
      }
    }

    // Infer missing draft picks from the initial pool, but only once all
    // forced picks are done (every player should have cardsPerPlayer drafted)
    if (initialPool && cardsPerPlayer.count > 0) {
      const totalDrafted = pids.reduce((sum, pid) => sum + players[pid].drafted.length, 0);
      const expectedTotal = initialPool.size;
      // Only infer if we're close to done (at least N-1 cards per player drafted)
      if (totalDrafted >= expectedTotal - pids.length) {
        const allDrafted = new Set<string>();
        for (const pid of pids) {
          for (const c of players[pid].drafted) allDrafted.add(c);
        }
        const missing = [...initialPool].filter(c => !allDrafted.has(c));
        for (const card of missing) {
          const shortPlayer = pids.find(pid => players[pid].drafted.length < cardsPerPlayer.count);
          if (shortPlayer) {
            players[shortPlayer].drafted.push(card);
          }
        }
      }
    }

    // Set options = current hand (cards in front of the player, not yet picked)
    for (const pid of pids) {
      players[pid].options = currentHand.get(pid) ?? [];
    }

    return {
      generation: activeSeq.generation,
      direction,
      players,
    };
  }, [gameLog, currentStep, playerColors]);

  // Auto-open draft dialog when entering a new draft sequence
  useEffect(() => {
    const gen = draftData?.generation ?? null;
    if (gen != null && gen !== prevDraftGen.current) {
      setDraftOpen(true);
    }
    prevDraftGen.current = gen;
  }, [draftData?.generation]);

  // Track which action cards have been activated this generation
  const activatedCards = useMemo(() => {
    if (!gameLog) return new Map<string, Set<string>>();
    const currentGen = gameLog.moves[currentStep]?.game_state?.generation;
    if (currentGen == null) return new Map<string, Set<string>>();
    const bounds = generationBoundaries.get(currentGen);
    const startIdx = bounds?.start ?? 0;
    const activated = new Map<string, Set<string>>();
    for (let i = startIdx; i <= currentStep; i++) {
      const move = gameLog.moves[i];
      if (move.action_type === 'activate_card') {
        const match = move.description.match(/activates (.+?)(?:\s*\||$)/i);
        if (match) {
          const cardName = match[1].trim();
          if (!activated.has(move.player_id)) activated.set(move.player_id, new Set());
          activated.get(move.player_id)!.add(cardName);
        }
      }
    }
    return activated;
  }, [gameLog, currentStep, generationBoundaries]);

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
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white tracking-tight glow-white">
            Table {tableId}
            {mapDefinition && (
              <span className="text-slate-400 font-normal" style={{ textShadow: 'none' }}> &mdash; {mapDefinition.name}</span>
            )}
          </h1>
          <button
            onClick={() => { setShareCopied(false); setShowShareDialog(true); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Share replay"
          >
            <Share2 size={18} />
          </button>
        </div>
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
          {startingHandData && !startingHandOpen && (
            <button
              onClick={() => setStartingHandOpen(true)}
              className="text-lg font-bold text-white glow-white hover:text-white/80 transition-colors animate-pulse cursor-pointer px-4 py-1.5 border border-white/30 rounded-lg"
            >
              Starting Hands
            </button>
          )}
          {draftData && !draftOpen && (
            <button
              onClick={() => setDraftOpen(true)}
              className="text-lg font-bold text-white glow-white hover:text-white/80 transition-colors animate-pulse cursor-pointer px-4 py-1.5 border border-white/30 rounded-lg"
            >
              Draft (Gen {draftData.generation})
            </button>
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
      <div className="flex gap-4 overflow-x-clip">
        {/* Left: Player cards */}
        <div className="w-[320px] flex-shrink-0 space-y-3">
          {gameState?.player_vp && Object.keys(gameState.player_vp).map(pid => {
            const tableau = playerTableaux.get(pid);
            return (
              <PlayerCard
                key={pid}
                playerId={pid}
                playerName={playerNames[pid] ?? pid}
                corporation={(tableau?.headquarters ?? []).includes(playerCorporations[pid] ?? '') ? playerCorporations[pid] ?? '' : ''}
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
                activatedCards={activatedCards.get(pid)}
              />
            );
          })}
        </div>

        {/* Center: Map + controls */}
        <div className="flex-1 min-w-0 flex flex-col items-center">
          <div
            className="relative inline-flex flex-col items-center"
            style={{
              transform: `translate(${mapOffset.x}px, ${mapOffset.y}px)`,
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
            onMouseDown={e => {
              if (e.button !== 0) return;
              // Don't drag when interacting with controls
              const target = e.target as HTMLElement;
              if (target.closest('button, input[type="range"], input[type="checkbox"]')) return;
              setIsDragging(true);
              dragStart.current = { x: e.clientX, y: e.clientY, ox: mapOffset.x, oy: mapOffset.y };
              const onMove = (ev: MouseEvent) => {
                setMapOffset({
                  x: dragStart.current.ox + (ev.clientX - dragStart.current.x),
                  y: dragStart.current.oy + (ev.clientY - dragStart.current.y),
                });
              };
              const onUp = () => {
                setIsDragging(false);
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          >
            {/* Zoom slider */}
            <div className="flex items-center gap-2 mb-2" style={{ cursor: 'default' }}>
              <span className="text-xs text-slate-500">−</span>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={mapScale}
                onChange={e => setMapScale(parseFloat(e.target.value))}
                className="w-32 accent-amber-500"
              />
              <span className="text-xs text-slate-500">+</span>
              <span className="text-xs text-slate-400 w-10 text-center">{Math.round(mapScale * 100)}%</span>
              <button onClick={() => { setMapScale(1); setMapOffset({ x: 0, y: 0 }); }} className="text-xs text-slate-500 hover:text-slate-300 ml-1" title="Reset map zoom">↺</button>
            </div>

            <div style={{ width: `${mapScale * 100}%` }}>
              {mapDefinition ? (
                <ReplayMap
                  mapDefinition={mapDefinition}
                  placedTiles={placedTiles}
                  playerColors={playerColors}
                  currentStep={currentStep}
                  gameState={gameState}
                  claimedMilestones={claimedMilestones}
                  fundedAwards={fundedAwards}
                  playerNames={playerNames}
                  playerTrackers={gameState?.player_trackers}
                  playerTileCounts={playerTileCounts}
                  playerHandCounts={Object.fromEntries(
                    Array.from(playerTableaux.entries()).map(([pid, t]) => [pid, t.hand.length])
                  )}
                  moves={gameLog.moves}
                  playerPlayedCards={Object.fromEntries(
                    Array.from(playerTableaux.entries()).map(([pid, t]) => [pid, t.played])
                  )}
                  playerCardResources={Object.fromEntries(
                    Array.from(playerTableaux.entries()).map(([pid, t]) => [pid, t.cardResources])
                  )}
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
            </div>

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

      {startingHandData && startingHandOpen && (
        <StartingHandModal
          players={startingHandData}
          onClose={() => setStartingHandOpen(false)}
        />
      )}

      {draftData && draftOpen && (
        <DraftModal
          draft={draftData}
          onClose={() => setDraftOpen(false)}
        />
      )}

      {showShareDialog && (() => {
        const url = new URL(window.location.origin + `/replay/${tableId}`);
        if (shareIncludeMove && currentStep > 0) url.searchParams.set('move', String(currentStep));
        const shareUrl = url.toString();
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setShowShareDialog(false)}>
            <div className="glass-panel rounded-xl p-5 w-[520px] max-w-[90vw] shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-white mb-3">Share Replay</h2>
              <div className="flex gap-2 mb-3">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 select-all outline-none focus:border-blue-500/50"
                  onFocus={e => e.target.select()}
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); }}
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium flex items-center gap-1.5 transition-colors"
                >
                  {shareCopied ? <Check size={16} /> : <Copy size={16} />}
                  {shareCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareIncludeMove}
                  onChange={e => { setShareIncludeMove(e.target.checked); setShareCopied(false); }}
                  className="rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/30"
                />
                Include current move ({currentStep})
              </label>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
