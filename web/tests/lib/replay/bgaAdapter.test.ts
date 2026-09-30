import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { bgaPlayerStats, buildBgaTimeline, resolveBgaPlayerRef } from '@/lib/replay/bga/bgaAdapter';
import {
  collectPlayerPreludeNames, countPlayerTiles, foldDiscardPile, foldPlacedTiles, foldPlayerTableaux,
} from '@/lib/replay/bga/folds';
import { findClaim } from '@/lib/replay/viewModel';
import type { GameLog } from '@/types/gamelog';
import { TEST_LOGS, GOLDEN_DIR, testdataAvailable, loadTestLog, sampledSteps, goldenJson } from './testLogs';

describe('bgaPlayerStats', () => {
  it('reads resources, production and tags under neutral keys', () => {
    const stats = bgaPlayerStats({
      'M€': 14, 'M€ Production': 19, Steel: 2, 'Steel Production': 2, Titanium: 6, 'Titanium Production': 2,
      Plant: 4, 'Plant Production': 3, Energy: 1, 'Energy Production': 1, Heat: 11, 'Heat Production': 3,
      'Science tag': 3, 'Energy tag': 2, 'Event tag': 2, 'Wild tag': 1,
    });

    expect(stats.resources).toEqual({ mc: 14, steel: 2, titanium: 6, plants: 4, energy: 1, heat: 11 });
    expect(stats.production).toEqual({ mc: 19, steel: 2, titanium: 2, plants: 3, energy: 1, heat: 3 });
    expect(stats.tags).toMatchObject({ science: 3, power: 2, event: 2, wild: 1, building: 0 });
  });

  it('reads the tag tracker names of newer scraper versions', () => {
    const stats = bgaPlayerStats({
      'Count of Space tags': 4, 'Count of Power tags': 2, 'Count of played Events cards': 3, 'Count of Wild tags': 1,
    });

    expect(stats.tags).toMatchObject({ space: 4, power: 2, event: 3, wild: 1 });
  });

  it('reports zero for trackers the log does not have', () => {
    const stats = bgaPlayerStats({});

    expect(stats.resources.mc).toBe(0);
    expect(stats.production.heat).toBe(0);
    expect(stats.tags.jovian).toBe(0);
  });
});

describe('resolveBgaPlayerRef', () => {
  const log = {
    players: {
      '111': { player_name: 'CapitalDecay' },
      '222': { player_name: 'Sandrusky83' },
    },
  } as unknown as GameLog;

  it('accepts a player id', () => {
    expect(resolveBgaPlayerRef(log, '222')).toBe('222');
  });

  it('accepts a player name', () => {
    expect(resolveBgaPlayerRef(log, 'Sandrusky83')).toBe('222');
  });

  it('accepts a name spelled slightly differently from the players list', () => {
    expect(resolveBgaPlayerRef(log, 'CaptialDecay')).toBe('111');
  });

  it('returns undefined for an unknown or missing reference', () => {
    expect(resolveBgaPlayerRef(log, 'somebody else')).toBeUndefined();
    expect(resolveBgaPlayerRef(log, undefined)).toBeUndefined();
  });
});

