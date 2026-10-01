import { describe, it, expect } from 'vitest';
import { engineGameInfo, engineSnapshot, hexKeyAt } from '@/lib/engine/engineAdapter';
import { buildBgaTimeline } from '@/lib/replay/bga/bgaAdapter';
import { gameStartSession, session } from './engineFixtures';
import { TEST_LOGS, testdataAvailable, loadTestLog } from '../replay/testLogs';

// The Elysium game imported at the start of generation 4, before any move.
const opening = session[0].table;

describe('engineGameInfo', () => {
  it('names the seats after the BGA players the game was imported from', () => {
    const info = engineGameInfo(opening);

    expect(info.players).toEqual([
      { id: '0', name: 'cdman234', color: '#ff0000', corporation: 'Credicor' },
      { id: '1', name: 'StrandedKnight', color: '#ffa500', corporation: 'Point Luna' },
    ]);
    expect(info.mapName).toBe('Elysium');
    expect(info.source).toEqual({ kind: 'engine', gameId: 'game-1', forkedFrom: { tableId: '824655675', moveIndex: 105 } });
    expect(info.options).toEqual({ prelude: true, corporateEra: true, draft: true, colonies: false });
  });

  it('falls back to numbered players when the game has no import metadata', () => {
    const info = engineGameInfo({ ...opening, meta: null });

    expect(info.players.map(p => p.name)).toEqual(['Player 1', 'Player 2']);
    expect(info.source).toEqual({ kind: 'engine', gameId: 'game-1', forkedFrom: undefined });
  });
});

describe('engineSnapshot', () => {
  const snapshot = engineSnapshot(opening);

  it('carries the global state', () => {
    expect(snapshot).toMatchObject({
      index: 0,
      generation: 4,
      phase: 'Action',
      globals: { temperature: -26, oxygen: 0, oceans: 0 },
      firstPlayerId: '1',
      activePlayerId: '1',
      piles: { draw: 153, discard: 25 },
    });
    expect(snapshot.milestones).toEqual([{ name: 'Generalist', playerId: '0', generation: null }]);
  });

  it('gives each player their counters under the view model keys', () => {
    const stranded = snapshot.players['1'];

    expect(stranded.tr).toBe(20);
    expect(stranded.resources).toEqual({ mc: 34, steel: 2, titanium: 2, plants: 3, energy: 3, heat: 9 });
    expect(stranded.production).toEqual({ mc: 16, steel: 2, titanium: 2, plants: 0, energy: 3, heat: 2 });
    expect(stranded.statsKnown).toBe(true);
    expect(stranded.passed).toBe(false);
    expect(snapshot.players['0'].tags).toMatchObject({ building: 3, science: 2, earth: 2, event: 3 });
    expect(snapshot.players['0'].vp).toEqual({
      total: 29,
      breakdown: { tr: 25, milestones: 5, awards: 0, greeneries: 0, cities: 0, cards: -1 },
    });
  });

  it('shows cards by name, with the corporation and preludes as headquarters', () => {
    const stranded = snapshot.players['1'];

    expect(stranded.headquarters).toEqual(['Point Luna', 'Mohole Excavation', 'Research Network']);
    expect(stranded.played).toContain('Space Hotels');
    expect(stranded.played).not.toContain('Mohole Excavation');
    expect(stranded.hand).toContain('AI Central');
    expect(stranded.handCount).toBe(11);
    // Events are listed with the other played cards; the player card sorts them by type.
    expect(snapshot.players['0'].played).toContain('Nuclear Zone');
  });

  it('keys tiles the way the board does: named hexes by name, the rest by coordinate', () => {
    expect(hexKeyAt('Elysium', 8, 3)).toBe('Olympus Mons');
    expect(hexKeyAt('Elysium', 6, 5)).toBe('Hex 6,5');

    expect(snapshot.tiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ hexKey: 'Olympus Mons', col: 8, row: 3, type: 'Nuclear Zone', placedBy: '0' }),
      expect.objectContaining({ hexKey: 'Hex 7,8', type: 'Mining Rights', placedBy: '0' }),
      expect.objectContaining({ hexKey: 'Hex 6,5', type: 'City', placedBy: '1' }),
    ]));
  });

  it('marks the tile the last move placed, and gives oceans no owner', () => {
    const afterOcean = session.find(x => x.move?.type === 'PlaceTile')!;
    const tiles = engineSnapshot(afterOcean.table).tiles;
    const placed = tiles.filter(t => t.placedAt === afterOcean.table.state.moveNumber);

    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ type: 'Ocean', placedBy: null, col: 5, row: 1 });
  });

  it('has no corporation or cards for a player until the openings are chosen', () => {
    const [dealt, oneChosen, bothChosen] = gameStartSession.map(e => e.table);

    expect(engineGameInfo(dealt).players.map(p => p.corporation)).toEqual([null, null]);
    expect(engineSnapshot(dealt).players['0']).toMatchObject({ headquarters: [], hand: [], tr: 20 });
    // The choices take effect together, once the last player has made theirs.
    expect(engineGameInfo(oneChosen).players.map(p => p.corporation)).toEqual([null, null]);
    expect(engineGameInfo(bothChosen).players.map(p => p.corporation)).toEqual(['Credicor', 'Point Luna']);
    expect(engineSnapshot(bothChosen).players['1'].resources.mc).toBe(38 - 6 * 3);
  });

  it('projects every table of a recorded session', () => {
    for (const { table } of [...session, ...gameStartSession]) {
      const s = engineSnapshot(table);
      expect(Object.keys(s.players)).toEqual(['0', '1']);
      expect(s.index).toBe(table.state.moveNumber);
    }
  });
});

describe.skipIf(!testdataAvailable)('engine and BGA adapters', () => {
  it('describe the same position the same way at the fork', () => {
    // The engine game was imported after move index 105 of this log.
    const bga = buildBgaTimeline(loadTestLog(TEST_LOGS[1].file)).snapshotAt(105);
    const engine = engineSnapshot(opening);

    const bySeat = { '0': '98490496', '1': '86296239' };
    for (const [seat, bgaId] of Object.entries(bySeat)) {
      const mine = engine.players[seat];
      const theirs = bga.players[bgaId];
      expect(mine.resources).toEqual(theirs.resources);
      expect(mine.production).toEqual(theirs.production);
      expect(mine.tags).toEqual(theirs.tags);
      expect(mine.tr).toBe(theirs.tr);
      expect(mine.tileCounts).toEqual(theirs.tileCounts);
    }

    expect(engine.globals).toEqual(bga.globals);
    expect(engine.generation).toBe(bga.generation);
    expect(engine.piles.draw).toBe(bga.piles.draw);
    expect(engine.piles.discard).toBe(bga.piles.discard);
    expect(engine.tiles.map(t => t.hexKey).sort()).toEqual(bga.tiles.map(t => t.hexKey).sort());
    expect(engine.milestones.map(m => m.name.toLowerCase())).toEqual(bga.milestones.map(m => m.name.toLowerCase()));
  });
});
