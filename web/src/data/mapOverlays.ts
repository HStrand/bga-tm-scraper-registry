// Per-map overlay coordinates for off-map tiles, global parameter trackers,
// milestones, awards, and other fixed UI elements rendered on the map image.

import { RESOURCE_KEYS, type PlayerSnapshotVM, type ResourceKey, type TagKey, type TileVM } from '@/lib/replay/viewModel';

export interface OffMapTile {
  name: string;
  tileType: 'city' | 'greenery' | 'special';
  cx: number;
  cy: number;
}

export interface TrackerOverlay {
  key: 'oceans' | 'generation' | 'temperature' | 'oxygen';
  cx: number;
  cy: number;
}

export interface CubeTracker {
  key: 'oxygen' | 'temperature';
  positions: { cx: number; cy: number }[];
  minValue: number; // the value corresponding to positions[0]
  step: number;     // value increment per position (1 for oxygen, 2 for temperature)
}

export interface ScorerContext {
  player: PlayerSnapshotVM;
  playerId: string;
  tiles: TileVM[];
  hexCoords?: Map<string, [number, number]>; // hexKey -> [col, row] for all hexes on the map
}

/** Resolve a tile to [col, row], using hexCoords lookup for named tiles */
function resolveCoords(tile: TileVM, hexCoords?: Map<string, [number, number]>): [number, number] | null {
  if (tile.col != null && tile.row != null) return [tile.col, tile.row];
  return hexCoords?.get(tile.hexKey) ?? null;
}

/** A per-player number a milestone or award is scored on. */
export type StatRef = { resource: ResourceKey } | { production: ResourceKey } | { tag: TagKey };

export type CustomScorer = (ctx: ScorerContext) => number;

export interface MilestoneAwardOverlay {
  name: string;
  cx: number;
  cy: number;
  metric?: string;
  threshold?: number;
  stats?: StatRef[]; // summed
  includeWildTags?: boolean; // add wild tags to the score (each wild tag counts as +1)
  useTileCounts?: 'cities' | 'greeneries' | 'total';
  useHandCount?: boolean;
  useTR?: boolean;
  customScorer?: CustomScorer;
}

export interface AwardOverlay extends MilestoneAwardOverlay {
  metric: string; // description of what's measured
}

