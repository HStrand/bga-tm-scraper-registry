import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { X } from 'lucide-react';
import { ELYSIUM_HEXES, GRID, IMAGE_WIDTH, IMAGE_HEIGHT, hexCenter, hexPoints, type HexTile } from '@/data/elysiumHexes';
import { getCityPlacementStats, getCityPlacementByGen, type CityPlacementStat, type CityPlacementByGen } from '@/lib/cityStats';
import elysiumImage from '/assets/elysium.png';

function heatColor(t: number): string {
  if (t === 0) return 'transparent';
  const alpha = 0.15 + t * 0.55;
  const hue = 60 * (1 - t);
  return `hsla(${hue}, 90%, 50%, ${alpha})`;
}

function formatElo(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}`;
}

interface HexDetailDialogProps {
  hex: HexTile;
  overviewStat: CityPlacementStat | undefined;
  genData: CityPlacementByGen[];
  onClose: () => void;
}

function HexDetailDialog({ hex, overviewStat, genData, onClose }: HexDetailDialogProps) {
  const title = hex.name ?? `Hex ${hex.col},${hex.row}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chartData = genData.map(d => ({
    gen: d.placedGen ?? 0,
    avgEloGain: d.avgEloChange,
    count: d.gameCount,
  }));

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Coordinates: {hex.col},{hex.row}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {overviewStat ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Total cities placed</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{overviewStat.gameCount.toLocaleString()}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Avg Elo gain</div>
                  <div className={`text-2xl font-bold ${overviewStat.avgEloChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatElo(overviewStat.avgEloChange)}
                  </div>
                </div>
              </div>

              {genData.length > 0 && (
                <>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Game Count by Generation</h3>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                          <XAxis dataKey="gen" tick={{ fontSize: 12 }} label={{ value: 'Generation', position: 'insideBottom', offset: -2, fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div style={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'white', padding: '8px 12px', fontSize: 13 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Generation {label}</div>
                                  <div>Cities placed: <strong>{d.count.toLocaleString()}</strong></div>
                                  <div>Avg Elo gain: <strong style={{ color: d.avgEloGain >= 0 ? '#4ade80' : '#f87171' }}>{formatElo(d.avgEloGain)}</strong></div>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {chartData.map((_, i) => (
                              <Cell key={i} fill="#3b82f6" fillOpacity={0.8} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Avg Elo Gain by Generation</h3>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                          <XAxis dataKey="gen" tick={{ fontSize: 12 }} label={{ value: 'Generation', position: 'insideBottom', offset: -2, fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)} />
                          <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0].payload;
                              return (
                                <div style={{ backgroundColor: 'rgb(30 41 59)', border: '1px solid rgb(51 65 85)', borderRadius: '8px', color: 'white', padding: '8px 12px', fontSize: 13 }}>
                                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Generation {label}</div>
                                  <div>Avg Elo gain: <strong style={{ color: d.avgEloGain >= 0 ? '#4ade80' : '#f87171' }}>{formatElo(d.avgEloGain)}</strong></div>
                                  <div>Cities placed: <strong>{d.count.toLocaleString()}</strong></div>
                                </div>
                              );
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="avgEloGain"
                            stroke="#22c55e"
                            strokeWidth={2}
                            dot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
                            activeDot={{ r: 6, fill: '#22c55e', strokeWidth: 2, stroke: '#fff' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-slate-500 dark:text-slate-400 italic py-8 text-center">
              No city placement data for this tile.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function MapPage() {
  const [stats, setStats] = useState<CityPlacementStat[]>([]);
  const [byGenData, setByGenData] = useState<CityPlacementByGen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredHex, setHoveredHex] = useState<HexTile | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexTile | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      getCityPlacementStats('Elysium'),
      getCityPlacementByGen('Elysium'),
    ])
      .then(([overview, byGen]) => {
        setStats(overview);
        setByGenData(byGen);
      })
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

  const byGenByLocation = useMemo(() => {
    const map = new Map<string, CityPlacementByGen[]>();
    for (const s of byGenData) {
      const key = s.cityLocation.trim();
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [byGenData]);

  const { maxCount } = useMemo(() => {
    if (stats.length === 0) return { maxCount: 0 };
    let mc = 0;
    for (const s of stats) {
      if (s.gameCount > mc) mc = s.gameCount;
    }
    return { maxCount: mc };
  }, [stats]);

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleHexClick = useCallback((hex: HexTile) => {
    if (statsByLocation.has(hex.dbKey)) {
      setSelectedHex(hex);
    }
  }, [statsByLocation]);

  const hoveredStat = hoveredHex ? statsByLocation.get(hoveredHex.dbKey) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        Elysium — City Placement Map
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Heat map of city placements by popularity. Brighter = more placements. Hover for details, click for charts.
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
                onClick={() => handleHexClick(hex)}
              />
            );
          })}
        </svg>

        {hoveredHex && !selectedHex && createPortal(
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

      {selectedHex && (
        <HexDetailDialog
          hex={selectedHex}
          overviewStat={statsByLocation.get(selectedHex.dbKey)}
          genData={byGenByLocation.get(selectedHex.dbKey) ?? []}
          onClose={() => setSelectedHex(null)}
        />
      )}
    </div>
  );
}
