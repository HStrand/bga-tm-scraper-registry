// Per-map overlay coordinates for off-map tiles, global parameter trackers,
// milestones, awards, and other fixed UI elements rendered on the map image.

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

export interface MilestoneAwardOverlay {
  name: string;
  cx: number;
  cy: number;
  metric?: string;
  threshold?: number;
  trackerKeys?: string[];
  altKeys?: boolean;
  useTileCounts?: 'cities' | 'greeneries' | 'total';
  useHandCount?: boolean;
  useTR?: boolean;
}

export interface AwardOverlay extends MilestoneAwardOverlay {
  metric: string; // description of what's measured
  trackerKeys: string[]; // keys from player_trackers
  altKeys?: boolean; // if true, keys are alternates (take max); if false/absent, sum them
  useTileCounts?: 'total'; // use tile counts instead of tracker keys
}

export interface MapOverlays {
  offMapTiles?: OffMapTile[];
  trackers?: TrackerOverlay[];
  cubeTrackers?: CubeTracker[];
  milestones?: MilestoneAwardOverlay[];
  awards?: AwardOverlay[];
}

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
      { name: 'Builder', cx: 378, cy: 889, metric: '8 building tags', threshold: 8, trackerKeys: ['Building tag', 'Count of Building tags'], altKeys: true },
      { name: 'Planner', cx: 488, cy: 889, metric: '16 cards in hand', threshold: 16, useHandCount: true },
    ],
    awards: [
      { name: 'Landlord', cx: 643, cy: 889, metric: 'Most tiles', trackerKeys: [], useTileCounts: 'total' },
      { name: 'Banker', cx: 751, cy: 889, metric: 'Most MC production', trackerKeys: ['M€ Production'] },
      { name: 'Scientist', cx: 860, cy: 889, metric: 'Most science tags', trackerKeys: ['Science tag', 'Count of Science tags'], altKeys: true },
      { name: 'Thermalist', cx: 968, cy: 889, metric: 'Most heat resources', trackerKeys: ['Heat'] },
      { name: 'Miner', cx: 1076, cy: 889, metric: 'Most steel + titanium', trackerKeys: ['Steel', 'Titanium'] },
    ],
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
      { name: 'Diversifier', cx: 60, cy: 884 },
      { name: 'Tactician', cx: 166, cy: 884 },
      { name: 'Polar Explorer', cx: 277, cy: 884 },
      { name: 'Energizer', cx: 383, cy: 884 },
      { name: 'Rim Settler', cx: 493, cy: 884 },
    ],
    awards: [
      { name: 'Cultivator', cx: 648, cy: 884, metric: 'Most greeneries', trackerKeys: [], useTileCounts: 'total' },
      { name: 'Magnate', cx: 756, cy: 884, metric: 'Most event cards', trackerKeys: ['Event tag', 'Count of played Events cards'], altKeys: true },
      { name: 'Space Baron', cx: 865, cy: 884, metric: 'Most space tags', trackerKeys: ['Space tag', 'Count of Space tags'], altKeys: true },
      { name: 'Eccentric', cx: 973, cy: 884, metric: 'Most resources on cards', trackerKeys: [] },
      { name: 'Contractor', cx: 1081, cy: 884, metric: 'Most building tags', trackerKeys: ['Building tag', 'Count of Building tags'], altKeys: true },
    ],
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
      { name: 'Generalist', cx: 59, cy: 889 },
      { name: 'Specialist', cx: 161, cy: 889 },
      { name: 'Ecologist', cx: 272, cy: 889 },
      { name: 'Tycoon', cx: 385, cy: 889 },
      { name: 'Legend', cx: 488, cy: 889 },
    ],
    awards: [
      { name: 'Celebrity', cx: 643, cy: 889, metric: 'Most VP on cards', trackerKeys: [] },
      { name: 'Industrialist', cx: 751, cy: 889, metric: 'Most steel + energy resources', trackerKeys: ['Steel', 'Energy'] },
      { name: 'Desert Settler', cx: 860, cy: 889, metric: 'Most tiles', trackerKeys: [], useTileCounts: 'total' },
      { name: 'Estate Dealer', cx: 968, cy: 889, metric: 'Most tiles adjacent to ocean', trackerKeys: [] },
      { name: 'Benefactor', cx: 1076, cy: 889, metric: 'Highest TR', trackerKeys: [] },
    ],
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
      { name: 'Agronomist', cx: 55, cy: 886 },
      { name: 'Engineer', cx: 161, cy: 886 },
      { name: 'Spacefarer', cx: 272, cy: 886 },
      { name: 'Geologist', cx: 378, cy: 886 },
      { name: 'Farmer', cx: 488, cy: 886 },
    ],
    awards: [
      { name: 'Traveller', cx: 643, cy: 886, metric: 'Most space tags', trackerKeys: ['Space tag', 'Count of Space tags'], altKeys: true },
      { name: 'Landscape', cx: 751, cy: 886, metric: 'Most tiles', trackerKeys: [], useTileCounts: 'total' },
      { name: 'Highlander', cx: 860, cy: 886, metric: 'Most tiles on volcanic areas', trackerKeys: [] },
      { name: 'Promoter', cx: 968, cy: 886, metric: 'Most MC production', trackerKeys: ['M€ Production'] },
      { name: 'Blacksmith', cx: 1076, cy: 886, metric: 'Most steel + titanium production', trackerKeys: ['Steel Production', 'Titanium Production'] },
    ],
  },
};

export function getMapOverlays(mapName: string): MapOverlays {
  return overlays[mapName] ?? {};
}
