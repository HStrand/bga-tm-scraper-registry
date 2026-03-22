import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { X } from 'lucide-react';
import { ALL_MAPS, hexCenter, hexPoints, type MapDefinition, type HexTile } from '@/data/mapHexes';
import { getAllTilePlacementStats, getAllTilePlacementByGen, type TilePlacementStat, type TilePlacementByGen, type TileType } from '@/lib/cityStats';
import cityTileImage from '/assets/city tile.png';
import greeneryTileImage from '/assets/greenery tile.png';

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

const TILE_LABELS: Record<TileType, { singular: string; plural: string }> = {
  city: { singular: 'city', plural: 'Cities' },
  greenery: { singular: 'greenery', plural: 'Greeneries' },
};

interface HexDetailDialogProps {
  hex: HexTile;
  tileType: TileType;
  overviewStat: TilePlacementStat | undefined;
  genData: TilePlacementByGen[];
  onClose: () => void;
}

function HexDetailDialog({ hex, tileType, overviewStat, genData, onClose }: HexDetailDialogProps) {
  const title = hex.name ?? `Hex ${hex.col},${hex.row}`;
  const labels = TILE_LABELS[tileType];
  const [maxGen, setMaxGen] = useState(12);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allChartData = genData.map(d => ({
    gen: d.placedGen ?? 0,
    avgEloGain: d.avgEloChange,
    avgPoints: d.avgPoints,
    count: d.gameCount,
  }));

  const maxAvailableGen = allChartData.length > 0 ? Math.max(...allChartData.map(d => d.gen)) : 12;
  const chartData = allChartData.filter(d => d.gen <= maxGen);

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
              <div className={`grid gap-4 ${tileType === 'city' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Total {labels.plural.toLowerCase()} placed</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{overviewStat.gameCount.toLocaleString()}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Avg Elo gain</div>
                  <div className={`text-2xl font-bold ${overviewStat.avgEloChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatElo(overviewStat.avgEloChange)}
                  </div>
                </div>
                {tileType === 'city' && (
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4">
                    <div className="text-sm text-slate-500 dark:text-slate-400">Avg Points</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{overviewStat.avgPoints.toFixed(1)}</div>
                  </div>
                )}
              </div>

              {genData.length > 0 && (
                <>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-slate-600 dark:text-slate-400">Max generation:</label>
                    <input
                      type="range"
                      min={1}
                      max={maxAvailableGen}
                      value={maxGen}
                      onChange={e => setMaxGen(Number(e.target.value))}
                      className="w-40 accent-blue-500"
                    />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-6 text-center">{maxGen}</span>
                  </div>

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
                                  <div>{labels.plural} placed: <strong>{d.count.toLocaleString()}</strong></div>
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
                                  <div>{labels.plural} placed: <strong>{d.count.toLocaleString()}</strong></div>
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

                  {tileType === 'city' && (
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Avg Points by Generation</h3>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                                    <div>Avg Points: <strong style={{ color: '#f59e0b' }}>{d.avgPoints.toFixed(1)}</strong></div>
                                    <div>{labels.plural} placed: <strong>{d.count.toLocaleString()}</strong></div>
                                  </div>
                                );
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="avgPoints"
                              stroke="#f59e0b"
                              strokeWidth={2}
                              dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                              activeDot={{ r: 6, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="text-slate-500 dark:text-slate-400 italic py-8 text-center">
              No {labels.singular} placement data for this tile.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function MapPage() {
  const [currentMap, setCurrentMap] = useState<MapDefinition>(ALL_MAPS[0]);
  const [tileType, setTileType] = useState<TileType>('city');
  const [allOverviews, setAllOverviews] = useState<Record<string, TilePlacementStat[]>>({});
  const [allByGen, setAllByGen] = useState<Record<string, TilePlacementByGen[]>>({});
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredHex, setHoveredHex] = useState<HexTile | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexTile | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRefreshing(true);
    setError(null);
    setSelectedHex(null);
    Promise.all([
      getAllTilePlacementStats(tileType),
      getAllTilePlacementByGen(tileType),
    ])
      .then(([overviews, byGen]) => {
        setAllOverviews(overviews);
        setAllByGen(byGen);
      })
      .catch(err => {
        console.error('Error fetching tile stats:', err);
        setError('Failed to load placement data.');
      })
      .finally(() => { setRefreshing(false); setInitialLoad(false); });
  }, [tileType]);

  const stats = useMemo(() => allOverviews[currentMap.dbName] ?? [], [allOverviews, currentMap]);
  const byGenData = useMemo(() => allByGen[currentMap.dbName] ?? [], [allByGen, currentMap]);

  const labels = TILE_LABELS[tileType];

  const statsByLocation = useMemo(() => {
    const map = new Map<string, TilePlacementStat>();
    for (const s of stats) {
      map.set(s.tileLocation.trim(), s);
    }
    return map;
  }, [stats]);

  const byGenByLocation = useMemo(() => {
    const map = new Map<string, TilePlacementByGen[]>();
    for (const s of byGenData) {
      const key = s.tileLocation.trim();
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
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">
        Tile Placement Map
      </h1>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        {/* Map selector */}
        <div className="flex items-center gap-2">
          {ALL_MAPS.map(m => (
            <button
              key={m.dbName}
              onClick={() => { setCurrentMap(m); setSelectedHex(null); }}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                currentMap === m
                  ? 'border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-slate-300 dark:bg-slate-600" />

        {/* Tile type selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTileType('city')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              tileType === 'city'
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 ring-1 ring-amber-300'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <img src={cityTileImage} alt="City" className="w-12 h-12" />
            Cities
          </button>
          <button
            onClick={() => setTileType('greenery')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              tileType === 'greenery'
                ? 'border-green-400 bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-100 ring-1 ring-green-300'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            <img src={greeneryTileImage} alt="Greenery" className="w-12 h-12" />
            Greeneries
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Heat map of {labels.singular} placements by popularity. Brighter = more placements. Hover for details, click for charts.
      </p>

      {initialLoad && (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 py-8">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          Loading {labels.singular} placement data...
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div
        ref={containerRef}
        className={`relative inline-block select-none transition-opacity ${refreshing && !initialLoad ? 'opacity-60' : ''}`}
        onMouseMove={handleMouseMove}
      >
        <img
          src={currentMap.image}
          alt={`${currentMap.name} board`}
          width={currentMap.imageWidth}
          height={currentMap.imageHeight}
          className="block max-w-full h-auto"
          draggable={false}
        />
        <svg
          viewBox={`0 0 ${currentMap.imageWidth} ${currentMap.imageHeight}`}
          className="absolute top-0 left-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        >
          {currentMap.hexes.map(hex => {
            const { cx, cy } = hexCenter(currentMap.grid, hex.col, hex.row);
            const stat = statsByLocation.get(hex.dbKey);
            const points = hexPoints(cx, cy, currentMap.grid.hexRadius);

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
                    <span className="text-slate-300">{labels.plural} placed:</span>
                    <span className="font-semibold">{hoveredStat.gameCount}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-300">Avg Elo gain:</span>
                    <span className={`font-semibold ${hoveredStat.avgEloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatElo(hoveredStat.avgEloChange)}
                    </span>
                  </div>
                  {tileType === 'city' && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-300">Avg Points:</span>
                      <span className="font-semibold text-amber-400">{hoveredStat.avgPoints.toFixed(1)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-400 italic">No {labels.singular} placement data</div>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>

      {!initialLoad && stats.length > 0 && (
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
          tileType={tileType}
          overviewStat={statsByLocation.get(selectedHex.dbKey)}
          genData={byGenByLocation.get(selectedHex.dbKey) ?? []}
          onClose={() => setSelectedHex(null)}
        />
      )}
    </div>
  );
}
