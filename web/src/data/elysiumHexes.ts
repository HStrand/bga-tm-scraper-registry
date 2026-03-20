// Elysium board hex grid data
// Grid: pointy-top hex, odd-row offset right
// x = ORIGIN_X + col * COL_STEP + (row % 2 === 1 ? COL_STEP / 2 : 0)
// y = ORIGIN_Y + row * ROW_STEP

export const GRID = {
  originX: 120,
  originY: 84,
  colStep: 84,
  rowStep: 72,
  hexRadius: 48,
} as const;

export function hexCenter(col: number, row: number): { cx: number; cy: number } {
  return {
    cx: GRID.originX + col * GRID.colStep + (row % 2 === 1 ? GRID.colStep / 2 : 0),
    cy: GRID.originY + row * GRID.rowStep,
  };
}

export function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

export interface HexTile {
  col: number;
  row: number;
  name?: string;
  type: 'land' | 'ocean' | 'named';
  dbKey: string; // matches CityLocation in the database
}

// Map named locations to grid coordinates
const NAMED_TILES: Record<string, [number, number]> = {
  'Hecatus Tholus': [3, 2],
  'Elysium Mons': [2, 3],
  'Olympus Mons': [8, 3],
  'Arsia Mons': [9, 5],
};

// Board layout: [row] -> array of columns in that row
// Total: 61 hexes (matching official Elysium board)
const BOARD_LAYOUT: Record<number, number[]> = {
  1: [3, 4, 5, 6, 7, 8],
  2: [2, 3, 4, 5, 6, 7, 8],
  3: [2, 3, 4, 5, 6, 7, 8],
  4: [2, 3, 4, 5, 6, 7, 8, 9],
  5: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  6: [2, 3, 4, 5, 6, 7, 8, 9],
  7: [2, 3, 4, 5, 6, 7, 8],
  8: [3, 4, 5, 6, 7, 8],
  9: [3, 4, 5, 6, 7],
};

function buildDbKey(col: number, row: number): string {
  // Check if this is a named tile
  for (const [name, [c, r]] of Object.entries(NAMED_TILES)) {
    if (c === col && r === row) return name;
  }
  return `Hex ${col},${row}`;
}

function getTileType(col: number, row: number): 'land' | 'ocean' | 'named' {
  for (const [, [c, r]] of Object.entries(NAMED_TILES)) {
    if (c === col && r === row) return 'named';
  }
  return 'land';
}

function getTileName(col: number, row: number): string | undefined {
  for (const [name, [c, r]] of Object.entries(NAMED_TILES)) {
    if (c === col && r === row) return name;
  }
  return undefined;
}

export const ELYSIUM_HEXES: HexTile[] = [];

for (const [rowStr, cols] of Object.entries(BOARD_LAYOUT)) {
  const row = Number(rowStr);
  for (const col of cols) {
    ELYSIUM_HEXES.push({
      col,
      row,
      name: getTileName(col, row),
      type: getTileType(col, row),
      dbKey: buildDbKey(col, row),
    });
  }
}

// Image dimensions (elysium.png)
export const IMAGE_WIDTH = 1174;
export const IMAGE_HEIGHT = 923;
