import { hexCenter, hexPoints, type MapDefinition } from '@/data/mapHexes';
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
}

export function ReplayMap({ mapDefinition, placedTiles, playerColors, currentStep }: ReplayMapProps) {
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
        {/* Off-map tiles (Phobos Space Haven, Ganymede Colony) */}
        {mapDefinition.name === 'Tharsis' && (() => {
          const offMapLocations: Record<string, { cx: number; cy: number }> = {
            'Phobos Space Haven': { cx: 119, cy: 168 },
            'Ganymede Colony': { cx: 87, cy: 326 },
          };
          return Object.entries(offMapLocations).map(([name, { cx, cy }]) => {
            const tile = placedTiles.get(name);
            if (!tile || tile.moveIndex > currentStep) return null;
            const color = playerColors[tile.playerId] ?? '#888';
            const size = tileSize;
            const cubeSize = tileSize * 0.4;
            return (
              <g key={`offmap-${name}`}>
                <image
                  href={cityTileImage}
                  x={cx - size / 2}
                  y={cy - size / 2}
                  width={size}
                  height={size}
                />
                {getCubeImage(color) ? (
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
                )}
              </g>
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
