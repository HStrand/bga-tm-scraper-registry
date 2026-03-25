import { hexCenter, hexPoints, type MapDefinition } from '@/data/mapHexes';
import { getMapOverlays } from '@/data/mapOverlays';
import type { GameState } from '@/types/gamelog';
import cityTileImage from '/assets/tiles/city tile.png';
import greeneryTileImage from '/assets/tiles/greenery tile.png';
import oceanTileImage from '/assets/tiles/ocean tile.png';

const specialTileImages = import.meta.glob('../../../assets/tiles/*.png', { eager: true }) as Record<string, { default: string }>;
const cubeImages = import.meta.glob('../../../assets/cubes/*.png', { eager: true }) as Record<string, { default: string }>;

function getSpecialTileImage(tileType: string): string | undefined {
  const slug = tileType.toLowerCase();
  const entry = Object.entries(specialTileImages).find(([key]) => {
    const base = key.replace(/^.*[\\/]/, '').toLowerCase().replace('.png', '');
    return base === slug;
  });
  return entry?.[1].default;
}

function getCubeImage(hexColor: string): string | undefined {
  const slug = hexColor.replace('#', '').toLowerCase();
  const entry = Object.entries(cubeImages).find(([key]) =>
    key.replace(/^.*[\\/]/, '').toLowerCase() === `${slug}.png`
  );
  return entry?.[1].default;
}

export interface PlacedTile {
  dbKey: string;
  tileType: string;
  playerId: string;
  moveIndex: number;
}

interface ReplayMapProps {
  mapDefinition: MapDefinition;
  placedTiles: Map<string, PlacedTile>;
  playerColors: Record<string, string>;
  currentStep: number;
  gameState?: GameState;
  claimedMilestones?: Map<string, string>; // milestone name → player id
  fundedAwards?: Map<string, string>;      // award name → player id
}

