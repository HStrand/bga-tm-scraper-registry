// Pure derivations over a BGA game log: everything the replay viewer shows at step N that is not
// stored in that move's game_state snapshot is rebuilt here by folding over moves 0..N.

import { extractTilePlacement, parseTileLocationToDbKey } from '@/lib/gameLog';
import type { GameLog } from '@/types/gamelog';
import type { StartingHandPlayerData } from '@/components/replay/StartingHandModal';
import type { DraftData, DraftPlayerData } from '@/components/replay/DraftModal';

export interface PlacedTile {
  dbKey: string;
  tileType: string;
  playerId: string;
  moveIndex: number;
}

export interface TileCounts {
  cities: number;
  greeneries: number;
  total: number;
}

export interface PlayerTableauFold {
  headquarters: string[];
  played: string[];
  hand: string[];
  sold: string[];
  cardResources: Record<string, number>;
}

export type GenerationBoundaries = Map<number, { start: number; end: number }>;

export function foldPlacedTiles(gameLog: GameLog, currentStep: number): Map<string, PlacedTile> {
  const map = new Map<string, PlacedTile>();
  for (let i = 0; i <= currentStep; i++) {
    const move = gameLog.moves[i];
    const placement = extractTilePlacement(move);
    if (placement) {
      map.set(placement.dbKey, {
        dbKey: placement.dbKey,
        tileType: placement.tileType,
        playerId: move.player_id,
        moveIndex: i,
      });
    }
    // Land Claim has tile_location but no tile_placed
    if (!placement && move.tile_location && move.card_played?.toLowerCase() === 'land claim') {
      const dbKey = parseTileLocationToDbKey(move.tile_location);
      map.set(dbKey, { dbKey, tileType: 'Land Claim', playerId: move.player_id, moveIndex: i });
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
            // Land Claim is just a reservation marker — never overwrite a real tile with it.
            if (tileName === 'Land Claim') continue;
            // Update existing tile with special type info
            const existing = map.get(dbKey)!;
            existing.tileType = tileName;
          }
        }
      }
    }
  }
  return map;
}

export function countPlayerTiles(placedTiles: Map<string, PlacedTile>): Record<string, TileCounts> {
  const counts: Record<string, TileCounts> = {};
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
}

export function computeGenerationBoundaries(gameLog: GameLog): GenerationBoundaries {
  const map: GenerationBoundaries = new Map();
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
}

/** Prelude card names each player was dealt, for separating preludes from project cards. */
export function collectPlayerPreludeNames(gameLog: GameLog): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [id, p] of Object.entries(gameLog.players)) {
    const preludes = p.starting_hand?.preludes;
    map.set(id, preludes ? new Set(preludes) : new Set());
  }
  return map;
}

