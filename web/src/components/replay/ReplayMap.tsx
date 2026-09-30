import { useState } from 'react';
import { hexCenter, hexPoints, type MapDefinition } from '@/data/mapHexes';
import type { GameInfoVM, GameSnapshotVM } from '@/lib/replay/viewModel';
import { MapOverlaysSvg, MapMilestonesAwardsSvg, MapTooltip, type GoalOffer, type TooltipData } from './MapOverlays';
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

interface ReplayMapProps {
  mapDefinition: MapDefinition;
  info: Pick<GameInfoVM, 'players'>;
  snapshot: GameSnapshotVM;
  /** Makes the listed hexes clickable, for choosing where to place a tile. */
  selection?: { hexKeys: ReadonlySet<string>; onSelect: (hexKey: string) => void };
  /** Milestones and awards the player to move may claim or fund by clicking them. */
  offers?: GoalOffer[];
}

export function ReplayMap({ mapDefinition, info, snapshot, selection, offers }: ReplayMapProps) {
  const tileSize = mapDefinition.grid.hexRadius * 2;
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const players = info.players;
  const playerColors: Record<string, string> = Object.fromEntries(players.map(p => [p.id, p.color]));
  const playerNames: Record<string, string> = Object.fromEntries(players.map(p => [p.id, p.name]));
  const tilesByHex = new Map(snapshot.tiles.map(t => [t.hexKey, t]));

  const overlayProps = {
    mapName: mapDefinition.name,
    imageWidth: mapDefinition.imageWidth,
    imageHeight: mapDefinition.imageHeight,
    tileSize,
    players,
    snapshot,
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
          const tile = tilesByHex.get(hex.dbKey);

          if (!tile) {
            return (
              <polygon key={`${hex.col},${hex.row}`} points={points} fill="transparent" stroke="transparent" />
            );
          }

          const tileNorm = tile.type.toLowerCase();
          const isOcean = tileNorm === 'ocean';
          const isCity = tileNorm === 'city';
          const isGreenery = tileNorm === 'greenery' || tileNorm === 'forest';
          const isLandClaim = tileNorm === 'land_claim' || tileNorm === 'land claim';

          const tileImg = isCity ? cityTileImage
            : isGreenery ? greeneryTileImage
            : isOcean ? oceanTileImage
            : getSpecialTileImage(tile.type) ?? null;

          const color = (tile.placedBy != null ? playerColors[tile.placedBy] : undefined) ?? '#888';
          const cubeSize = tileSize * 0.4;
          const imgSize = isOcean ? tileSize * 1.28 : tileSize;

          return (
            <g key={`${hex.col},${hex.row}`}>
              {tileImg ? (
                <image href={tileImg} x={cx - imgSize / 2} y={cy - imgSize / 2} width={imgSize} height={imgSize} />
              ) : !isLandClaim ? (
                <polygon points={points} fill={isOcean ? 'rgba(59, 130, 246, 0.7)' : color} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
              ) : null}
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
        <MapMilestonesAwardsSvg {...overlayProps} setTooltip={setTooltip} offers={offers} />

        {/* Highlight for current move */}
        {mapDefinition.hexes.map(hex => {
          const tile = tilesByHex.get(hex.dbKey);
          if (!tile || tile.placedAt !== snapshot.index) return null;
          const { cx, cy } = hexCenter(mapDefinition.grid, hex.col, hex.row);
          const points = hexPoints(cx, cy, mapDefinition.grid.hexRadius);
          const color = (tile.placedBy != null ? playerColors[tile.placedBy] : undefined) ?? '#d97706';
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
          const tile = tilesByHex.get(hex.dbKey);
          if (!tile) return null;
          const { cx, cy } = hexCenter(mapDefinition.grid, hex.col, hex.row);
          const points = hexPoints(cx, cy, mapDefinition.grid.hexRadius);
          const tileNorm = tile.type.toLowerCase();
          const tileLabel = tileNorm === 'city' ? 'City'
            : (tileNorm === 'greenery' || tileNorm === 'forest') ? 'Greenery'
            : tileNorm === 'ocean' ? 'Ocean'
            : tile.type;
          const pName = tile.placedBy != null ? playerNames[tile.placedBy] ?? tile.placedBy : undefined;
          const pColor = (tile.placedBy != null ? playerColors[tile.placedBy] : undefined) ?? '#888';
          const gen = tile.generation;
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

        {/* Hexes offered for a tile placement */}
        {selection && mapDefinition.hexes.filter(hex => selection.hexKeys.has(hex.dbKey)).map(hex => {
          const { cx, cy } = hexCenter(mapDefinition.grid, hex.col, hex.row);
          return (
            <polygon
              key={`select-${hex.col},${hex.row}`}
              points={hexPoints(cx, cy, mapDefinition.grid.hexRadius * 0.92)}
              className="hex-offer"
              strokeWidth={3}
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              role="button"
              aria-label={`Place on ${hex.name ?? hex.dbKey}`}
              onClick={() => selection.onSelect(hex.dbKey)}
            />
          );
        })}
      </svg>

      <MapTooltip tooltip={tooltip} tooltipPos={tooltipPos} getCubeImage={getCubeImage} />
    </div>
  );
}
