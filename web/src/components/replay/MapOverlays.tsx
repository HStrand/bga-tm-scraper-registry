import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getMapOverlays, type AwardOverlay, type MilestoneAwardOverlay } from '@/data/mapOverlays';
import type { GameState } from '@/types/gamelog';
import { computeStandings, type ClaimFundInfo, type StandingsContext } from '@/lib/replayUtils';
import type { PlacedTile } from './ReplayMap';

// Reuse cube/tile images from parent — passed as props to avoid duplicate glob imports
interface MapOverlaysProps {
  mapName: string;
  imageWidth: number;
  imageHeight: number;
  tileSize: number;
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
  getCubeImage: (color: string) => string | undefined;
  cityTileImage: string;
  greeneryTileImage: string;
  getSpecialTileImage: (tileType: string) => string | undefined;
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

export function MapOverlaysSvg(props: MapOverlaysProps) {
  const {
    mapName, tileSize, placedTiles, playerColors, currentStep, gameState,
    claimedMilestones, fundedAwards, playerNames, playerTrackers, playerTileCounts, playerHandCounts,
    getCubeImage, cityTileImage, greeneryTileImage, getSpecialTileImage,
  } = props;

  const overlays = getMapOverlays(mapName);

  const standingsCtx: StandingsContext = {
    playerNames: playerNames ?? {},
    playerTrackers,
    playerTileCounts,
    playerHandCounts,
    gameState,
    placedTiles,
  };

  return (
    <>
      {/* Off-map tiles */}
      {overlays.offMapTiles?.map(({ name, tileType, cx, cy }) => {
        const tile = placedTiles.get(name);
        if (!tile || tile.moveIndex > currentStep) return null;
        const color = playerColors[tile.playerId] ?? '#888';
        const size = tileSize;
        const cubeSize = tileSize * 0.4;
        const tileImages: Record<string, string> = { city: cityTileImage, greenery: greeneryTileImage };
        const img = tileImages[tileType] ?? getSpecialTileImage(tile.tileType);
        return (
          <g key={`offmap-${name}`}>
            {img && <image href={img} x={cx - size / 2} y={cy - size / 2} width={size} height={size} />}
            {getCubeImage(color) ? (
              <image href={getCubeImage(color)!} x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} />
            ) : (
              <rect x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} rx={2} fill={color} stroke="#fff" strokeWidth={1} />
            )}
          </g>
        );
      })}

      {/* Number trackers (gen, oceans) */}
      {gameState && overlays.trackers?.map(({ key, cx, cy }) => {
        const values: Record<string, number | null> = {
          oceans: gameState.oceans, generation: gameState.generation,
          temperature: gameState.temperature, oxygen: gameState.oxygen,
        };
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
      })}

      {/* Cube trackers (oxygen, temperature) */}
      {gameState && overlays.cubeTrackers?.map(({ key, positions, minValue, step }) => {
        const values: Record<string, number | null> = { oxygen: gameState.oxygen, temperature: gameState.temperature };
        const val = values[key];
        if (val == null) return null;
        const idx = Math.max(0, Math.min(positions.length - 1, Math.round((val - minValue) / step)));
        const { cx, cy } = positions[idx];
        const cubeSize = tileSize * 0.45;
        return (
          <image key={`cube-tracker-${key}`} href={getCubeImage('#ffffff') ?? ''} x={cx - cubeSize / 2} y={cy - cubeSize / 2} width={cubeSize} height={cubeSize} style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.5))' }} />
        );
      })}
    </>
  );
}

export function MapMilestonesAwardsSvg(props: MapOverlaysProps & { setTooltip: (t: TooltipData | null) => void }) {
  const {
    mapName, tileSize, playerColors, placedTiles,
    claimedMilestones, fundedAwards, playerNames, playerTrackers, playerTileCounts, playerHandCounts, gameState,
    getCubeImage, setTooltip,
  } = props;

  const overlays = getMapOverlays(mapName);
  const cubeSize = tileSize * 0.4;
  const hitSize = tileSize * 0.8;

  const standingsCtx: StandingsContext = {
    playerNames: playerNames ?? {},
    playerTrackers,
    playerTileCounts,
    playerHandCounts,
    gameState,
    placedTiles,
  };

  const elements: React.ReactNode[] = [];

  // Milestone cubes
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
              standings: m.metric ? computeStandings(m, standingsCtx) : undefined,
            })}
            onMouseLeave={() => setTooltip(null)}
          />
          {cube && <image href={cube} x={m.cx - cubeSize / 2} y={m.cy - cubeSize / 2} width={cubeSize} height={cubeSize} style={{ pointerEvents: 'none' }} />}
          {color && !cube && <rect x={m.cx - cubeSize / 2} y={m.cy - cubeSize / 2} width={cubeSize} height={cubeSize} rx={2} fill={color} stroke="#fff" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
        </g>
      );
    }
  }

  // Award cubes
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
              standings: computeStandings(a, standingsCtx),
            })}
            onMouseLeave={() => setTooltip(null)}
          />
          {cube && <image href={cube} x={a.cx - cubeSize / 2} y={a.cy - cubeSize / 2} width={cubeSize} height={cubeSize} style={{ pointerEvents: 'none' }} />}
          {color && !cube && <rect x={a.cx - cubeSize / 2} y={a.cy - cubeSize / 2} width={cubeSize} height={cubeSize} rx={2} fill={color} stroke="#fff" strokeWidth={1} style={{ pointerEvents: 'none' }} />}
        </g>
      );
    }
  }

  // Label hit areas for table tooltips
  const pids = Object.keys(playerNames ?? {});
  const pNames = pids.map(pid => playerNames?.[pid] ?? pid);

  const buildTableRows = (items: (MilestoneAwardOverlay | AwardOverlay)[], type: 'milestone' | 'award') => {
    return items.map(item => {
      const isMilestone = type === 'milestone';
      const claim = isMilestone
        ? claimedMilestones?.get(item.name.toUpperCase())
        : fundedAwards?.get(item.name.toLowerCase());
      const metric = 'metric' in item && item.metric ? item.metric : '';
      const standings = computeStandings(item, standingsCtx);
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

  return <>{elements}</>;
}

export function MapTooltip({ tooltip, tooltipPos, getCubeImage }: { tooltip: TooltipData | null; tooltipPos: { x: number; y: number }; getCubeImage: (color: string) => string | undefined }) {
  if (!tooltip) return null;
  return createPortal(
    <div className="fixed z-[9999] pointer-events-none" style={{ left: tooltipPos.x + 16, top: tooltipPos.y - 10 }}>
      <div className="glass-panel rounded-lg shadow-xl px-4 py-3 text-sm min-w-[200px]" style={{ position: 'relative' }}>
        <div className="font-bold text-base text-white mb-1">{tooltip.title}</div>
        {tooltip.type === 'milestone' && (
          <>
            {tooltip.metric && <div className="text-slate-400 text-xs mb-1">{tooltip.metric}</div>}
            {tooltip.claimedBy ? (
              <div className="text-green-400 text-xs mb-1">
                Claimed by <span className="font-semibold text-white">{tooltip.claimedBy}</span> (Gen {tooltip.generation})
              </div>
            ) : (
              <div className="text-slate-500 text-xs italic mb-1">Not claimed</div>
            )}
            {tooltip.standings && tooltip.standings.length > 0 && (
              <div className="border-t border-white/10 pt-1.5 space-y-0.5">
                {tooltip.standings.map(s => (
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
  );
}

export type { TooltipData };