export interface LabelHitArea {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export interface MapOverlays {
  offMapTiles?: OffMapTile[];
  trackers?: TrackerOverlay[];
  cubeTrackers?: CubeTracker[];
  milestones?: MilestoneAwardOverlay[];
  awards?: AwardOverlay[];
  milestonesLabel?: LabelHitArea;
  awardsLabel?: LabelHitArea;
}

// Tag keys used for Diversifier counting (excluding Wild)
// Tags that count for Diversifier (Event tags excluded)
const DIVERSIFIER_TAGS: TagKey[] = [
  'building', 'space', 'science', 'power', 'earth', 'jovian', 'city', 'plant', 'microbe', 'animal',
];

const diversifierScorer: CustomScorer = ({ player }) => {
  let distinctTags = 0;
  for (const tag of DIVERSIFIER_TAGS) {
    if (player.tags[tag] > 0) distinctTags++;
  }
  const wildCount = player.tags.wild;
  const totalTagTypes = DIVERSIFIER_TAGS.length;
  return Math.min(distinctTags + wildCount, totalTagTypes);
};

const polarExplorerScorer: CustomScorer = ({ playerId, tiles, hexCoords }) => {
  let count = 0;
  for (const tile of tiles) {
    if (tile.placedBy !== playerId) continue;
    if (tile.type.toLowerCase() === 'ocean') continue;
    const coords = resolveCoords(tile, hexCoords);
    if (coords && (coords[1] === 8 || coords[1] === 9)) count++;
  }
  return count;
};

import { countAutomatedCards, countCardsWithRequirements, getCardCategory, getCardMeta, getCardResourceType } from '@/lib/cardMetadata';

const tacticianScorer: CustomScorer = ({ player }) => {
  return countCardsWithRequirements(player.played);
};

const magnateScorer: CustomScorer = ({ player }) => {
  return countAutomatedCards(player.played);
};

// Generalist: count how many of the 6 production types are >= 1
const generalistScorer: CustomScorer = ({ player }) => {
  return RESOURCE_KEYS.filter(k => player.production[k] >= 1).length;
};

// Specialist: highest single production value
const specialistScorer: CustomScorer = ({ player }) => {
  return Math.max(...RESOURCE_KEYS.map(k => player.production[k]));
};

// Ecologist: count bio tags (plant + microbe + animal) + wild
const ecologistScorer: CustomScorer = ({ player }) => {
  const { plant, microbe, animal, wild } = player.tags;
  return plant + microbe + animal + wild;
};

// Tycoon: count green (automated) + blue (active) cards played
const tycoonScorer: CustomScorer = ({ player }) => {
  return player.played.filter(c => {
    const cat = getCardCategory(c);
    return cat === 'automated' || cat === 'action' || cat === 'effect';
  }).length;
};

// Legend: count event cards played
const legendScorer: CustomScorer = ({ player }) => {
  return player.played.filter(c => getCardCategory(c) === 'event').length;
};

// Engineer: sum of heat + energy production
const engineerScorer: CustomScorer = ({ player }) => {
  return player.production.heat + player.production.energy;
};

// Geologist (Vastitas): tiles at or adjacent to volcanic areas
const VOLCANIC_HEXES: [number, number][] = [
  [5, 1],  // Hecates Tholus
  [8, 2],  // Elysium Mons
  [2, 4],  // Alba Mons
  [2, 7],  // Uranius Tholus
];
const geologistScorer: CustomScorer = ({ playerId, tiles, hexCoords }) => {
  const volcanicSet = new Set<string>();
  for (const [col, row] of VOLCANIC_HEXES) {
    volcanicSet.add(`${col},${row}`);
    for (const [nc, nr] of getHexNeighbors(col, row)) {
      volcanicSet.add(`${nc},${nr}`);
    }
  }
  let count = 0;
  for (const tile of tiles) {
    if (tile.placedBy !== playerId) continue;
    if (tile.type.toLowerCase() === 'ocean') continue;
    const coords = resolveCoords(tile, hexCoords);
    if (coords && volcanicSet.has(`${coords[0]},${coords[1]}`)) count++;
  }
  return count;
};

// Farmer: count animal + microbe resources on cards
const farmerScorer: CustomScorer = ({ player }) => {
  let total = 0;
  for (const card of player.played) {
    const resType = getCardResourceType(card);
    if (resType === 'animal' || resType === 'microbe') {
      total += player.cardResources[card] ?? 0;
    }
  }
  return total;
};

// Traveller (Vastitas): Jovian + Earth tags (+ wild)
const travellerScorer: CustomScorer = ({ player }) => {
  const { jovian, earth, wild } = player.tags;
  return jovian + earth + wild;
};

// Landscaper (Vastitas): biggest cluster of connected tiles for a player
const landscaperScorer: CustomScorer = ({ playerId, tiles, hexCoords }) => {
  const playerHexes = new Set<string>();
  for (const tile of tiles) {
    if (tile.placedBy !== playerId) continue;
    if (tile.type.toLowerCase() === 'ocean') continue;
    const coords = resolveCoords(tile, hexCoords);
    if (coords) playerHexes.add(`${coords[0]},${coords[1]}`);
  }
  const visited = new Set<string>();
  let maxCluster = 0;
  for (const hex of playerHexes) {
    if (visited.has(hex)) continue;
    let clusterSize = 0;
    const queue = [hex];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      clusterSize++;
      const [c, r] = current.split(',').map(Number);
      for (const [nc, nr] of getHexNeighbors(c, r)) {
        const key = `${nc},${nr}`;
        if (playerHexes.has(key) && !visited.has(key)) queue.push(key);
      }
    }
    maxCluster = Math.max(maxCluster, clusterSize);
  }
  return maxCluster;
};