describe.skipIf(!testdataAvailable)('buildBgaTimeline', () => {
  for (const { name, file } of TEST_LOGS) {
    it(`matches the recorded golden for ${name}`, async () => {
      const log = loadTestLog(file);
      const timeline = buildBgaTimeline(log);

      const golden = {
        info: timeline.info,
        length: timeline.length,
        generationBoundaries: timeline.generationBoundaries,
        snapshots: sampledSteps(log).map(step => timeline.snapshotAt(step)),
        log: sampledSteps(log).map(step => timeline.log[step]),
      };

      await expect(goldenJson(golden)).toMatchFileSnapshot(path.join(GOLDEN_DIR, `${name}.timeline.json`));
    });

    it(`agrees with the folds for ${name}`, () => {
      const log = loadTestLog(file);
      const timeline = buildBgaTimeline(log);
      const preludes = collectPlayerPreludeNames(log);

      for (const step of sampledSteps(log)) {
        const snapshot = timeline.snapshotAt(step);
        const placedTiles = foldPlacedTiles(log, step);
        const tileCounts = countPlayerTiles(placedTiles);
        const tableaux = foldPlayerTableaux(log, step, preludes);

        expect(snapshot.tiles.map(t => [t.hexKey, t.type, t.placedBy, t.placedAt]))
          .toEqual(Array.from(placedTiles.values()).map(t => [t.dbKey, t.tileType, t.playerId, t.moveIndex]));
        expect(snapshot.piles.discardCards).toEqual(foldDiscardPile(log, step));
        for (const [pid, tableau] of tableaux) {
          const player = snapshot.players[pid];
          expect(player.hand).toEqual(tableau.hand);
          expect(player.played).toEqual(tableau.played);
          expect(player.headquarters).toEqual(tableau.headquarters);
          expect(player.cardResources).toEqual(tableau.cardResources);
          expect(player.tileCounts).toEqual(tileCounts[pid] ?? { cities: 0, greeneries: 0, total: 0 });
        }
      }
    });
  }

  it('lists every move in the log and marks bookkeeping moves hidden', () => {
    const log = loadTestLog(TEST_LOGS[1].file);
    const timeline = buildBgaTimeline(log);

    expect(timeline.length).toBe(log.moves.length);
    expect(timeline.log).toHaveLength(log.moves.length);
    expect(timeline.log.filter(e => e.hidden).length)
      .toBe(log.moves.filter(m => m.action_type === 'game_state_change').length);
  });

  // Elysium game 824655675 after move 201, checked against the log by hand.
  describe('Elysium game at move 201', () => {
    const snapshot = () => buildBgaTimeline(loadTestLog(TEST_LOGS[1].file)).snapshotAt(200);
    const ME = '86296239';
    const OPPONENT = '98490496';

    it('has the global parameters and piles', () => {
      const s = snapshot();

      expect(s.index).toBe(200);
      expect(s.generation).toBe(6);
      expect(s.globals).toEqual({ temperature: -20, oxygen: 1, oceans: 2 });
      expect(s.piles.draw).toBe(124);
      expect(s.piles.discard).toBe(36);
      expect(s.firstPlayerId).toBe(ME);
    });

    it('has each player\'s resources, production, tags and rating', () => {
      const me = snapshot().players[ME];

      expect(me.statsKnown).toBe(true);
      expect(me.resources).toEqual({ mc: 14, steel: 2, titanium: 6, plants: 4, energy: 1, heat: 11 });
      expect(me.production).toEqual({ mc: 19, steel: 2, titanium: 2, plants: 3, energy: 1, heat: 3 });
      expect(me.tags).toEqual({
        building: 5, space: 3, science: 3, power: 2, earth: 4, jovian: 0,
        city: 2, plant: 2, microbe: 1, animal: 0, wild: 1, event: 2,
      });
      expect(me.tr).toBe(22);
      expect(me.vp).toEqual({
        total: 22,
        breakdown: { tr: 22, milestones: 0, awards: 0, greeneries: 1, cities: 1, cards: -2 },
      });
    });

    it('has hands, tiles and claims', () => {
      const s = snapshot();

      expect(s.players[ME].hand).toHaveLength(14);
      expect(s.players[ME].hand).toContain('Predators');
      expect(s.players[ME].headquarters).toContain('Point Luna');
      expect(s.players[ME].tileCounts).toEqual({ cities: 2, greeneries: 1, total: 4 });
      expect(s.players[OPPONENT].tileCounts).toEqual({ cities: 1, greeneries: 0, total: 4 });
      expect(s.tiles.find(t => t.hexKey === 'Hex 4,3')).toMatchObject({ type: 'Restricted Area', placedBy: ME, col: 4, row: 3 });
      expect(s.tiles.find(t => t.hexKey === 'Olympus Mons')).toMatchObject({ type: 'Nuclear Zone', placedBy: OPPONENT, col: null, row: null });
      expect(findClaim(s.milestones, 'Generalist')?.playerId).toBe(OPPONENT);
      expect(findClaim(s.milestones, 'Legend')?.playerId).toBe(OPPONENT);
      expect(s.awards).toEqual([]);
    });
  });
});
