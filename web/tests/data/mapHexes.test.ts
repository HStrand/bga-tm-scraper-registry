import { describe, it, expect } from 'vitest';
import { THARSIS, HELLAS, ELYSIUM } from '@/data/mapHexes';

// The board every one of these maps shares: 61 hexes in rows of 5-6-7-8-9-8-7-6-5.
const BOARD_ROWS: Record<number, number[]> = {
  1: [3, 4, 5, 6, 7],
  2: [3, 4, 5, 6, 7, 8],
  3: [2, 3, 4, 5, 6, 7, 8],
  4: [2, 3, 4, 5, 6, 7, 8, 9],
  5: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  6: [2, 3, 4, 5, 6, 7, 8, 9],
  7: [2, 3, 4, 5, 6, 7, 8],
  8: [3, 4, 5, 6, 7, 8],
  9: [3, 4, 5, 6, 7],
};

describe('map hex layouts', () => {
  it.each([THARSIS, HELLAS, ELYSIUM])('$name has exactly the 61 hexes of the board', map => {
    const expected = Object.entries(BOARD_ROWS).flatMap(([row, cols]) => cols.map(col => `${col},${row}`));

    expect(map.hexes.map(h => `${h.col},${h.row}`).sort()).toEqual(expected.sort());
  });

  it.each([THARSIS, HELLAS, ELYSIUM])('$name has a unique key for every hex', map => {
    expect(new Set(map.hexes.map(h => h.dbKey)).size).toBe(61);
  });
});
