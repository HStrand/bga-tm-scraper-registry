import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ELYSIUM_HEXES, GRID, IMAGE_WIDTH, IMAGE_HEIGHT, hexCenter, hexPoints, type HexTile } from '@/data/elysiumHexes';
import { getCityPlacementStats, type CityPlacementStat } from '@/lib/cityStats';
import elysiumImage from '/assets/elysium.png';

function heatColor(t: number): string {
  // t is 0..1 where 0 = fewest placements, 1 = most placements
  // Transparent -> Yellow -> Orange -> Red
  if (t === 0) return 'transparent';
  const alpha = 0.15 + t * 0.55;
  // Interpolate hue from 60 (yellow) to 0 (red)
  const hue = 60 * (1 - t);
  return `hsla(${hue}, 90%, 50%, ${alpha})`;
}

function formatElo(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}`;
}

export function MapPage() {
  const [stats, setStats] = useState<CityPlacementStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredHex, setHoveredHex] = useState<HexTile | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCityPlacementStats('Elysium')
      .then(setStats)
      .catch(err => {
        console.error('Error fetching city stats:', err);
        setError('Failed to load city placement data.');
      })
      .finally(() => setLoading(false));
  }, []);

  const statsByLocation = useMemo(() => {
    const map = new Map<string, CityPlacementStat>();
    for (const s of stats) {
      map.set(s.cityLocation.trim(), s);
    }
    return map;
  }, [stats]);

  const { minElo, maxElo, maxCount } = useMemo(() => {
    if (stats.length === 0) return { minElo: 0, maxElo: 0, maxCount: 0 };
    let min = Infinity, max = -Infinity, mc = 0;
    for (const s of stats) {
      if (s.avgEloChange < min) min = s.avgEloChange;
      if (s.avgEloChange > max) max = s.avgEloChange;
      if (s.gameCount > mc) mc = s.gameCount;
    }
    return { minElo: min, maxElo: max, maxCount: mc };
  }, [stats]);

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const hoveredStat = hoveredHex ? statsByLocation.get(hoveredHex.dbKey) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        Elysium — City Placement Map
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Heat map of city placements by popularity. Brighter = more placements. Hover for details.
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-8">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          Loading city placement data...
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div
        ref={containerRef}
        className="relative inline-block select-none"
        onMouseMove={handleMouseMove}
      >
        <img
          src={elysiumImage}
          alt="Elysium board"
          width={IMAGE_WIDTH}
          height={IMAGE_HEIGHT}
          className="block max-w-full h-auto"
          draggable={false}
        />
        <svg
          viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
          className="absolute top-0 left-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        >
          {ELYSIUM_HEXES.map(hex => {
            const { cx, cy } = hexCenter(hex.col, hex.row);
            const stat = statsByLocation.get(hex.dbKey);
            const points = hexPoints(cx, cy, GRID.hexRadius);

            let fill = 'transparent';
            if (stat && maxCount > 0) {
              const t = stat.gameCount / maxCount;
              fill = heatColor(t);
            }

            return (
              <polygon
                key={`${hex.col},${hex.row}`}
                points={points}
                fill={fill}
                stroke={hoveredHex === hex ? 'rgba(255,255,255,0.9)' : 'transparent'}
                strokeWidth={hoveredHex === hex ? 2 : 0}
                style={{ pointerEvents: 'all', cursor: stat ? 'pointer' : 'default' }}
                onMouseEnter={() => setHoveredHex(hex)}
                onMouseLeave={() => setHoveredHex(null)}
              />
            );
          })}
        </svg>

        {hoveredHex && createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              left: tooltipPos.x + 16,
              top: tooltipPos.y - 10,
            }}
          >
            <div className="bg-slate-900/95 text-white rounded-lg shadow-xl px-4 py-3 text-sm min-w-[180px] border border-slate-700">
              <div className="font-bold text-base mb-1">
                {hoveredHex.name ?? `Hex ${hoveredHex.col},${hoveredHex.row}`}
              </div>
              <div className="text-slate-400 text-xs mb-2">
                Coordinates: {hoveredHex.col},{hoveredHex.row}
              </div>
              {hoveredStat ? (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-300">Cities placed:</span>
                    <span className="font-semibold">{hoveredStat.gameCount}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-300">Avg Elo gain:</span>
                    <span className={`font-semibold ${hoveredStat.avgEloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatElo(hoveredStat.avgEloChange)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-slate-400 italic">No city placement data</div>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>

      {!loading && stats.length > 0 && (
        <div className="mt-4 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
          <span>Placements:</span>
          <span>Few</span>
          <div className="w-32 h-4 rounded" style={{
            background: 'linear-gradient(to right, hsla(60, 90%, 50%, 0.2), hsla(30, 90%, 50%, 0.5), hsla(0, 90%, 50%, 0.7))',
          }} />
          <span>Many ({maxCount})</span>
        </div>
      )}
    </div>
  );
}
