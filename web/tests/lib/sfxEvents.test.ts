import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineState } from '@/lib/engine/types';
import { getSfxSettings, playSound, setSfxSettings } from '@/lib/sfx';
import { engineMoveSounds, playSounds, replayMoveSounds } from '@/lib/sfxEvents';
import type { GameLogMove } from '@/types/gamelog';

function move(overrides: Partial<GameLogMove> & { tr?: number; generation?: number }): GameLogMove {
  const { tr, generation, ...rest } = overrides;
  return {
    move_number: 1,
    player_id: '1',
    player_name: 'Ada',
    action_type: 'play_card',
    description: '',
    game_state: {
      generation: generation ?? 1,
      temperature: -30,
      oxygen: 0,
      oceans: 0,
      player_vp: tr != null ? { '1': { total: tr, total_details: { tr } } } : undefined,
    },
    ...rest,
  } as GameLogMove;
}

describe('replayMoveSounds', () => {
  it('swishes for a card and chimes when the rating goes up', () => {
    const before = move({ tr: 20 });
    const after = move({ card_played: 'Asteroid', tr: 21 });
    expect(replayMoveSounds(after, before, false)).toEqual(['card', 'chime']);
  });

  it('thumps for a tile and splashes for an ocean', () => {
    expect(replayMoveSounds(move({ action_type: 'place_tile', tile_placed: 'City', tile_location: 'Hex 5,5 (5,5)' }), undefined, false)).toEqual(['tile']);
    expect(replayMoveSounds(move({ action_type: 'place_tile', tile_placed: 'Ocean', tile_location: 'Hex 5,5 (5,5)' }), undefined, false)).toEqual(['ocean']);
  });

  it('deals for draws, clicks for drafts and activations, celebrates claims', () => {
    expect(replayMoveSounds(move({ action_type: 'draw', description: 'Ada draws 2 cards: A, B' }), undefined, false)).toEqual(['deal']);
    expect(replayMoveSounds(move({ action_type: 'draft', card_drafted: 'A' }), undefined, false)).toEqual(['click']);
    expect(replayMoveSounds(move({ action_type: 'activate_card', description: 'Ada activates Ironworks' }), undefined, false)).toEqual(['click']);
    expect(replayMoveSounds(move({ action_type: 'claim_milestone', description: 'Ada claims milestone Mayor' }), undefined, false)).toEqual(['claim']);
  });

  it('marks a new generation and the end of the game', () => {
    const sounds = replayMoveSounds(move({ generation: 2, action_type: 'production' }), move({ generation: 1 }), true);
    expect(sounds).toEqual(['turn', 'fanfare']);
  });
});

function state(overrides: Partial<EngineState> & { tr?: number; played?: number }): EngineState {
  const { tr = 20, played = 0, ...rest } = overrides;
  return {
    moveNumber: 1,
    generation: 1,
    phase: 'Action',
    placedTiles: {},
    claimedMilestones: [],
    fundedAwards: [],
    players: [{ playerId: 0, terraformRating: tr, playedCards: Array(played).fill('c'), playedEvents: [] }],
    ...rest,
  } as unknown as EngineState;
}

describe('engineMoveSounds', () => {
  it('hears a card, a tile and a rating step in one move', () => {
    const before = state({});
    const after = state({ played: 1, tr: 21, placedTiles: { '5,5': { type: 'Greenery', ownerId: 0 } } as EngineState['placedTiles'] });
    expect(engineMoveSounds(before, after, false)).toEqual(['card', 'tile', 'chime']);
  });

  it('splashes for an ocean, deals for a draw, and ends with a fanfare', () => {
    const before = state({});
    const after = state({ phase: 'GameEnd', placedTiles: { '3,3': { type: 'Ocean', ownerId: 0 } } as EngineState['placedTiles'] });
    expect(engineMoveSounds(before, after, true)).toEqual(['deal', 'ocean', 'fanfare']);
  });

  it('marks a new generation and a claim', () => {
    const before = state({});
    const after = state({ generation: 2, claimedMilestones: [{ milestoneName: 'Mayor', playerId: 0 }] });
    expect(engineMoveSounds(before, after, false)).toEqual(['turn', 'claim']);
  });

  it('is silent when nothing audible happened', () => {
    expect(engineMoveSounds(state({}), state({ moveNumber: 2 }), false)).toEqual([]);
  });
});

describe('sound settings', () => {
  beforeEach(() => setSfxSettings({ on: true, volume: 0.6 }));

  it('are on by default and remembered in localStorage', () => {
    expect(getSfxSettings()).toEqual({ on: true, volume: 0.6 });
    setSfxSettings({ on: false });
    expect(JSON.parse(localStorage.getItem('tfmstats.sfx')!)).toEqual({ on: false, volume: 0.6 });
  });

  it('play nothing where there is no audio', () => {
    expect(() => playSound('card')).not.toThrow();
    expect(() => playSounds(['tile', 'chime'])).not.toThrow();
    vi.useRealTimers();
  });
});
