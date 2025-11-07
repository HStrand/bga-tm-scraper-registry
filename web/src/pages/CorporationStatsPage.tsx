import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCookieState } from '@/hooks/useCookieState';
import { useParams } from 'react-router-dom';
import type { CorporationStats, CorporationFilters } from '@/types/corporation';
import { CorporationHeader } from '@/components/CorporationHeader';
import { FiltersPanel } from '@/components/FiltersPanel';
import { EloHistogram } from '@/components/charts/EloHistogram';
import { PositionsBar } from '@/components/charts/PositionsBar';
import { GameDetailsTable } from '@/components/GameDetailsTable';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/BackButton';
import {
  getCorporationDetailOptions,
  getCorporationDetailSummary,
  getCorporationGames,
  type CorporationDetailOptions,
} from '@/lib/corporationDetails';

/**
 * Refactored to server-side filtering:
 * - Loads small options payload for the selected corporation
 * - Fetches compact summary (aggregates + histogram bins) when filters change
 * - Only fetches game rows when switching to "Table View" (and with a cap)
 */
export function CorporationStatsPage() {
  const { name } = useParams<{ name: string }>();
  const [options, setOptions] = useState<CorporationDetailOptions | null>(null);
  const [summary, setSummary] = useState<CorporationStats & {
    eloHistogramBins: { min: number; max: number; count: number; label: string }[];
    eloChangeHistogramBins: { min: number; max: number; count: number; label: string }[];
  } | null>(null);

  const [games, setGames] = useState<import('@/types/corporation').CorporationPlayerStatsRow[]>([]);
  const [gamesTotal, setGamesTotal] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [loadingGames, setLoadingGames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  // Initialize filters with all options selected (persisted per page via cookie)
  const [filters, setFilters, , meta] = useCookieState<CorporationFilters>(
    'tm_filters_corporation_details_v2', // bump cookie key because behavior changed
    {
      playerCounts: [],
      maps: [],
      gameModes: [],
      gameSpeeds: [],
      preludeOn: undefined,
      coloniesOn: undefined,
      draftOn: undefined,
    }
  );

  // Decode the corporation name from the URL parameter
  const corporationName = useMemo(() => (name ? decodeURIComponent(name) : ''), [name]);

  // Load options first (small payload)
  useEffect(() => {
    if (!corporationName) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const opts = await getCorporationDetailOptions(corporationName);
        if (cancelled) return;
        setOptions(opts);

        // Initialize defaults once if no stored filters exist
        setFilters(prev => {
          if (meta.hasStoredValue) return prev;
          const isEmpty =
            prev.playerCounts.length === 0 &&
            prev.maps.length === 0 &&
            prev.gameModes.length === 0 &&
            prev.gameSpeeds.length === 0 &&
            prev.preludeOn === undefined &&
            prev.coloniesOn === undefined &&
            prev.draftOn === undefined &&
            !prev.playerName &&
            prev.eloMin === undefined &&
            prev.eloMax === undefined &&
            prev.generationsMin === undefined &&
            prev.generationsMax === undefined;

          if (isEmpty) {
            return {
              playerCounts: (opts.playerCounts ?? []) as number[],
              maps: opts.maps ?? [],
              gameModes: opts.gameModes ?? [],
              gameSpeeds: opts.gameSpeeds ?? [],
              preludeOn: undefined,
              coloniesOn: undefined,
              draftOn: undefined,
            };
          }
          return prev;
        });
      } catch (err) {
        console.error('Error fetching corporation options:', err);
        if (!cancelled) setError('Failed to load corporation options. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [corporationName]);

  // Fetch compact summary whenever filters change
  useEffect(() => {
    if (!corporationName || !options) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const s = await getCorporationDetailSummary(corporationName, filters);
        if (!cancelled) setSummary(s);
      } catch (err) {
        console.error('Error fetching corporation summary:', err);
        if (!cancelled) setError('Failed to load corporation summary. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [corporationName, options, filters]);

  // Fetch game rows only when switching to table view
  useEffect(() => {
    if (viewMode !== 'table' || !corporationName) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingGames(true);
        setError(null);
        // Fetch a capped number of rows to avoid large payloads; the table paginates locally.
        const res = await getCorporationGames(corporationName, filters, 500, 0);
        if (!cancelled) {
          setGames(res.rows);
          setGamesTotal(res.total);
        }
      } catch (err) {
        console.error('Error fetching corporation games:', err);
        if (!cancelled) setError('Failed to load games. Please try again.');
      } finally {
        if (!cancelled) setLoadingGames(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewMode, corporationName, filters]);

  // Get available options for filters
  const availablePlayerCounts = useMemo(() => options?.playerCounts ?? [], [options]);
  const availableMaps = useMemo(() => options?.maps ?? [], [options]);
  const availableGameModes = useMemo(() => options?.gameModes ?? [], [options]);
  const availableGameSpeeds = useMemo(() => options?.gameSpeeds ?? [], [options]);
  const availablePlayerNames = useMemo(() => [] as string[], []);

  const eloRange = useMemo(() => ({
    min: options?.eloRange.min ?? 0,
    max: options?.eloRange.max ?? 0,
  }), [options]);

  const generationsRange = useMemo(() => ({
    min: options?.generationsRange.min ?? 0,
    max: options?.generationsRange.max ?? 0,
  }), [options]);

  const handleFiltersChange = useCallback((newFilters: CorporationFilters) => {
    setFilters(newFilters);
  }, [setFilters]);

  if (!name) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Corporation Not Found
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Please provide a valid corporation name in the URL.
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
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const headerStats: CorporationStats = summary ?? {
    totalGames: 0,
    winRate: 0,
    avgElo: 0,
    avgEloChange: 0,
    avgFinalScore: 0,
    avgTr: 0,
    avgCardPoints: 0,
    avgGreeneryPoints: 0,
    avgCityPoints: 0,
    avgMilestonePoints: 0,
    avgAwardPoints: 0,
    avgDuration: 0,
    avgGenerations: 0,
    positionsCount: {},
    playerCountDistribution: {},
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Back + Header */}
        <div className="flex items-center justify-between mb-3">
          <BackButton fallbackPath="/corporations" />
        </div>
        <div className="mb-8">
          <CorporationHeader corporationName={corporationName} stats={headerStats} isLoading={loading} />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              {!loading && options && (
                <FiltersPanel
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  availablePlayerCounts={availablePlayerCounts}
                  availableMaps={availableMaps}
                  availableGameModes={availableGameModes}
                  availableGameSpeeds={availableGameSpeeds}
                  availablePlayerNames={availablePlayerNames}
                  eloRange={eloRange}
                  generationsRange={generationsRange}
                />
              )}
            </div>
          </div>

          {/* Charts/Table area */}
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

                {/* Content based on view mode */}
                {viewMode === 'chart' ? (
                  <>
                    {/* Charts grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <EloHistogram data={summary?.eloHistogramBins ?? []} />
                      <PositionsBar data={headerStats.positionsCount} />
                    </div>
                    {/* Elo change distribution */}
                    <div className="w-full">
                      <EloHistogram
                        data={summary?.eloChangeHistogramBins ?? []}
                        title="Elo Change Distribution"
                        useRedGreenColors={true}
                        heightClass="h-72 md:h-80"
                      />
                    </div>
                  </>
                ) : (
                  <div className="w-full">
                    {loadingGames ? (
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                        <div className="h-6 w-48 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-4"></div>
                        <div className="space-y-3">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <GameDetailsTable data={games} />
                    )}
                    {gamesTotal > games.length && (
                      <div className="text-xs text-slate-500 mt-2">
                        Showing first {games.length.toLocaleString()} of {gamesTotal.toLocaleString()} games (refine filters to narrow results)
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