// Highlander (Vastitas): tiles NOT adjacent to any ocean
const highlanderScorer: CustomScorer = ({ playerId, tiles, hexCoords }) => {
  const oceanCoords = new Set<string>();
  for (const tile of tiles) {
    if (tile.type.toLowerCase() === 'ocean') {
      const coords = resolveCoords(tile, hexCoords);
      if (coords) oceanCoords.add(`${coords[0]},${coords[1]}`);
    }
  }
  let count = 0;
  for (const tile of tiles) {
    if (tile.placedBy !== playerId) continue;
    if (tile.type.toLowerCase() === 'ocean') continue;
    const coords = resolveCoords(tile, hexCoords);
    if (!coords) continue;
    const neighbors = getHexNeighbors(coords[0], coords[1]);
    if (!neighbors.some(([nc, nr]) => oceanCoords.has(`${nc},${nr}`))) {
      count++;
    }
  }
  return count;
};

// Promoter (Vastitas): most event cards played
const promoterScorer: CustomScorer = ({ player }) => {
  return player.played.filter(c => getCardCategory(c) === 'event').length;
};

// Celebrity: count played cards costing 20 MC or more
const celebrityScorer: CustomScorer = ({ player }) => {
  return player.played.filter(c => {
    const meta = getCardMeta(c);
    return meta && meta.cost != null && meta.cost >= 20;
  }).length;
};

// Desert Settler: tiles below equator (row >= 6), excluding oceans
const desertSettlerScorer: CustomScorer = ({ playerId, tiles, hexCoords }) => {
  let count = 0;
  for (const tile of tiles) {
    if (tile.placedBy !== playerId) continue;
    if (tile.type.toLowerCase() === 'ocean') continue;
    const coords = resolveCoords(tile, hexCoords);
    if (coords && coords[1] >= 6) count++;
  }
  return count;
};

// Benefactor: highest TR
const benefactorScorer: CustomScorer = ({ player }) => {
  return player.tr ?? 0;
};

// Estate Dealer: tiles adjacent to oceans
// Hex adjacency: even rows offset left, odd rows offset right
function getHexNeighbors(col: number, row: number): [number, number][] {
  if (row % 2 === 0) {
    return [[col-1,row], [col+1,row], [col-1,row-1], [col,row-1], [col-1,row+1], [col,row+1]];
  } else {
    return [[col-1,row], [col+1,row], [col,row-1], [col+1,row-1], [col,row+1], [col+1,row+1]];
  }
}

const estateDealerScorer: CustomScorer = ({ playerId, tiles, hexCoords }) => {
  const oceanCoords = new Set<string>();
  for (const tile of tiles) {
    if (tile.type.toLowerCase() === 'ocean') {
      const coords = resolveCoords(tile, hexCoords);
      if (coords) oceanCoords.add(`${coords[0]},${coords[1]}`);
    }
  }
  let count = 0;
  for (const tile of tiles) {
    if (tile.placedBy !== playerId) continue;
    if (tile.type.toLowerCase() === 'ocean') continue;
    const coords = resolveCoords(tile, hexCoords);
    if (!coords) continue;
    const neighbors = getHexNeighbors(coords[0], coords[1]);
    if (neighbors.some(([nc, nr]) => oceanCoords.has(`${nc},${nr}`))) {
      count++;
    }
  }
  return count;
};

