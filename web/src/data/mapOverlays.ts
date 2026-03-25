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
}

export interface MapOverlays {
  offMapTiles?: OffMapTile[];
  trackers?: TrackerOverlay[];
  cubeTrackers?: CubeTracker[];
  milestones?: MilestoneAwardOverlay[];
  awards?: MilestoneAwardOverlay[];
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
      { name: 'Terraformer', cx: 55, cy: 889 },
      { name: 'Mayor', cx: 161, cy: 889 },
      { name: 'Gardener', cx: 272, cy: 889 },
      { name: 'Builder', cx: 378, cy: 889 },
      { name: 'Planner', cx: 488, cy: 889 },
    ],
    awards: [
      { name: 'Landlord', cx: 643, cy: 889 },
      { name: 'Banker', cx: 751, cy: 889 },
      { name: 'Scientist', cx: 860, cy: 889 },
      { name: 'Thermalist', cx: 968, cy: 889 },
      { name: 'Miner', cx: 1076, cy: 889 },
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
      { name: 'Cultivator', cx: 648, cy: 884 },
      { name: 'Magnate', cx: 756, cy: 884 },
      { name: 'Space Baron', cx: 865, cy: 884 },
      { name: 'Eccentric', cx: 973, cy: 884 },
      { name: 'Contractor', cx: 1081, cy: 884 },
    ],
  },
};

export function getMapOverlays(mapName: string): MapOverlays {
  return overlays[mapName] ?? {};
}
