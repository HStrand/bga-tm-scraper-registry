import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { PreludePlayerStatsRow, PreludeStats, PreludeDetailFilters, CorporationPerformance, HistogramBin } from '@/types/prelude';
import { PreludeHeader } from '@/components/PreludeHeader';
import { PreludeFiltersPanel } from '@/components/PreludeFiltersPanel';
import { EloHistogram } from '@/components/charts/EloHistogram';
import { DivergingBarChart } from '@/components/charts/DivergingBarChart';
import { GameDetailsTable } from '@/components/GameDetailsTable';
import { Button } from '@/components/ui/button';
import { slugToPreludeName } from '@/lib/prelude';
import { getPreludePlayerStats } from '@/lib/preludeCache';
import { BackButton } from '@/components/BackButton';

export function PreludeStatsPage() {
  const { name } = useParams<{ name: string }>();
  const [data, setData] = useState<PreludePlayerStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  // Initialize filters with all options selected
  const [filters, setFilters] = useState<PreludeDetailFilters>({
    maps: [],
    gameModes: [],
    gameSpeeds: [],
    playerCounts: [],
    corporations: [],
    preludeOn: undefined,
    coloniesOn: undefined,
    draftOn: undefined,
  });

  // Decode the prelude name from the URL parameter
  const preludeName = useMemo(() => (name ? decodeURIComponent(name) : ''), [name]);

  // Fetch data
  useEffect(() => {
    if (!name) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getPreludePlayerStats(preludeName);
        setData(response);

        // Initialize filters with all available options
        const maps = [...new Set(response.map(row => row.map).filter(Boolean))].sort() as string[];
        const gameModes = [...new Set(response.map(row => row.gameMode).filter(Boolean))].sort() as string[];
        const gameSpeeds = [...new Set(response.map(row => row.gameSpeed).filter(Boolean))].sort() as string[];
        const corporations = [...new Set(response.map(row => row.corporation).filter(Boolean))].sort() as string[];
        const playerCounts = [...new Set(response.map(row => row.playerCount).filter((c): c is number => !!c))].sort((a, b) => a - b) as number[];

        setFilters({
          maps,
          gameModes,
          gameSpeeds,
          playerCounts,
          corporations,
          preludeOn: undefined,
          coloniesOn: undefined,
          draftOn: undefined,
        });
      } catch (err) {
        console.error('Error fetching prelude stats:', err);
        setError('Failed to load prelude statistics. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [name, preludeName]);

  // Get available options for filters
  const availablePlayerCounts = useMemo(() => {
    return [...new Set(data.map(row => row.playerCount).filter((c): c is number => !!c))].sort((a, b) => a - b);
  }, [data]);

  const availableMaps = useMemo(() => {
    return [...new Set(data.map(row => row.map).filter(Boolean))].sort() as string[];
  }, [data]);

  const availableGameModes = useMemo(() => {
    return [...new Set(data.map(row => row.gameMode).filter(Boolean))].sort() as string[];
  }, [data]);

  const availableGameSpeeds = useMemo(() => {
    return [...new Set(data.map(row => row.gameSpeed).filter(Boolean))].sort() as string[];
  }, [data]);

  const availableCorporations = useMemo(() => {
    return [...new Set(data.map(row => row.corporation).filter(Boolean))].sort() as string[];
  }, [data]);

  const availablePlayerNames = useMemo(() => {
    return [...new Set(data.map(row => row.playerName).filter(Boolean))].sort() as string[];
  }, [data]);

  const eloRange = useMemo(() => {
    const elos = data.map(row => row.elo).filter(Boolean) as number[];
    return {
      min: Math.min(...elos) || 0,
      max: Math.max(...elos) || 2000,
    };
  }, [data]);

  // Filter data based on current filters
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // Elo range filter
      if (filters.eloMin && (!row.elo || row.elo < filters.eloMin)) return false;
      if (filters.eloMax && (!row.elo || row.elo > filters.eloMax)) return false;

      // Player name filter
      if (filters.playerName && row.playerName !== filters.playerName) return false;

      // Map filter
      if (row.map && !filters.maps.includes(row.map)) return false;

      // Game mode filter
      if (row.gameMode && !filters.gameModes.includes(row.gameMode)) return false;

      // Game speed filter
      if (row.gameSpeed && !filters.gameSpeeds.includes(row.gameSpeed)) return false;

      // Player count filter
      if (row.playerCount && !filters.playerCounts.includes(row.playerCount)) return false;

      // Corporation filter
      if (row.corporation && !filters.corporations.includes(row.corporation)) return false;

      // Expansion filters
      if (filters.preludeOn !== undefined && row.preludeOn !== filters.preludeOn) return false;
      if (filters.coloniesOn !== undefined && row.coloniesOn !== filters.coloniesOn) return false;
      if (filters.draftOn !== undefined && row.draftOn !== filters.draftOn) return false;

      return true;
    });
  }, [data, filters]);

  // Compute statistics
  const stats = useMemo((): PreludeStats => {
    const validData = filteredData.filter(row => row.position != null);
    const totalGames = validData.length;

    if (totalGames === 0) {
      return {
        totalGames: 0,
        winRate: 0,
        avgElo: 0,
        avgEloChange: 0,
      };
    }

    const wins = validData.filter(row => row.position === 1).length;
    const winRate = wins / totalGames;

    const avgElo = validData.reduce((sum, row) => sum + (row.elo || 0), 0) / totalGames;
    const avgEloChange = validData.reduce((sum, row) => sum + (row.eloChange || 0), 0) / totalGames;

    return {
      totalGames,
      winRate,
      avgElo,
      avgEloChange,
    };
  }, [filteredData]);

  // Compute histogram data for Elo
  const eloHistogramData = useMemo((): HistogramBin[] => {
    const elos = filteredData.map(row => row.elo).filter(Boolean) as number[];
    if (elos.length === 0) return [];

    const min = Math.min(...elos);
    const max = Math.max(...elos);
    const binCount = Math.min(12, Math.max(5, Math.ceil(elos.length / 20)));
    const binSize = (max - min) / binCount;

    const bins: HistogramBin[] = [];
    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binSize;
      const binMax = i === binCount - 1 ? max : min + (i + 1) * binSize;
      const count = elos.filter(elo => elo >= binMin && elo < binMax).length;
      
      bins.push({
        min: binMin,
        max: binMax,
        count,
        label: `${Math.round(binMin)}-${Math.round(binMax)}`,
      });
    }

    return bins;
  }, [filteredData]);

  // Compute histogram data for Elo Change
  const eloChangeHistogramData = useMemo((): HistogramBin[] => {
    const eloChanges = filteredData.map(row => row.eloChange).filter(Boolean) as number[];
    if (eloChanges.length === 0) return [];

    const min = -20;
    const max = 20;
    const binCount = 20;
    const binSize = (max - min) / binCount;

    const bins: HistogramBin[] = [];
    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binSize;
      const binMax = min + (i + 1) * binSize;
      const count = eloChanges.filter(change => change >= min && change <= max && change >= binMin && change < binMax).length;
      
      bins.push({
        min: binMin,
        max: binMax,
        count,
        label: `${Math.round(binMin)}-${Math.round(binMax)}`,
      });
    }

    return bins;
  }, [filteredData]);

  // Compute corporation performance data
  const corporationPerformanceData = useMemo((): CorporationPerformance[] => {
    const corporationMap = new Map<string, { wins: number; totalGames: number; eloChangeSum: number }>();

    filteredData.forEach(row => {
      if (!row.corporation || row.position == null) return;
      
      const existing = corporationMap.get(row.corporation) || { wins: 0, totalGames: 0, eloChangeSum: 0 };
      existing.totalGames++;
      if (row.position === 1) existing.wins++;
      existing.eloChangeSum += row.eloChange || 0;
      
      corporationMap.set(row.corporation, existing);
    });

    const result: CorporationPerformance[] = [];
    corporationMap.forEach((value, corporation) => {
      // Only include corporations with at least 3 games for statistical relevance
      if (value.totalGames >= 3) {
        result.push({
          corporation,
          gamesPlayed: value.totalGames,
          wins: value.wins,
          winRate: value.wins / value.totalGames,
          avgEloChange: value.eloChangeSum / value.totalGames,
        });
      }
    });

    return result.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
  }, [filteredData]);

  // Prepare data for diverging bar charts
  const shortCorpName = (name: string): string => {
    if (!name) return name;
    const n = name.trim();
    if (n === 'United Nations Mars Initiative') return 'UNMI';
    if (n === 'Interplanetary Cinematics') return 'Int. Cinem.';
    return n;
  };

  const winRateChartData = useMemo(() => {
    const globalWinRate = stats.winRate;
    return corporationPerformanceData.map(corp => ({
      label: shortCorpName(corp.corporation),
      value: corp.winRate - globalWinRate,
      count: corp.gamesPlayed,
      baseline: globalWinRate,
    }));
  }, [corporationPerformanceData, stats.winRate]);

  const eloGainChartData = useMemo(() => {
    return corporationPerformanceData.map(corp => ({
      label: shortCorpName(corp.corporation),
      value: corp.avgEloChange,
      count: corp.gamesPlayed,
    }));
  }, [corporationPerformanceData]);

  const handleFiltersChange = useCallback((newFilters: PreludeDetailFilters) => {
    setFilters(newFilters);
  }, []);

  if (!name) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Prelude Not Found
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Please provide a valid prelude name in the URL.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">
            Error Loading Data
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Back + Header */}
        <div className="flex items-center justify-between mb-3">
          <BackButton fallbackPath="/preludes" />
        </div>
        <div className="mb-8">
          <PreludeHeader preludeName={preludeName} stats={stats} isLoading={loading} />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              {loading ? (
                <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 shadow-sm">
                  <div className="animate-pulse space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="h-5 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="h-6 w-16 bg-slate-300 dark:bg-slate-600 rounded" />
                    </div>

                    <div className="space-y-3">
                      <div className="h-4 w-24 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded" />
                        <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="h-4 w-24 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 7 }).map((_, i) => (
                          <div key={i} className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="h-4 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded" />
                    </div>
                  </div>
                </div>
              ) : (
                <PreludeFiltersPanel
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  availablePlayerCounts={availablePlayerCounts}
                  availableMaps={availableMaps}
                  availableGameModes={availableGameModes}
                  availableGameSpeeds={availableGameSpeeds}
                  availablePlayerNames={availablePlayerNames}
                  availableCorporations={availableCorporations}
                  eloRange={eloRange}
                />
              )}
            </div>
          </div>

          {/* Charts area */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                    <div className="h-6 w-32 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-4"></div>
                    <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* View toggle */}
                <div className="flex items-center justify-center gap-2 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg w-fit mx-auto">
                  <Button
                    variant={viewMode === 'chart' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('chart')}
                    className="px-4 py-2"
                  >
                    Chart View
                  </Button>
                  <Button
                    variant={viewMode === 'table' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('table')}
                    className="px-4 py-2"
                  >
                    Table View
                  </Button>
                </div>
                
                {/* Conditional content based on view mode */}
                <div className="w-full">
                  {viewMode === 'chart' ? (
                    <div className="space-y-6">
                      {/* Top row - 2x2 grid */}
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <EloHistogram data={eloHistogramData} />
                        <EloHistogram data={eloChangeHistogramData} title="Elo Change Distribution" useRedGreenColors={true} />
                      </div>
                      {/* Full-width diverging chart */}
                      <div className="w-full">
                        <DivergingBarChart
                          data={winRateChartData}
                          title="Win Rate by Corporation"
                          valueLabel="Win Rate Difference from Global"
                          formatValue={(value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`}
                          sortBy="value"
                          useRedGreenColors={true}
                          minCount={30}
                          weightByCount={false}
                          height={500}
                        />
                      </div>
                    </div>
                  ) : (
                    <GameDetailsTable data={filteredData} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
