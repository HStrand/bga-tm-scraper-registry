import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCookieState } from '@/hooks/useCookieState';
import { useParams, useLocation } from 'react-router-dom';
import { PreludePlayerStatsRow, PreludeStats, PreludeDetailFilters, CorporationPerformance, HistogramBin, PreludeOverviewRow } from '@/types/prelude';
import { PreludeHeader } from '@/components/PreludeHeader';
import { PreludeFiltersPanel } from '@/components/PreludeFiltersPanel';
import { EloHistogram } from '@/components/charts/EloHistogram';
import { DivergingBarChart } from '@/components/charts/DivergingBarChart';
import { GameDetailsTable } from '@/components/GameDetailsTable';
import { Button } from '@/components/ui/button';
import { slugToPreludeName } from '@/lib/prelude';
import { getPreludeDetailOptions, getPreludeDetailSummary, getPreludePlayerRows, type PreludeDetailOptions, type PreludeDetailSummary } from '@/lib/preludeDetails';
import { BackButton } from '@/components/BackButton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export function PreludeStatsPage() {
  const { name } = useParams<{ name: string }>();
  const location = useLocation() as { state?: { overviewRow?: PreludeOverviewRow } };
  const overviewRow = location.state?.overviewRow;
  const [options, setOptions] = useState<PreludeDetailOptions | null>(null);
  const [summary, setSummary] = useState<PreludeDetailSummary | null>(null);
  const [data, setData] = useState<PreludePlayerStatsRow[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize filters with all options selected (persisted per page via cookie)
  const [filters, setFilters, , meta] = useCookieState<PreludeDetailFilters>(
    'tm_filters_prelude_details_v1',
    {
      maps: [],
      gameModes: [],
      gameSpeeds: [],
      playerCounts: [],
      corporations: [],
      preludeOn: undefined,
      coloniesOn: undefined,
      draftOn: undefined,
    }
  );
  const debouncedFilters = useDebouncedValue(filters, 400);

  // Decode the prelude name from the URL parameter
  const preludeName = useMemo(() => (name ? decodeURIComponent(name) : ''), [name]);

  // Use overview row from navigation state (if present) to prime header instantly
  const primedStats: PreludeStats | null = useMemo(() => {
    if (!overviewRow) return null;
    return {
      totalGames: overviewRow.totalGames ?? 0,
      winRate: overviewRow.winRate ?? 0, // already fraction 0..1
      avgElo: overviewRow.avgElo ?? 0,
      avgEloChange: overviewRow.avgEloChange ?? 0,
    };
  }, [overviewRow]);

  // Load options first (small payload)
  useEffect(() => {
    if (!name) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const opts = await getPreludeDetailOptions(preludeName);
        if (cancelled) return;
        setOptions(opts);
        setFilters(prev => {
          if (meta.hasStoredValue) return prev;
          const isEmpty =
            prev.maps.length === 0 &&
            prev.gameModes.length === 0 &&
            prev.gameSpeeds.length === 0 &&
            prev.playerCounts.length === 0 &&
            prev.corporations.length === 0 &&
            prev.preludeOn === undefined &&
            prev.coloniesOn === undefined &&
            prev.draftOn === undefined &&
            !prev.playerName &&
            prev.eloMin === undefined &&
            prev.eloMax === undefined;
          if (isEmpty) {
            return {
              maps: opts.maps ?? [],
              gameModes: opts.gameModes ?? [],
              gameSpeeds: opts.gameSpeeds ?? [],
              playerCounts: (opts.playerCounts ?? []) as number[],
              corporations: opts.corporations ?? [],
              preludeOn: undefined,
              coloniesOn: undefined,
              draftOn: undefined,
            };
          }
          return prev;
        });
      } catch (err) {
        console.error('Error fetching prelude options:', err);
        if (!cancelled) setError('Failed to load prelude options. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [name, preludeName]);

  // Fetch compact summary whenever filters change
  useEffect(() => {
    if (!preludeName || !options) return;
    let cancelled = false;
    (async () => {
      try {
        setIsRefreshing(true);
        setError(null);
        const s = await getPreludeDetailSummary(preludeName, debouncedFilters);
        if (!cancelled) {
          setSummary(s);
          setIsInitialLoad(false);
        }
      } catch (err) {
        console.error('Error fetching prelude summary:', err);
        if (!cancelled) setError('Failed to load prelude summary. Please try again.');
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [preludeName, options, debouncedFilters]);

  // Fetch player rows only when switching to table view
  useEffect(() => {
    if (viewMode !== 'table' || !preludeName) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingRows(true);
        setError(null);
        const res = await getPreludePlayerRows(preludeName, debouncedFilters, 500, 0);
        if (!cancelled) {
          setData(res.rows);
          setRowsTotal(res.total);
        }
      } catch (err) {
        console.error('Error fetching prelude rows:', err);
        if (!cancelled) setError('Failed to load games. Please try again.');
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewMode, preludeName, debouncedFilters]);

  // Get available options for filters
  const availablePlayerCounts = useMemo(() => options?.playerCounts ?? [], [options]);

  const availableMaps = useMemo(() => options?.maps ?? [], [options]);

  const availableGameModes = useMemo(() => options?.gameModes ?? [], [options]);

  const availableGameSpeeds = useMemo(() => options?.gameSpeeds ?? [], [options]);

  const availableCorporations = useMemo(() => options?.corporations ?? [], [options]);

  const availablePlayerNames = useMemo(() => {
    return [] as string[];
  }, []);

  const eloRange = useMemo(() => ({
    min: options?.eloRange.min ?? 0,
    max: options?.eloRange.max ?? 0,
  }), [options]);

  // Filter data based on current filters
  const filteredData = useMemo(() => data, [data]);

  // Compute statistics
  const stats = useMemo((): PreludeStats => {
    if (summary) {
      return {
        totalGames: summary.totalGames,
        winRate: summary.winRate,
        avgElo: summary.avgElo,
        avgEloChange: summary.avgEloChange,
      };
    }
    return {
      totalGames: 0,
      winRate: 0,
      avgElo: 0,
      avgEloChange: 0,
    };
  }, [summary]);

  // Prefer primed stats from overview while loading (for instant header), fall back to computed stats
  const headerStats: PreludeStats = useMemo(() => {
    if (primedStats && isInitialLoad) return primedStats;
    return stats;
  }, [primedStats, isInitialLoad, stats]);

  // Compute histogram data for Elo
  const eloHistogramData = useMemo((): HistogramBin[] => summary?.eloHistogramBins ?? [], [summary]);

  // Compute histogram data for Elo Change
  const eloChangeHistogramData = useMemo((): HistogramBin[] => summary?.eloChangeHistogramBins ?? [], [summary]);

  // Compute corporation performance data
  const corporationPerformanceData = useMemo((): CorporationPerformance[] => {
    return summary?.corporationPerformance ?? [];
  }, [summary]);

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
          <PreludeHeader preludeName={preludeName} stats={headerStats} isLoading={!primedStats && isInitialLoad} />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              {isInitialLoad ? (
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
            {isInitialLoad ? (
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
                    <GameDetailsTable data={data} />
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