const overlays: Record<string, MapOverlays> = {
  Tharsis: {
    offMapTiles: [
      { name: 'Phobos Space Haven', tileType: 'city', cx: 119, cy: 168 },
      { name: 'Ganymede Colony', tileType: 'city', cx: 87, cy: 326 },
    ],
    trackers: [
      { key: 'oceans', cx: 232, cy: 52 },
      { key: 'generation', cx: 958, cy: 40 },
    ],
    cubeTrackers: [
      {
        key: 'oxygen',
        minValue: 0,
        step: 1,
        positions: [
          { cx: 248, cy: 170 }, // 0%
          { cx: 284, cy: 140 }, // 1%
          { cx: 330, cy: 110 }, // 2%
          { cx: 376, cy: 84 },  // 3%
          { cx: 424, cy: 67 },  // 4%
          { cx: 475, cy: 52 },  // 5%
          { cx: 524, cy: 46 },  // 6%
          { cx: 572, cy: 42 },  // 7%
          { cx: 623, cy: 44 },  // 8%
          { cx: 673, cy: 51 },  // 9%
          { cx: 723, cy: 64 },  // 10%
          { cx: 768, cy: 81 },  // 11%
          { cx: 816, cy: 104 }, // 12%
          { cx: 861, cy: 133 }, // 13%
          { cx: 901, cy: 166 }, // 14%
        ],
      },
      {
        key: 'temperature',
        minValue: -30,
        step: 2,
        positions: [
          { cx: 1040, cy: 753 }, // -30°C
          { cx: 1040, cy: 706 }, // -28°C
          { cx: 1040, cy: 674 }, // -26°C
          { cx: 1040, cy: 642 }, // -24°C
          { cx: 1040, cy: 608 }, // -22°C
          { cx: 1040, cy: 577 }, // -20°C
          { cx: 1040, cy: 545 }, // -18°C
          { cx: 1040, cy: 512 }, // -16°C
          { cx: 1040, cy: 480 }, // -14°C
          { cx: 1040, cy: 448 }, // -12°C
          { cx: 1040, cy: 416 }, // -10°C
          { cx: 1040, cy: 383 }, // -8°C
          { cx: 1040, cy: 352 }, // -6°C
          { cx: 1040, cy: 319 }, // -4°C
          { cx: 1040, cy: 287 }, // -2°C
          { cx: 1040, cy: 254 }, // 0°C
          { cx: 1040, cy: 222 }, // +2°C
          { cx: 1040, cy: 189 }, // +4°C
          { cx: 1040, cy: 158 }, // +6°C
          { cx: 1040, cy: 125 }, // +8°C
        ],
      },
    ],
    milestones: [
      { name: 'Terraformer', cx: 55, cy: 889, metric: '35 TR', threshold: 35, useTR: true },
      { name: 'Mayor', cx: 161, cy: 889, metric: '3 city tiles', threshold: 3, useTileCounts: 'cities' },
      { name: 'Gardener', cx: 272, cy: 889, metric: '3 greeneries', threshold: 3, useTileCounts: 'greeneries' },
      { name: 'Builder', cx: 378, cy: 889, metric: '8 building tags', threshold: 8, stats: [{ tag: 'building' }], includeWildTags: true },
      { name: 'Planner', cx: 488, cy: 889, metric: '16 cards in hand', threshold: 16, useHandCount: true },
    ],
    awards: [
      { name: 'Landlord', cx: 643, cy: 889, metric: 'Most tiles', useTileCounts: 'total' },
      { name: 'Banker', cx: 751, cy: 889, metric: 'Most MC production', stats: [{ production: 'mc' }] },
      { name: 'Scientist', cx: 860, cy: 889, metric: 'Most science tags', stats: [{ tag: 'science' }] },
      { name: 'Thermalist', cx: 968, cy: 889, metric: 'Most heat resources', stats: [{ resource: 'heat' }] },
      { name: 'Miner', cx: 1076, cy: 889, metric: 'Most steel + titanium', stats: [{ resource: 'steel' }, { resource: 'titanium' }] },
    ],
    milestonesLabel: { cx: 300, cy: 845, width: 200, height: 30 },
    awardsLabel: { cx: 870, cy: 845, width: 200, height: 30 },
  },
  Hellas: {
    offMapTiles: [
      { name: 'Phobos Space Haven', tileType: 'city', cx: 121, cy: 163 },
      { name: 'Ganymede Colony', tileType: 'city', cx: 89, cy: 321 },
    ],
    trackers: [
      { key: 'oceans', cx: 234, cy: 47 },
      { key: 'generation', cx: 960, cy: 35 },
    ],
    cubeTrackers: [
      {
        key: 'oxygen',
        minValue: 0,
        step: 1,
        positions: [
          { cx: 248, cy: 170 }, // 0%
          { cx: 284, cy: 140 }, // 1%
          { cx: 330, cy: 110 }, // 2%
          { cx: 376, cy: 84 },  // 3%
          { cx: 424, cy: 67 },  // 4%
          { cx: 475, cy: 52 },  // 5%
          { cx: 524, cy: 46 },  // 6%
          { cx: 572, cy: 42 },  // 7%
          { cx: 623, cy: 44 },  // 8%
          { cx: 673, cy: 51 },  // 9%
          { cx: 723, cy: 64 },  // 10%
          { cx: 768, cy: 81 },  // 11%
          { cx: 816, cy: 104 }, // 12%
          { cx: 861, cy: 133 }, // 13%
          { cx: 901, cy: 166 }, // 14%
        ],
      },
      {
        key: 'temperature',
        minValue: -30,
        step: 2,
        positions: [
          { cx: 1040, cy: 753 }, // -30°C
          { cx: 1040, cy: 706 }, // -28°C
          { cx: 1040, cy: 674 }, // -26°C
          { cx: 1040, cy: 642 }, // -24°C
          { cx: 1040, cy: 608 }, // -22°C
          { cx: 1040, cy: 577 }, // -20°C
          { cx: 1040, cy: 545 }, // -18°C
          { cx: 1040, cy: 512 }, // -16°C
          { cx: 1040, cy: 480 }, // -14°C
          { cx: 1040, cy: 448 }, // -12°C
          { cx: 1040, cy: 416 }, // -10°C
          { cx: 1040, cy: 383 }, // -8°C
          { cx: 1040, cy: 352 }, // -6°C
          { cx: 1040, cy: 319 }, // -4°C
          { cx: 1040, cy: 287 }, // -2°C
          { cx: 1040, cy: 254 }, // 0°C
          { cx: 1040, cy: 222 }, // +2°C
          { cx: 1040, cy: 189 }, // +4°C
          { cx: 1040, cy: 158 }, // +6°C
          { cx: 1040, cy: 125 }, // +8°C
        ],
      },
    ],
    milestones: [
      { name: 'Diversifier', cx: 60, cy: 884, metric: '8 different tags', threshold: 8, customScorer: diversifierScorer },
      { name: 'Tactician', cx: 166, cy: 884, metric: '5 cards with requirements', threshold: 5, customScorer: tacticianScorer },
      { name: 'Polar Explorer', cx: 277, cy: 884, metric: '3 tiles in bottom 2 rows', threshold: 3, customScorer: polarExplorerScorer },
      { name: 'Energizer', cx: 383, cy: 884, metric: '6 energy production', threshold: 6, stats: [{ production: 'energy' }] },
      { name: 'Rim Settler', cx: 493, cy: 884, metric: '3 Jovian tags', threshold: 3, stats: [{ tag: 'jovian' }], includeWildTags: true },
    ],
    awards: [
      { name: 'Cultivator', cx: 648, cy: 884, metric: 'Most greenery tiles', useTileCounts: 'greeneries' },
      { name: 'Magnate', cx: 756, cy: 884, metric: 'Most automated cards (green)', customScorer: magnateScorer },
      { name: 'Space Baron', cx: 865, cy: 884, metric: 'Most space tags', stats: [{ tag: 'space' }] },
      { name: 'Eccentric', cx: 973, cy: 884, metric: 'Most resources on cards' },
      { name: 'Contractor', cx: 1081, cy: 884, metric: 'Most building tags', stats: [{ tag: 'building' }] },
    ],
    milestonesLabel: { cx: 300, cy: 840, width: 200, height: 30 },
    awardsLabel: { cx: 870, cy: 840, width: 200, height: 30 },
  },
  Elysium: {
    offMapTiles: [
      { name: 'Phobos Space Haven', tileType: 'city', cx: 119, cy: 168 },
      { name: 'Ganymede Colony', tileType: 'city', cx: 87, cy: 326 },
    ],
    trackers: [
      { key: 'oceans', cx: 232, cy: 48 },
      { key: 'generation', cx: 958, cy: 38 },
    ],
    cubeTrackers: [
      {
        key: 'oxygen',
        minValue: 0,
        step: 1,
        positions: [
          { cx: 248, cy: 170 },
          { cx: 284, cy: 140 },
          { cx: 330, cy: 110 },
          { cx: 376, cy: 84 },
          { cx: 424, cy: 67 },
          { cx: 475, cy: 52 },
          { cx: 524, cy: 46 },
          { cx: 572, cy: 42 },
          { cx: 623, cy: 44 },
          { cx: 673, cy: 51 },
          { cx: 723, cy: 64 },
          { cx: 768, cy: 81 },
          { cx: 816, cy: 104 },
          { cx: 861, cy: 133 },
          { cx: 901, cy: 166 },
        ],
      },
      {
        key: 'temperature',
        minValue: -30,
        step: 2,
        positions: [
          { cx: 1040, cy: 753 },
          { cx: 1040, cy: 706 },
          { cx: 1040, cy: 674 },
          { cx: 1040, cy: 642 },
          { cx: 1040, cy: 608 },
          { cx: 1040, cy: 577 },
          { cx: 1040, cy: 545 },
          { cx: 1040, cy: 512 },
          { cx: 1040, cy: 480 },
          { cx: 1040, cy: 448 },
          { cx: 1040, cy: 416 },
          { cx: 1040, cy: 383 },
          { cx: 1040, cy: 352 },
          { cx: 1040, cy: 319 },
          { cx: 1040, cy: 287 },
          { cx: 1040, cy: 254 },
          { cx: 1040, cy: 222 },
          { cx: 1040, cy: 189 },
          { cx: 1040, cy: 158 },
          { cx: 1040, cy: 125 },
        ],
      },
    ],
    milestones: [
      { name: 'Generalist', cx: 59, cy: 889, metric: '1 of each production', threshold: 6, customScorer: generalistScorer },
      { name: 'Specialist', cx: 161, cy: 889, metric: '10 production of one resource', threshold: 10, customScorer: specialistScorer },
      { name: 'Ecologist', cx: 272, cy: 889, metric: '4 bio tags', threshold: 4, customScorer: ecologistScorer },
      { name: 'Tycoon', cx: 385, cy: 889, metric: '15 blue or green cards', threshold: 15, customScorer: tycoonScorer },
      { name: 'Legend', cx: 488, cy: 889, metric: '5 events played', threshold: 5, customScorer: legendScorer },
    ],
    awards: [
      { name: 'Celebrity', cx: 643, cy: 889, metric: 'Most cards costing 20+ MC', customScorer: celebrityScorer },
      { name: 'Industrialist', cx: 751, cy: 889, metric: 'Most steel + energy resources', stats: [{ resource: 'steel' }, { resource: 'energy' }] },
      { name: 'Desert Settler', cx: 860, cy: 889, metric: 'Most tiles below equator', customScorer: desertSettlerScorer },
      { name: 'Estate Dealer', cx: 968, cy: 889, metric: 'Most tiles adjacent to ocean', customScorer: estateDealerScorer },
      { name: 'Benefactor', cx: 1076, cy: 889, metric: 'Highest TR', customScorer: benefactorScorer },
    ],
    milestonesLabel: { cx: 300, cy: 835, width: 200, height: 30 },
    awardsLabel: { cx: 870, cy: 835, width: 200, height: 30 },
  },
  'Vastitas Borealis': {
    offMapTiles: [
      { name: 'Phobos Space Haven', tileType: 'city', cx: 119, cy: 168 },
      { name: 'Ganymede Colony', tileType: 'city', cx: 87, cy: 326 },
    ],
    trackers: [
      { key: 'oceans', cx: 232, cy: 50 },
      { key: 'generation', cx: 958, cy: 38 },
    ],
    cubeTrackers: [
      {
        key: 'oxygen',
        minValue: 0,
        step: 1,
        positions: [
          { cx: 248, cy: 170 },
          { cx: 284, cy: 140 },
          { cx: 330, cy: 110 },
          { cx: 376, cy: 84 },
          { cx: 424, cy: 67 },
          { cx: 475, cy: 52 },
          { cx: 524, cy: 46 },
          { cx: 572, cy: 42 },
          { cx: 623, cy: 44 },
          { cx: 673, cy: 51 },
          { cx: 723, cy: 64 },
          { cx: 768, cy: 81 },
          { cx: 816, cy: 104 },
          { cx: 861, cy: 133 },
          { cx: 901, cy: 166 },
        ],
      },
      {
        key: 'temperature',
        minValue: -30,
        step: 2,
        positions: [
          { cx: 1040, cy: 753 },
          { cx: 1040, cy: 706 },
          { cx: 1040, cy: 674 },
          { cx: 1040, cy: 642 },
          { cx: 1040, cy: 608 },
          { cx: 1040, cy: 577 },
          { cx: 1040, cy: 545 },
          { cx: 1040, cy: 512 },
          { cx: 1040, cy: 480 },
          { cx: 1040, cy: 448 },
          { cx: 1040, cy: 416 },
          { cx: 1040, cy: 383 },
          { cx: 1040, cy: 352 },
          { cx: 1040, cy: 319 },
          { cx: 1040, cy: 287 },
          { cx: 1040, cy: 254 },
          { cx: 1040, cy: 222 },
          { cx: 1040, cy: 189 },
          { cx: 1040, cy: 158 },
          { cx: 1040, cy: 125 },
        ],
      },
    ],
    milestones: [
      { name: 'Agronomist', cx: 55, cy: 886, metric: '4 plant tags', threshold: 4, stats: [{ tag: 'plant' }], includeWildTags: true },
      { name: 'Engineer', cx: 161, cy: 886, metric: '10 heat + energy production', threshold: 10, customScorer: engineerScorer },
      { name: 'Spacefarer', cx: 272, cy: 886, metric: '4 space tags', threshold: 4, stats: [{ tag: 'space' }], includeWildTags: true },
      { name: 'Geologist', cx: 378, cy: 886, metric: '3 tiles at/adjacent to volcanic areas', threshold: 3, customScorer: geologistScorer },
      { name: 'Farmer', cx: 488, cy: 886, metric: '5 animal or microbe resources', threshold: 5, customScorer: farmerScorer },
    ],
    awards: [
      { name: 'Traveller', cx: 643, cy: 886, metric: 'Most Jovian + Earth tags', customScorer: travellerScorer },
      { name: 'Landscaper', cx: 751, cy: 886, metric: 'Biggest cluster of tiles', customScorer: landscaperScorer },
      { name: 'Highlander', cx: 860, cy: 886, metric: 'Most tiles not next to oceans', customScorer: highlanderScorer },
      { name: 'Promoter', cx: 968, cy: 886, metric: 'Most event cards played', customScorer: promoterScorer },
      { name: 'Blacksmith', cx: 1076, cy: 886, metric: 'Most steel + titanium production', stats: [{ production: 'steel' }, { production: 'titanium' }] },
    ],
    milestonesLabel: { cx: 300, cy: 842, width: 200, height: 30 },
    awardsLabel: { cx: 870, cy: 842, width: 200, height: 30 },
  },
};

export function getMapOverlays(mapName: string): MapOverlays {
  return overlays[mapName] ?? {};
}