export function foldPlayerTableaux(
  gameLog: GameLog,
  currentStep: number,
  playerPreludeNames: Map<string, Set<string>>,
): Map<string, PlayerTableauFold> {
  const map = new Map<string, PlayerTableauFold>();
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
  // Track the first time each card is seen in a player's hand for stable ordering
  const handFirstSeen = new Map<string, Map<string, number>>();
  for (const id of Object.keys(gameLog.players)) handFirstSeen.set(id, new Map());
  let seenCounter = 0;

  for (let i = 0; i <= currentStep; i++) {
    const move = gameLog.moves[i];
    // Use the hand snapshot when available (keyed by player id in game_state)
    const playerHands = move?.game_state?.player_hands;
    if (playerHands) {
      for (const [pid, hand] of Object.entries(playerHands)) {
        const entry = map.get(pid);
        if (entry) {
          entry.hand = [...hand];
          const seen = handFirstSeen.get(pid)!;
          for (const card of hand) {
            if (!seen.has(card)) seen.set(card, seenCounter++);
          }
        }
      }
    }
    // Seed hand from cards_kept — add any cards not already tracked
    if (move?.cards_kept) {
      for (const [pid, cards] of Object.entries(move.cards_kept)) {
        const entry = map.get(pid);
        if (entry) {
          const existing = new Set([...entry.hand, ...entry.headquarters]);
          const seen = handFirstSeen.get(pid)!;
          for (const card of cards) {
            if (!existing.has(card)) entry.hand.push(card);
            if (!seen.has(card)) seen.set(card, seenCounter++);
          }
        }
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
  // Sort hands by first-seen order so card positions stay stable across steps
  for (const [pid, entry] of map) {
    const seen = handFirstSeen.get(pid);
    if (seen && seen.size > 0) {
      entry.hand.sort((a, b) => (seen.get(a) ?? Infinity) - (seen.get(b) ?? Infinity));
    }
  }
  return map;
}

/** Starting hand data for the modal; null once every player has kept their cards. */
export function buildStartingHandData(
  gameLog: GameLog,
  currentStep: number,
  playerColors: Record<string, string>,
): Record<string, StartingHandPlayerData> | null {
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

    // Kept preludes and project cards: both from cards_kept data
    const allKept = hasKept ? (keptCardsByPlayer.get(pid) ?? []) : [];
    const preludeSet = new Set(player.starting_hand?.preludes ?? []);
    const keptPreludes = allKept.filter(c => preludeSet.has(c));
    const keptProjectCards = allKept.filter(c => !preludeSet.has(c) && c !== player.corporation);

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
}

/** The draft in progress at currentStep, or null when no draft is active. */
export function buildDraftData(
  gameLog: GameLog,
  currentStep: number,
  playerColors: Record<string, string>,
): DraftData | null {
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
      // Takeback/cancelled moves can appear mid-draft (a player undoes a pick).
      // Treat them as transparent so they don't terminate the sequence and
      // collapse the draft window before the draft is actually resolved.
      if (m.action_type === 'cancelled' || m.action_type === 'takeback') continue;
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
  let directionDetected = false;
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

      // Detect direction from second card_options move (only once)
      if (!firstOptions) {
        firstOptions = new Map();
        for (const [pid, cards] of Object.entries(m.card_options)) {
          firstOptions.set(pid, new Set(cards));
        }
      } else if (!directionDetected) {
        directionDetected = true;
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
}

/** Action cards each player has activated so far in the generation of currentStep. */
export function foldActivatedCards(
  gameLog: GameLog,
  currentStep: number,
  generationBoundaries: GenerationBoundaries,
): Map<string, Set<string>> {
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
}

export function foldDiscardPile(gameLog: GameLog, currentStep: number): string[] {
  const cards: string[] = [];
  const revealRejectRe = /reveals ([^:]+): it does not have a /gi;
  for (let i = 0; i <= currentStep; i++) {
    const move = gameLog.moves[i];
    if (move?.cards_discarded) cards.push(...move.cards_discarded);
    if (move?.cards_sold) cards.push(...move.cards_sold);
    if (move?.description) {
      let m: RegExpExecArray | null;
      while ((m = revealRejectRe.exec(move.description)) !== null) {
        cards.push(m[1].trim());
      }
    }
  }
  return cards;
}

/** Data that older scraper versions did not record. */
export function detectMissingFeatures(gameLog: GameLog): { key: string; label: string }[] {
  const missing: { key: string; label: string }[] = [];
  const hasPlayerHands = gameLog.moves.some(m => m.game_state?.player_hands);
  const hasCardsDiscarded = gameLog.moves.some(m => m.cards_discarded);
  const hasSpecialTiles = gameLog.moves.some(m => m.game_state?.special_tiles);
  if (!hasPlayerHands) missing.push({ key: 'player_hands', label: 'Player hands' });
  if (!hasCardsDiscarded) missing.push({ key: 'cards_discarded', label: 'Cards discarded' });
  if (!hasSpecialTiles) missing.push({ key: 'special_tiles', label: 'Special tile placements' });
  return missing;
}

/** Resolve a step index to skip game_state_change moves. */
export function resolveReplayStep(
  gameLog: GameLog,
  target: number,
  direction: 'forward' | 'backward' | 'auto' = 'auto',
): number {
  const clamped = Math.max(0, Math.min(target, gameLog.moves.length - 1));
  if (gameLog.moves[clamped]?.action_type !== 'game_state_change') return clamped;
  // For 'auto' (slider/jump), go backward to show previous real move
  // For 'forward' (next), skip ahead; for 'backward' (prev), skip back
  const dir = direction === 'forward' ? 1 : -1;
  let step = clamped + dir;
  while (step >= 0 && step < gameLog.moves.length && gameLog.moves[step]?.action_type === 'game_state_change') {
    step += dir;
  }
  return Math.max(0, Math.min(step, gameLog.moves.length - 1));
}
