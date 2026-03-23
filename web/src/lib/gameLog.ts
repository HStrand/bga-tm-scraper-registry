import { api } from '@/lib/api';
import type { GameLog, GameLogMove } from '@/types/gamelog';

export interface TilePlacement {
  tileType: string;
  location: string;
  dbKey: string;
}

export async function fetchGameLog(tableId: string, playerId: string): Promise<GameLog> {
  const res = await api.get<GameLog>(`/api/game-log/${playerId}/${tableId}`);
  return res.data;
}

export function extractTilePlacement(move: GameLogMove): TilePlacement | null {
  // Use structured fields when available
  if (move.tile_placed && move.tile_location) {
    return {
      tileType: move.tile_placed,
      location: move.tile_location,
      dbKey: parseTileLocationToDbKey(move.tile_location),
    };
  }

  // Fall back to parsing the description for placements like:
  // "PlayerName places Greenery on  Hex 5,8 (5,8) | ..."
  // "PlayerName places City on  Noctis City (3,5) | ..."
  // "PlayerName places Ocean on  Hex 7,4 (7,4) | ..."
  const descMatch = move.description?.match(
    /places\s+(Greenery|City|Ocean|Forest)\s+on\s+(.+?)\s*(?:\||$)/i
  );
  if (descMatch) {
    const tileType = descMatch[1];
    const rawLocation = descMatch[2].trim();
    return {
      tileType,
      location: rawLocation,
      dbKey: parseTileLocationToDbKey(rawLocation),
    };
  }

  return null;
}

// Named tiles that are real special locations (not just region labels on regular hexes).
// Locations not in this set fall back to "Hex col,row" using their coordinates.
const KNOWN_NAMED_TILES = new Set([
  // Tharsis
  'Tharsis Tholus', 'Ascraeus Mons', 'Pavonis Mons', 'Arsia Mons', 'Noctis City',
  // Hellas
  'South Pole',
  // Elysium
  'Hecatus Tholus', 'Elysium Mons', 'Olympus Mons',
  // Vastitas Borealis
  'Hecates Tholus', 'Alba Mons', 'Viking 2', 'Uranius Tholus', 'Viking 1',
  // Amazonis Planitia
  'Viking',
  // Off-map
  'Phobos Space Haven', 'Ganymede Colony',
]);

export function parseTileLocationToDbKey(tileLocation: string): string {
  // "Tharsis Hex 4,1 (4,1)" → "Hex 4,1"
  // "Hex 5,8 (5,8)" → "Hex 5,8"
  const hexMatch = tileLocation.match(/Hex (\d+,\d+)/);
  if (hexMatch) {
    return `Hex ${hexMatch[1]}`;
  }

  // "Noctis City (3,5)" → "Noctis City"
  // "Argyre Planitia (2,7)" → "Hex 2,7" (not a special tile, just a region label)
  const namedMatch = tileLocation.match(/^(.+?)\s*\((\d+,\d+)\)$/);
  if (namedMatch) {
    const name = namedMatch[1].trim();
    if (KNOWN_NAMED_TILES.has(name)) {
      return name;
    }
    // Region label on a regular hex — use coordinates
    return `Hex ${namedMatch[2]}`;
  }

  return tileLocation;
}

const PLAYER_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
];

export function assignPlayerColors(playerIds: string[], playerData?: Record<string, { color?: string }>): Record<string, string> {
  const colors: Record<string, string> = {};
  playerIds.forEach((id, i) => {
    colors[id] = playerData?.[id]?.color ?? PLAYER_COLORS[i % PLAYER_COLORS.length];
  });
  return colors;
}
