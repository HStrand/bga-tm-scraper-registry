import { useState } from 'react';
import { createPortal } from 'react-dom';
import { hexCenter, hexPoints, type MapDefinition } from '@/data/mapHexes';
import { getMapOverlays, type AwardOverlay, type MilestoneAwardOverlay } from '@/data/mapOverlays';
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
  claimedMilestones?: Map<string, { playerId: string; playerName: string; generation: number }>;
  fundedAwards?: Map<string, { playerId: string; playerName: string; generation: number }>;
  playerNames?: Record<string, string>;
  playerTrackers?: Record<string, Record<string, number>>;
  playerTileCounts?: Record<string, { cities: number; greeneries: number; total: number }>;
  playerHandCounts?: Record<string, number>;
}

interface TooltipData {
  title: string;
  type: 'milestone' | 'award' | 'milestones-table' | 'awards-table';
  claimedBy?: string;
  generation?: number;
  metric?: string;
  threshold?: number;
  standings?: { name: string; score: number }[];
  tableRows?: {
    name: string;
    metric: string;
    claimedBy?: string;
    claimedColor?: string;
    generation?: number;
    playerScores: { name: string; score: number; meetsThreshold?: boolean }[];
    threshold?: number;
  }[];
  playerColumns?: { name: string; color: string }[];
}

