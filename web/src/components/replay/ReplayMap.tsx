import { useState } from 'react';
import { hexCenter, hexPoints, type MapDefinition } from '@/data/mapHexes';
import type { GameState } from '@/types/gamelog';
import type { ClaimFundInfo } from '@/lib/replayUtils';
import { MapOverlaysSvg, MapMilestonesAwardsSvg, MapTooltip, type TooltipData } from './MapOverlays';
import cityTileImage from '/assets/tiles/city tile.png';
import greeneryTileImage from '/assets/tiles/greenery tile.png';
import oceanTileImage from '/assets/tiles/ocean tile.png';
import tileHighlightImage from '/assets/tiles/tile highlight.png';

const specialTileImages = import.meta.glob('../../../assets/tiles/*.png', { eager: true }) as Record<string, { default: string }>;
const cubeImages = import.meta.glob('../../../assets/cubes/*.png', { eager: true }) as Record<string, { default: string }>;

// Tile type aliases for cases where the game log name differs from the image filename
const TILE_ALIASES: Record<string, string> = {
  'mining area': 'mining',
  'mining rights': 'mining',
};

function getSpecialTileImage(tileType: string): string | undefined {
  const slug = TILE_ALIASES[tileType.toLowerCase()] ?? tileType.toLowerCase();
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
  claimedMilestones?: Map<string, ClaimFundInfo>;
  fundedAwards?: Map<string, ClaimFundInfo>;
  playerNames?: Record<string, string>;
  playerTrackers?: Record<string, Record<string, number>>;
  playerTileCounts?: Record<string, { cities: number; greeneries: number; total: number }>;
  playerHandCounts?: Record<string, number>;
  playerPlayedCards?: Record<string, string[]>;
  playerCardResources?: Record<string, Record<string, number>>;
  moves?: import('@/types/gamelog').GameLogMove[];
}

export function ReplayMap({ mapDefinition, placedTiles, playerColors, currentStep, gameState, claimedMilestones, fundedAwards, playerNames, playerTrackers, playerTileCounts, playerHandCounts, playerPlayedCards, playerCardResources, moves }: ReplayMapProps) {
  const tileSize = mapDefinition.grid.hexRadius * 2;
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const overlayProps = {
    mapName: mapDefinition.name,
    imageWidth: mapDefinition.imageWidth,
    imageHeight: mapDefinition.imageHeight,
    tileSize,
    placedTiles,
    playerColors,
    currentStep,
    gameState,
    claimedMilestones,
    fundedAwards,
    playerNames,
    playerTrackers,
    playerTileCounts,
    playerHandCounts,
    playerPlayedCards,
    playerCardResources,
    hexCoords: new Map(mapDefinition.hexes.map(h => [h.dbKey, [h.col, h.row] as [number, number]])),
    getCubeImage,
    cityTileImage,
    greeneryTileImage,
    getSpecialTileImage,
  };

  return (
    <div className="relative inline-block select-none" onMouseMove={handleMouseMove}>
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
        {/* Hex tiles */}
        {mapDefinition.hexes.map(hex => {
          const { cx, cy } = hexCenter(mapDefinition.grid, hex.col, hex.row);
          const points = hexPoints(cx, cy, mapDefinition.grid.hexRadius);
          const tile = placedTiles.get(hex.dbKey);

          if (!tile) {
            return (
              <polygon key={`${hex.col},${hex.row}`} points={points} fill="transparent" stroke="transparent" />
            );
          }

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
          const imgSize = isOcean ? tileSize * 1.28 : tileSize;

          return (
            <g key={`${hex.col},${hex.row}`}>
              {tileImg ? (
                <image href={tileImg} x={cx - imgSize / 2} y={cy - imgSize / 2} width={imgSize} height={imgSize} />
              ) : (
                <polygon points={points} fill={isOcean ? 'rgba(59, 130, 246, 0.7)' : color} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
              )}
              {!isOcean && (getCubeImage(color) ? (
                <image href={getCubeImage(color)!} x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} />
              ) : (
                <rect x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} rx={2} fill={color} stroke="#fff" strokeWidth={1} />
              ))}
            </g>
          );
        })}

        {/* Map overlays: off-map tiles, trackers, cube trackers */}
        <MapOverlaysSvg {...overlayProps} />

        {/* Milestones & Awards with hover tooltips */}
        <MapMilestonesAwardsSvg {...overlayProps} setTooltip={setTooltip} />

        {/* Highlight for current move */}
        {mapDefinition.hexes.map(hex => {
          const tile = placedTiles.get(hex.dbKey);
          if (!tile || tile.moveIndex !== currentStep) return null;
          const { cx, cy } = hexCenter(mapDefinition.grid, hex.col, hex.row);
          const points = hexPoints(cx, cy, mapDefinition.grid.hexRadius);
          const color = playerColors[tile.playerId] ?? '#d97706';
          const filterId = `hex-glow-${hex.col}-${hex.row}`;
          return (
            <g key={`highlight-${hex.col},${hex.row}`}>
              <defs>
                <filter id={filterId}>
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feFlood floodColor={color} floodOpacity="0.8" result="color" />
                  <feComposite in="color" in2="blur" operator="in" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <polygon points={points} fill="none" stroke={color} strokeWidth={3} filter={`url(#${filterId})`} />
            </g>
          );
        })}

        {/* Hex tile hover areas */}
        {mapDefinition.hexes.map(hex => {
          const tile = placedTiles.get(hex.dbKey);
          if (!tile) return null;
          const { cx, cy } = hexCenter(mapDefinition.grid, hex.col, hex.row);
          const points = hexPoints(cx, cy, mapDefinition.grid.hexRadius);
          const tileNorm = tile.tileType.toLowerCase();
          const tileLabel = tileNorm === 'city' ? 'City'
            : (tileNorm === 'greenery' || tileNorm === 'forest') ? 'Greenery'
            : tileNorm === 'ocean' ? 'Ocean'
            : tile.tileType;
          const pName = playerNames?.[tile.playerId] ?? tile.playerId;
          const pColor = playerColors[tile.playerId] ?? '#888';
          const gen = moves?.[tile.moveIndex]?.game_state?.generation;
          const hexName = hex.name ?? hex.dbKey;
          return (
            <polygon
              key={`hover-${hex.col},${hex.row}`}
              points={points}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              onMouseEnter={() => setTooltip({
                title: hexName,
                type: 'hex-tile',
                tileType: tileLabel,
                playerName: tileNorm === 'ocean' ? undefined : pName,
                playerColor: tileNorm === 'ocean' ? undefined : pColor,
                generation: gen ?? undefined,
                coordinates: `${hex.col}, ${hex.row}`,
              })}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}
      </svg>

      <MapTooltip tooltip={tooltip} tooltipPos={tooltipPos} getCubeImage={getCubeImage} />
    </div>
  );
}
