// Which sounds a move deserves. Pure functions, so they can be tested without any audio: the views call
// `playSounds` with the result.

import { extractTilePlacement } from '@/lib/gameLog';
import type { EngineState } from '@/lib/engine/types';
import { playSound, type SoundName } from '@/lib/sfx';
import type { GameLogMove } from '@/types/gamelog';

/** Play several sounds, spaced out a little so they stay distinct. */
export function playSounds(sounds: SoundName[]) {
  sounds.forEach((name, i) => playSound(name, i * 120));
}

function tileSound(tileType: string | undefined): SoundName | null {
  if (!tileType) return null;
  return /ocean/i.test(tileType) ? 'ocean' : 'tile';
}

/** Sounds for stepping forward onto `move` in a replay. */
export function replayMoveSounds(move: GameLogMove, previous: GameLogMove | undefined, isLast: boolean): SoundName[] {
  const sounds: SoundName[] = [];
  const description = move.description ?? '';

  const prevGeneration = previous?.game_state?.generation;
  const generation = move.game_state?.generation;
  if (prevGeneration != null && generation != null && generation > prevGeneration) sounds.push('turn');

  if (move.action_type === 'claim_milestone' || /claims milestone /i.test(description)
    || move.action_type === 'fund_award' || /funds .+? award/i.test(description)) {
    sounds.push('claim');
  } else if (move.action_type === 'draw' || /\bdraws\b/i.test(description)) {
    sounds.push('deal');
  } else if (move.action_type === 'draft') {
    sounds.push('click');
  } else if (move.action_type === 'activate_card') {
    sounds.push('click');
  } else if (move.card_played) {
    sounds.push('card');
  } else if (move.action_type === 'standard_project' && !extractTilePlacement(move)) {
    sounds.push('coin');
  }

  const tile = tileSound(extractTilePlacement(move)?.tileType);
  if (tile) sounds.push(tile);

  const prevTr = previous?.game_state?.player_vp?.[move.player_id]?.total_details?.tr;
  const tr = move.game_state?.player_vp?.[move.player_id]?.total_details?.tr;
  if (prevTr != null && tr != null && tr > prevTr) sounds.push('chime');

  if (isLast) sounds.push('fanfare');
  return sounds;
}

/** Sounds for a move the engine has just applied, from the position before it to the position after. */
export function engineMoveSounds(before: EngineState, after: EngineState, drewCards: boolean): SoundName[] {
  const sounds: SoundName[] = [];

  if (after.generation > before.generation) sounds.push('turn');

  const claims = after.claimedMilestones.length + after.fundedAwards.length;
  const previousClaims = before.claimedMilestones.length + before.fundedAwards.length;
  if (claims > previousClaims) sounds.push('claim');

  const played = (s: EngineState) => s.players.reduce((n, p) => n + p.playedCards.length + p.playedEvents.length, 0);
  if (played(after) > played(before)) sounds.push('card');
  if (drewCards) sounds.push('deal');

  for (const [key, tile] of Object.entries(after.placedTiles)) {
    if (!before.placedTiles[key]) {
      const sound = tileSound(tile.type);
      if (sound) {
        sounds.push(sound);
        break;
      }
    }
  }

  const trUp = after.players.some(p => {
    const was = before.players.find(q => q.playerId === p.playerId)?.terraformRating;
    return was != null && p.terraformRating > was;
  });
  if (trUp) sounds.push('chime');

  if (after.phase === 'GameEnd' && before.phase !== 'GameEnd') sounds.push('fanfare');
  return sounds;
}