export function ReplayMap({ mapDefinition, placedTiles, playerColors, currentStep, gameState, claimedMilestones, fundedAwards }: ReplayMapProps) {
  const tileSize = mapDefinition.grid.hexRadius * 2;
  return (
    <div className="relative inline-block select-none">
      <img
        src={mapDefinition.image}
        alt={`${mapDefinition.name} board`}
        width={mapDefinition.imageWidth}
        height={mapDefinition.imageHeight}
        className="block max-w-full h-auto"
        draggable={false}
      />
      <svg
        viewBox={`0 0 ${mapDefinition.imageWidth} ${mapDefinition.imageHeight}`}
        className="absolute top-0 left-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      >
        {mapDefinition.hexes.map(hex => {
          const { cx, cy } = hexCenter(mapDefinition.grid, hex.col, hex.row);
          const points = hexPoints(cx, cy, mapDefinition.grid.hexRadius);
          const tile = placedTiles.get(hex.dbKey);

          if (!tile) {
            return (
              <polygon
                key={`${hex.col},${hex.row}`}
                points={points}
                fill="transparent"
                stroke="transparent"
              />
            );
          }

          const isCurrentMove = tile.moveIndex === currentStep;
          const tileNorm = tile.tileType.toLowerCase();
          const isOcean = tileNorm === 'ocean';
          const isCity = tileNorm === 'city';
          const isGreenery = tileNorm === 'greenery' || tileNorm === 'forest';

          const tileImg = isCity ? cityTileImage
            : isGreenery ? greeneryTileImage
            : isOcean ? oceanTileImage
            : getSpecialTileImage(tile.tileType) ?? null;

          const color = playerColors[tile.playerId] ?? '#888';
          const cubeSize = tileSize * 0.4;

          const imgSize = isOcean ? tileSize * 1.4 : tileSize;

          return (
            <g key={`${hex.col},${hex.row}`}>
              {tileImg ? (
                <image
                  href={tileImg}
                  x={cx - imgSize / 2}
                  y={cy - imgSize / 2}
                  width={imgSize}
                  height={imgSize}
                />
              ) : (
                <polygon
                  points={points}
                  fill={isOcean ? 'rgba(59, 130, 246, 0.7)' : color}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={1}
                />
              )}
              {/* Player cube in center (not on oceans) */}
              {!isOcean && (getCubeImage(color) ? (
                <image
                  href={getCubeImage(color)!}
                  x={cx - cubeSize / 2}
                  y={cy - cubeSize / 2}
                  width={cubeSize}
                  height={cubeSize}
                />
              ) : (
                <rect
                  x={cx - cubeSize / 2}
                  y={cy - cubeSize / 2}
                  width={cubeSize}
                  height={cubeSize}
                  rx={2}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={1}
                />
              ))}
            </g>
          );
        })}
        {/* Off-map tiles from map overlay config */}
        {(() => {
          const overlays = getMapOverlays(mapDefinition.name);
          if (!overlays.offMapTiles) return null;
          const tileImages: Record<string, string> = { city: cityTileImage, greenery: greeneryTileImage };
          return overlays.offMapTiles.map(({ name, tileType, cx, cy }) => {
            const tile = placedTiles.get(name);
            if (!tile || tile.moveIndex > currentStep) return null;
            const color = playerColors[tile.playerId] ?? '#888';
            const size = tileSize;
            const cubeSize = tileSize * 0.4;
            const img = tileImages[tileType] ?? getSpecialTileImage(tile.tileType);
            return (
              <g key={`offmap-${name}`}>
                {img && (
                  <image href={img} x={cx - size / 2} y={cy - size / 2} width={size} height={size} />
                )}
                {getCubeImage(color) ? (
                  <image href={getCubeImage(color)!} x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} />
                ) : (
                  <rect x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} rx={2} fill={color} stroke="#fff" strokeWidth={1} />
                )}
              </g>
            );
          });
        })()}

        {/* Global parameter trackers on map */}
        {gameState && (() => {
          const overlays = getMapOverlays(mapDefinition.name);
          if (!overlays.trackers) return null;
          const values: Record<string, number | null> = {
            oceans: gameState.oceans,
            generation: gameState.generation,
            temperature: gameState.temperature,
            oxygen: gameState.oxygen,
          };
          return overlays.trackers.map(({ key, cx, cy }) => {
            const val = values[key];
            if (val == null) return null;
            const label = key === 'oceans' ? String(9 - val)
              : key === 'temperature' ? `${val}°`
              : key === 'oxygen' ? `${val}%`
              : String(val);
            return (
              <text key={`tracker-${key}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={28} fontWeight="bold" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.5))' }}>
                {label}
              </text>
            );
          });
        })()}

        {/* Cube trackers (oxygen, temperature) */}
        {gameState && (() => {
          const overlays = getMapOverlays(mapDefinition.name);
          if (!overlays.cubeTrackers) return null;
          const values: Record<string, number | null> = {
            oxygen: gameState.oxygen,
            temperature: gameState.temperature,
          };
          const cubeSize = tileSize * 0.45;
          return overlays.cubeTrackers.map(({ key, positions, minValue, step }) => {
            const val = values[key];
            if (val == null) return null;
            const idx = Math.max(0, Math.min(positions.length - 1, Math.round((val - minValue) / step)));
            const { cx, cy } = positions[idx];
            return (
              <image
                key={`cube-tracker-${key}`}
                href={getCubeImage('#ffffff') ?? ''}
                x={cx - cubeSize / 2}
                y={cy - cubeSize / 2}
                width={cubeSize}
                height={cubeSize}
                style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.5))' }}
              />
            );
          });
        })()}

        {/* Milestones & Awards cubes */}
        {(() => {
          const overlays = getMapOverlays(mapDefinition.name);
          const cubeSize = tileSize * 0.4;
          const entries: { name: string; cx: number; cy: number; playerId: string }[] = [];
          if (overlays.milestones && claimedMilestones) {
            for (const m of overlays.milestones) {
              const pid = claimedMilestones.get(m.name.toUpperCase());
              if (pid) entries.push({ ...m, playerId: pid });
            }
          }
          if (overlays.awards && fundedAwards) {
            for (const a of overlays.awards) {
              const pid = fundedAwards.get(a.name.toLowerCase());
              if (pid) entries.push({ ...a, playerId: pid });
            }
          }
          return entries.map(({ name, cx, cy, playerId }) => {
            const color = playerColors[playerId] ?? '#888';
            const cube = getCubeImage(color);
            return cube ? (
              <image key={`ma-${name}`} href={cube} x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} />
            ) : (
              <rect key={`ma-${name}`} x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} rx={2} fill={color} stroke="#fff" strokeWidth={1} />
            );
          });
        })()}

        {/* Highlight for current move rendered last so it's on top */}
        {mapDefinition.hexes.map(hex => {
          const tile = placedTiles.get(hex.dbKey);
          if (!tile || tile.moveIndex !== currentStep) return null;
          const { cx, cy } = hexCenter(mapDefinition.grid, hex.col, hex.row);
          const points = hexPoints(cx, cy, mapDefinition.grid.hexRadius);
          return (
            <polygon
              key={`highlight-${hex.col},${hex.row}`}
              points={points}
              fill="none"
              stroke="#fff"
              strokeWidth={3}
            />
          );
        })}
      </svg>
    </div>
  );
}
