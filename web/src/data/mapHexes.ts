// Shared hex grid utilities and map definitions

export interface HexGrid {
  originX: number;
  originY: number;
  colStep: number;
  rowStep: number;
  hexRadius: number;
}

export interface HexTile {
  col: number;
  row: number;
  name?: string;
  type: 'land' | 'ocean' | 'named';
  dbKey: string;
}

export interface MapDefinition {
  name: string;        // display name
  dbName: string;      // value in Games_Canonical.Map
  image: string;       // import path
  imageWidth: number;
  imageHeight: number;
  grid: HexGrid;
  hexes: HexTile[];
}

export function hexCenter(grid: HexGrid, col: number, row: number): { cx: number; cy: number } {
  return {
    cx: grid.originX + col * grid.colStep + (row % 2 === 1 ? grid.colStep / 2 : 0),
    cy: grid.originY + row * grid.rowStep,
  };
}

export function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

function buildHexes(
  layout: Record<number, number[]>,
  namedTiles: Record<string, [number, number]>,
): HexTile[] {
  const hexes: HexTile[] = [];

  const nameByCoord = new Map<string, string>();
  for (const [name, [c, r]] of Object.entries(namedTiles)) {
    nameByCoord.set(`${c},${r}`, name);
  }

  for (const [rowStr, cols] of Object.entries(layout)) {
    const row = Number(rowStr);
    for (const col of cols) {
      const key = `${col},${row}`;
      const name = nameByCoord.get(key);
      hexes.push({
        col,
        row,
        name,
        type: name ? 'named' : 'land',
        dbKey: name ?? `Hex ${col},${row}`,
      });
    }
  }

  return hexes;
}

// ── Elysium ──────────────────────────────────────────────

import elysiumImage from '/assets/elysium.png';

const ELYSIUM_GRID: HexGrid = {
  originX: 120, originY: 84, colStep: 84, rowStep: 72, hexRadius: 48,
};

const ELYSIUM_NAMED: Record<string, [number, number]> = {
  'Hecatus Tholus': [3, 2],
  'Elysium Mons': [2, 3],
  'Olympus Mons': [8, 3],
  'Arsia Mons': [9, 5],
};