export function ReplayMap({ mapDefinition, placedTiles, playerColors, currentStep, gameState, claimedMilestones, fundedAwards, playerNames, playerTrackers, playerTileCounts, playerHandCounts }: ReplayMapProps) {
  const tileSize = mapDefinition.grid.hexRadius * 2;
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const getMilestoneStandings = (m: import('@/data/mapOverlays').MilestoneAwardOverlay): { name: string; score: number }[] => {
    const scores: { name: string; score: number }[] = [];
    const pids = Object.keys(playerTrackers ?? playerTileCounts ?? {});
    for (const pid of pids) {
      const name = playerNames?.[pid] ?? pid;
      let score = 0;
      if (m.useTR && gameState?.player_vp) {
        score = gameState.player_vp[pid]?.total_details?.tr ?? 0;
      } else if (m.useTileCounts && playerTileCounts?.[pid]) {
        score = playerTileCounts[pid][m.useTileCounts];
      } else if (m.useHandCount && playerHandCounts) {
        score = playerHandCounts[pid] ?? 0;
      } else if (m.trackerKeys && m.trackerKeys.length > 0 && playerTrackers?.[pid]) {
        const t = playerTrackers[pid];
        score = m.altKeys ? Math.max(...m.trackerKeys.map(k => t[k] ?? 0)) : m.trackerKeys.reduce((sum, k) => sum + (t[k] ?? 0), 0);
      }
      scores.push({ name, score });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores;
  };

  const getStandings = (award: AwardOverlay): { name: string; score: number }[] => {
    const scores: { name: string; score: number }[] = [];
    const pids = Object.keys(playerTrackers ?? playerTileCounts ?? {});
    for (const pid of pids) {
      const name = playerNames?.[pid] ?? pid;
      let score = 0;
      if (award.useTileCounts === 'total' && playerTileCounts?.[pid]) {
        score = playerTileCounts[pid].total;
      } else if (award.trackerKeys.length > 0 && playerTrackers?.[pid]) {
        const t = playerTrackers[pid];
        if (award.altKeys) {
          score = Math.max(...award.trackerKeys.map(k => t[k] ?? 0));
        } else {
          score = award.trackerKeys.reduce((sum, k) => sum + (t[k] ?? 0), 0);
        }
      }
      scores.push({ name, score });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores;
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

        {/* Milestones & Awards cubes + hover tooltips */}
        {(() => {
          const overlays = getMapOverlays(mapDefinition.name);
          const cubeSize = tileSize * 0.4;
          const hitSize = tileSize * 0.8;
          const elements: React.ReactNode[] = [];

          if (overlays.milestones) {
            for (const m of overlays.milestones) {
              const claim = claimedMilestones?.get(m.name.toUpperCase());
              const color = claim ? (playerColors[claim.playerId] ?? '#888') : undefined;
              const cube = color ? getCubeImage(color) : undefined;
              elements.push(
                <g key={`ms-${m.name}`} style={{ pointerEvents: 'all' }}>
                  <rect x={m.cx - hitSize / 2} y={m.cy - hitSize / 2} width={hitSize} height={hitSize} fill="transparent" cursor="pointer"
                    onMouseEnter={() => setTooltip({
                      title: m.name, type: 'milestone',
                      claimedBy: claim?.playerName, generation: claim?.generation,
                      metric: m.metric, threshold: m.threshold,
                      standings: m.metric ? getMilestoneStandings(m) : undefined,
                    })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {cube && <image href={cube} x={m.cx - cubeSize / 2} y={m.cy - cubeSize / 2} width={cubeSize} height={cubeSize} style={{ pointerEvents: 'none' }} />}
                  {color && !cube && <rect x={m.cx - cubeSize / 2} y={m.cy - cubeSize / 2} width={cubeSize} height={cubeSize} rx={2} fill={color} stroke="#fff" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
                </g>
              );
            }
          }

          if (overlays.awards) {
            for (const a of overlays.awards) {
              const fund = fundedAwards?.get(a.name.toLowerCase());
              const color = fund ? (playerColors[fund.playerId] ?? '#888') : undefined;
              const cube = color ? getCubeImage(color) : undefined;
              elements.push(
                <g key={`aw-${a.name}`} style={{ pointerEvents: 'all' }}>
                  <rect x={a.cx - hitSize / 2} y={a.cy - hitSize / 2} width={hitSize} height={hitSize} fill="transparent" cursor="pointer"
                    onMouseEnter={() => setTooltip({
                      title: a.name, type: 'award',
                      claimedBy: fund?.playerName, generation: fund?.generation,
                      metric: a.metric,
                      standings: getStandings(a),
                    })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {cube && <image href={cube} x={a.cx - cubeSize / 2} y={a.cy - cubeSize / 2} width={cubeSize} height={cubeSize} style={{ pointerEvents: 'none' }} />}
                  {color && !cube && <rect x={a.cx - cubeSize / 2} y={a.cy - cubeSize / 2} width={cubeSize} height={cubeSize} rx={2} fill={color} stroke="#fff" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
                </g>
              );
            }
          }

          return elements;
        })()}

        {/* Milestones/Awards label hit areas for table tooltip */}
        {(() => {
          const overlays = getMapOverlays(mapDefinition.name);
          const pids = Object.keys(playerNames ?? {});
          const pNames = pids.map(pid => playerNames?.[pid] ?? pid);

          const buildTableRows = (items: (MilestoneAwardOverlay | AwardOverlay)[], type: 'milestone' | 'award') => {
            return items.map(item => {
              const isMilestone = type === 'milestone';
              const claim = isMilestone
                ? claimedMilestones?.get(item.name.toUpperCase())
                : fundedAwards?.get(item.name.toLowerCase());
              const metric = 'metric' in item && item.metric ? item.metric : '';
              const standings = isMilestone ? getMilestoneStandings(item) : getStandings(item as AwardOverlay);
              const threshold = 'threshold' in item ? item.threshold : undefined;
              return {
                name: item.name,
                metric,
                claimedBy: claim?.playerName,
                claimedColor: claim ? (playerColors[claim.playerId] ?? '#888') : undefined,
                generation: claim?.generation,
                playerScores: pids.map((pid, i) => ({
                  name: pNames[i],
                  score: standings.find(s => s.name === pNames[i])?.score ?? 0,
                  meetsThreshold: threshold != null ? (standings.find(s => s.name === pNames[i])?.score ?? 0) >= threshold : undefined,
                })),
                threshold,
              };
            });
          };

          const elements: React.ReactNode[] = [];

          if (overlays.milestonesLabel && overlays.milestones) {
            const l = overlays.milestonesLabel;
            elements.push(
              <rect key="ms-label" x={l.cx - l.width / 2} y={l.cy - l.height / 2} width={l.width} height={l.height}
                fill="transparent" cursor="pointer" style={{ pointerEvents: 'all' }}
                onMouseEnter={() => setTooltip({
                  title: 'Milestones', type: 'milestones-table',
                  tableRows: buildTableRows(overlays.milestones!, 'milestone'),
                  playerColumns: pids.map((pid, i) => ({ name: pNames[i], color: playerColors[pid] ?? '#888' })),
                })}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          }

          if (overlays.awardsLabel && overlays.awards) {
            const l = overlays.awardsLabel;
            elements.push(
              <rect key="aw-label" x={l.cx - l.width / 2} y={l.cy - l.height / 2} width={l.width} height={l.height}
                fill="transparent" cursor="pointer" style={{ pointerEvents: 'all' }}
                onMouseEnter={() => setTooltip({
                  title: 'Awards', type: 'awards-table',
                  tableRows: buildTableRows(overlays.awards!, 'award'),
                  playerColumns: pids.map((pid, i) => ({ name: pNames[i], color: playerColors[pid] ?? '#888' })),
                })}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          }

          return elements;
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

      {/* Custom tooltip portal */}
      {tooltip && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: tooltipPos.x + 16, top: tooltipPos.y - 10 }}
        >
          <div className="glass-panel rounded-lg shadow-xl px-4 py-3 text-sm min-w-[200px]" style={{ position: 'relative' }}>
            <div className="font-bold text-base text-white mb-1">{tooltip.title}</div>
            {tooltip.type === 'milestone' && (
              <>
                {tooltip.metric && (
                  <div className="text-slate-400 text-xs mb-1">{tooltip.metric}</div>
                )}
                {tooltip.claimedBy ? (
                  <div className="text-green-400 text-xs mb-1">
                    Claimed by <span className="font-semibold text-white">{tooltip.claimedBy}</span> (Gen {tooltip.generation})
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs italic mb-1">Not claimed</div>
                )}
                {tooltip.standings && tooltip.standings.length > 0 && (
                  <div className="border-t border-white/10 pt-1.5 space-y-0.5">
                    {tooltip.standings.map((s) => (
                      <div key={s.name} className="flex justify-between gap-4 text-xs">
                        <span className={s.score >= (tooltip.threshold ?? Infinity) ? 'text-green-400 font-semibold' : 'text-slate-400'}>{s.name}</span>
                        <span className={s.score >= (tooltip.threshold ?? Infinity) ? 'text-green-400 font-bold' : 'text-slate-300'}>
                          {s.score}{tooltip.threshold ? `/${tooltip.threshold}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {tooltip.type === 'award' && (
              <>
                <div className="text-slate-400 text-xs mb-1.5">{tooltip.metric}</div>
                {tooltip.claimedBy ? (
                  <div className="text-amber-400 text-xs mb-1.5">
                    Funded by <span className="font-semibold text-white">{tooltip.claimedBy}</span> (Gen {tooltip.generation})
                  </div>
                ) : (
                  <div className="text-slate-500 text-xs italic mb-1.5">Not funded</div>
                )}
                {tooltip.standings && tooltip.standings.length > 0 && (
                  <div className="border-t border-white/10 pt-1.5 space-y-0.5">
                    {tooltip.standings.map((s, i) => (
                      <div key={s.name} className="flex justify-between gap-4 text-xs">
                        <span className={i === 0 ? 'text-white font-semibold' : 'text-slate-400'}>{s.name}</span>
                        <span className={i === 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}>{s.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {(tooltip.type === 'milestones-table' || tooltip.type === 'awards-table') && tooltip.tableRows && tooltip.playerColumns && (
              <table className="w-full text-xs border-collapse mt-1">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-1.5 pr-3 text-slate-400 font-medium">{tooltip.type === 'milestones-table' ? 'Milestone' : 'Award'}</th>
                    <th className="text-left py-1.5 pr-3 text-slate-400 font-medium">Criteria</th>
                    <th className="text-center py-1.5 px-2 text-slate-400 font-medium">{tooltip.type === 'milestones-table' ? 'Claimed' : 'Funded'}</th>
                    {tooltip.playerColumns.map(p => (
                      <th key={p.name} className="text-center py-1.5 px-2 text-white font-semibold">
                        <span className="inline-flex items-center gap-1">
                          {getCubeImage(p.color) ? (
                            <img src={getCubeImage(p.color)!} alt="" className="w-4 h-4" />
                          ) : (
                            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                          )}
                          {p.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tooltip.tableRows.map(row => (
                    <tr key={row.name} className="border-b border-white/5">
                      <td className="py-1.5 pr-3 font-semibold text-white whitespace-nowrap">{row.name}</td>
                      <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{row.metric}</td>
                      <td className="py-1.5 px-2 text-center">
                        {row.claimedBy ? (
                          <span className="inline-flex items-center gap-1">
                            {row.claimedColor && getCubeImage(row.claimedColor) && (
                              <img src={getCubeImage(row.claimedColor)!} alt="" className="w-4 h-4" />
                            )}
                            <span className={tooltip.type === 'milestones-table' ? 'text-green-400' : 'text-amber-400'}>
                              Gen {row.generation}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-600">&mdash;</span>
                        )}
                      </td>
                      {row.playerScores.map(ps => (
                        <td key={ps.name} className="py-1.5 px-2 text-center">
                          <span className={
                            ps.meetsThreshold ? 'text-green-400 font-bold' :
                            ps.meetsThreshold === false ? 'text-slate-400' :
                            'text-slate-300'
                          }>
                            {ps.score}{row.threshold != null ? `/${row.threshold}` : ''}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
