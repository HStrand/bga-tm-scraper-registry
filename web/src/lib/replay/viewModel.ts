// The game view model the replay components render. It is source-neutral: a scraped BGA game log and a
// tm-engine game are each projected into it by their own adapter (see bga/bgaAdapter.ts).

/** BGA player id, or an engine seat number ("0".."4"). */
export type SeatId = string;

export type ResourceKey = 'mc' | 'steel' | 'titanium' | 'plants' | 'energy' | 'heat';
export const RESOURCE_KEYS: readonly ResourceKey[] = ['mc', 'steel', 'titanium', 'plants', 'energy', 'heat'];

export type TagKey =
  | 'building' | 'space' | 'science' | 'power' | 'earth' | 'jovian'
  | 'city' | 'plant' | 'microbe' | 'animal' | 'wild' | 'event';
export const TAG_KEYS: readonly TagKey[] = [
  'building', 'space', 'science', 'power', 'earth', 'jovian',
  'city', 'plant', 'microbe', 'animal', 'wild', 'event',
];

export interface PlayerInfoVM {
  id: SeatId;
  name: string;
  color: string;
  corporation: string | null;
  elo?: number | null;
}

export interface GameInfoVM {
  source:
    | { kind: 'bga'; tableId: string; perspective: string }
    | {
        kind: 'engine';
        gameId: string;
        forkedFrom?: { tableId: string; moveIndex: number };
        parent?: { gameId: string; moveNumber: number };
      };
  mapName: string;
  options: { prelude: boolean | null; corporateEra: boolean | null; draft: boolean | null; colonies: boolean | null };
  /** In display order. */
  players: PlayerInfoVM[];
}

export interface TileCountsVM {
  cities: number;
  greeneries: number;
  total: number;
}

export interface VpVM {
  total: number | null;
  /** Null when the source gives only a total. */
  breakdown: {
    tr: number | null;
    milestones: number | null;
    awards: number | null;
    greeneries: number | null;
    cities: number | null;
    cards: number | null;
  } | null;
}

export type PlayerStatsVM = Pick<PlayerSnapshotVM, 'resources' | 'production' | 'tags'>;

export interface PlayerSnapshotVM {
  /** False when the source has no resource, production or tag data at this position; those fields are then all zero. */
  statsKnown: boolean;
  tr: number | null;
  resources: Record<ResourceKey, number>;
  production: Record<ResourceKey, number>;
  tags: Record<TagKey, number>;
  /** Tiles owned on and off the board; oceans are not owned. */
  tileCounts: TileCountsVM;
  vp: VpVM | null;
  /** Card names. Null when the hand is hidden, in which case handCount may still be known. */
  hand: string[] | null;
  handCount: number | null;
  /** Corporation and preludes. */
  headquarters: string[];
  /** Project cards played, in play order. */
  played: string[];
  sold: string[];
  /** Card name -> resources on that card. */
  cardResources: Record<string, number>;
  /** Action cards already used this generation. */
  usedActions: string[];
  passed?: boolean;
}

export interface TileVM {
  /** Stable key of the location: "Hex col,row", or the name of a named or off-map location. */
  hexKey: string;
  /** Null when only the name is known; resolve it through the map definition. */
  col: number | null;
  row: number | null;
  /** "City", "Forest"/"Greenery", "Ocean", or the name of a special tile. */
  type: string;
  /** Who placed the tile. Oceans have no owner but keep their placer. */
  placedBy: SeatId | null;
  /** Timeline index at which the tile appeared. */
  placedAt: number;
  generation: number | null;
}

export interface ClaimVM {
  /** Milestone or award name; compare case-insensitively (see findClaim). */
  name: string;
  playerId: SeatId;
  generation: number | null;
}

export interface GameSnapshotVM {
  /** Position in the timeline. */
  index: number;
  generation: number | null;
  phase?: string;
  /** Null when the source has no state for this position. */
  globals: { temperature: number | null; oxygen: number | null; oceans: number | null } | null;
  firstPlayerId?: SeatId;
  activePlayerId?: SeatId;
  players: Record<SeatId, PlayerSnapshotVM>;
  /** In placement order. */
  tiles: TileVM[];
  milestones: ClaimVM[];
  awards: ClaimVM[];
  piles: { draw: number | null; discard: number | null; discardCards?: string[] };
}

export interface LogEntryVM {
  index: number;
  moveNumber: number | null;
  playerId: SeatId | null;
  playerName: string;
  actionType: string;
  /** Log lines joined by " | ", as the move log renders them. */
  description: string;
  cardPlayed?: string;
  tile?: { type: string; hexKey: string };
  generation: number | null;
  /** Bookkeeping entries that stepping skips over. */
  hidden?: boolean;
}

export interface GameTimeline {
  info: GameInfoVM;
  length: number;
  log: LogEntryVM[];
  generationBoundaries: Map<number, { start: number; end: number }>;
  snapshotAt(index: number): GameSnapshotVM;
}

export function findClaim(claims: ClaimVM[], name: string): ClaimVM | undefined {
  const key = name.toLowerCase();
  return claims.find(c => c.name.toLowerCase() === key);
}

export function emptyPlayerStats(): PlayerStatsVM {
  const zero = <K extends string>(keys: readonly K[]) =>
    Object.fromEntries(keys.map(k => [k, 0])) as Record<K, number>;
  return { resources: zero(RESOURCE_KEYS), production: zero(RESOURCE_KEYS), tags: zero(TAG_KEYS) };
}