const ELYSIUM_LAYOUT: Record<number, number[]> = {
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

export const ELYSIUM: MapDefinition = {
  name: 'Elysium',
  dbName: 'Elysium',
  image: elysiumImage,
  imageWidth: 1174,
  imageHeight: 923,
  grid: ELYSIUM_GRID,
  hexes: buildHexes(ELYSIUM_LAYOUT, ELYSIUM_NAMED),
};

// ── Tharsis ──────────────────────────────────────────────

import tharsisImage from '/assets/tharsis.png';

const THARSIS_GRID: HexGrid = {
  originX: 120, originY: 88, colStep: 84, rowStep: 72, hexRadius: 48,
};

const THARSIS_NAMED: Record<string, [number, number]> = {
  'Tharsis Tholus': [4, 2],
  'Ascraeus Mons': [2, 3],
  'Pavonis Mons': [2, 4],
  'Arsia Mons': [1, 5],
  'Noctis City': [3, 5],
};

const THARSIS_LAYOUT: Record<number, number[]> = {
  1: [3, 4, 5, 6, 7, 8],
  2: [3, 4, 5, 6, 7, 8, 9],
  3: [2, 3, 4, 5, 6, 7, 8],
  4: [2, 3, 4, 5, 6, 7, 8, 9],
  5: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  6: [2, 3, 4, 5, 6, 7, 8, 9],
  7: [2, 3, 4, 5, 6, 7, 8],
  8: [3, 4, 5, 6, 7, 8],
  9: [3, 4, 5, 6, 7, 8],
};

export const THARSIS: MapDefinition = {
  name: 'Tharsis',
  dbName: 'Tharsis',
  image: tharsisImage,
  imageWidth: 1172,
  imageHeight: 929,
  grid: THARSIS_GRID,
  hexes: buildHexes(THARSIS_LAYOUT, THARSIS_NAMED),
};

// ── Hellas ───────────────────────────────────────────────

import hellasImage from '/assets/hellas.png';

const HELLAS_GRID: HexGrid = {
  originX: 122, originY: 80, colStep: 84, rowStep: 73, hexRadius: 48,
};

const HELLAS_NAMED: Record<string, [number, number]> = {
  'South Pole': [5, 9],
};

const HELLAS_LAYOUT: Record<number, number[]> = {
  1: [3, 4, 5, 6, 7],
  2: [2, 3, 4, 5, 6, 7, 8],
  3: [2, 3, 4, 5, 6, 7, 8, 9],
  4: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  5: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  6: [2, 3, 4, 5, 6, 7, 8, 9],
  7: [2, 3, 4, 5, 6, 7, 8],
  8: [3, 4, 5, 6, 7, 8],
  9: [3, 4, 5, 6, 7],
};

export const HELLAS: MapDefinition = {
  name: 'Hellas',
  dbName: 'Hellas',
  image: hellasImage,
  imageWidth: 1173,
  imageHeight: 924,
  grid: HELLAS_GRID,
  hexes: buildHexes(HELLAS_LAYOUT, HELLAS_NAMED),
};

// ── Vastitas Borealis ────────────────────────────────────

import vastitasImage from '/assets/vastitas borealis.png';

const VASTITAS_GRID: HexGrid = {
  originX: 128.5, originY: 87.5, colStep: 82.5, rowStep: 71.5, hexRadius: 47.5,
};

const VASTITAS_NAMED: Record<string, [number, number]> = {
  'Hecates Tholus': [5, 1],
  'Elysium Mons': [8, 2],
  'Alba Mons': [2, 4],
  'Viking 2': [9, 4],
  'Uranius Tholus': [2, 7],
  'Viking 1': [3, 9],
};

const VASTITAS_LAYOUT: Record<number, number[]> = {
  1: [3, 4, 5, 6, 7, 8],
  2: [3, 4, 5, 6, 7, 8, 9],
  3: [2, 3, 4, 5, 6, 7, 8, 9],
  4: [2, 3, 4, 5, 6, 7, 8, 9],
  5: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  6: [2, 3, 4, 5, 6, 7, 8, 9],
  7: [2, 3, 4, 5, 6, 7, 8],
  8: [3, 4, 5, 6, 7, 8],
  9: [3, 4, 5, 6, 7],
};

export const VASTITAS: MapDefinition = {
  name: 'Vastitas Borealis',
  dbName: 'Vastitas Borealis',
  image: vastitasImage,
  imageWidth: 1170,
  imageHeight: 922,
  grid: VASTITAS_GRID,
  hexes: buildHexes(VASTITAS_LAYOUT, VASTITAS_NAMED),
};

// ── Amazonis Planitia ────────────────────────────────────

import amazonisImage from '/assets/amazonis planitia.png';

const AMAZONIS_GRID: HexGrid = {
  originX: 60.7, originY: 15, colStep: 87.8, rowStep: 76, hexRadius: 50.5,
};

const AMAZONIS_NAMED: Record<string, [number, number]> = {
  'Viking': [4, 2],
  'Hecatus Tholus': [1, 5],
  'Olympus Mons': [8, 8],
  'Ascraeus Mons': [10, 8],
  'Pavonis Mons': [9, 9],
  'Arsia Mons': [9, 10],
};

const AMAZONIS_LAYOUT: Record<number, number[]> = {
  1:  [3, 4, 5, 6, 7, 8],
  2:  [3, 4, 5, 6, 7, 8, 9],
  3:  [2, 3, 4, 5, 6, 7, 8, 9],
  4:  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  5:  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  6:  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  7:  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  8:  [2, 3, 4, 5, 6, 7, 8, 9, 10],
  9:  [2, 3, 4, 5, 6, 7, 8, 9],
  10: [3, 4, 5, 6, 7, 8, 9],
  11: [3, 4, 5, 6, 7, 8],
};

export const AMAZONIS: MapDefinition = {
  name: 'Amazonis Planitia',
  dbName: 'Amazonis Planitia',
  image: amazonisImage,
  imageWidth: 1172,
  imageHeight: 1005,
  grid: AMAZONIS_GRID,
  hexes: buildHexes(AMAZONIS_LAYOUT, AMAZONIS_NAMED),
};

// ── All maps ─────────────────────────────────────────────

export const ALL_MAPS: MapDefinition[] = [THARSIS, HELLAS, ELYSIUM, VASTITAS, AMAZONIS];
