import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCookieState } from '@/hooks/useCookieState';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  ProjectCardPlayerStatsRow,
  ProjectCardStats,
  ProjectCardFilters,
  GenerationData,
  HistogramBin,
  GenerationDistributionData,
  CardSummary,
  CardGamesPage,
  CardFilterOptions,
} from '@/types/projectcard';
import { ProjectCardHeader } from '@/components/ProjectCardHeader';
import { FiltersPanel } from '@/components/FiltersPanel';
import { EloHistogram } from '@/components/charts/EloHistogram';
import { WinRateByGeneration } from '@/components/charts/WinRateByGeneration';
import { EloGainByGeneration } from '@/components/charts/EloGainByGeneration';
import { GenerationDistribution } from '@/components/charts/GenerationDistribution';
import { ProjectCardTable } from '@/components/ProjectCardTable';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/BackButton';

const EMPTY_STATS: ProjectCardStats = {
  totalGames: 0,
  winRate: 0,
  avgElo: 0,
  avgEloChange: 0,
  avgVpScored: 0,
};

function buildFilterQuery(filters: ProjectCardFilters): string {
  const params = new URLSearchParams();
  const pushCsv = (key: string, arr?: (string | number)[]) => {
    if (arr && arr.length > 0) params.set(key, arr.join(','));
  };
  pushCsv('maps', filters.maps);
  pushCsv('modes', filters.gameModes);
  pushCsv('speeds', filters.gameSpeeds);
  pushCsv('playerCounts', filters.playerCounts);
  if (filters.preludeOn !== undefined) params.set('preludeOn', String(filters.preludeOn));
  if (filters.coloniesOn !== undefined) params.set('coloniesOn', String(filters.coloniesOn));
  if (filters.draftOn !== undefined) params.set('draftOn', String(filters.draftOn));
  if (filters.eloMin !== undefined) params.set('eloMin', String(filters.eloMin));
  if (filters.eloMax !== undefined) params.set('eloMax', String(filters.eloMax));
  if (filters.playedGenMin !== undefined) params.set('playedGenMin', String(filters.playedGenMin));
  if (filters.playedGenMax !== undefined) params.set('playedGenMax', String(filters.playedGenMax));
  if (filters.playerName) params.set('playerName', filters.playerName);
  return params.toString();
}

export function ProjectCardStatsPage() {
  const { name } = useParams<{ name: string }>();
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<ProjectCardStats>(EMPTY_STATS);
  const [generationData, setGenerationData] = useState<GenerationData[]>([]);
  const [generationDistribution, setGenerationDistribution] = useState<GenerationDistributionData[]>([]);
  const [eloHistogram, setEloHistogram] = useState<HistogramBin[]>([]);
  const [eloChangeHistogram, setEloChangeHistogram] = useState<HistogramBin[]>([]);
  const [filterOptions, setFilterOptions] = useState<CardFilterOptions | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [games, setGames] = useState<ProjectCardPlayerStatsRow[]>([]);
  const [gamesTotal, setGamesTotal] = useState(0);
  const [gamesPage, setGamesPage] = useState(1);
  const [gamesPageSize, setGamesPageSize] = useState(50);
  const [gamesLoading, setGamesLoading] = useState(false);

  const [filters, setFilters, , meta] = useCookieState<ProjectCardFilters>(
    'tm_filters_project_card_details_v1',
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

  const cardName = useMemo(() => (name ? decodeURIComponent(name) : ''), [name]);

  // Initialize default filters from the first summary response (once).
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  // Fetch summary (stats + charts + filter options) whenever filters change
  useEffect(() => {
    if (!cardName) return;
    let cancelled = false;
    const run = async () => {
      try {
        setSummaryLoading(true);
        setError(null);
        const qs = buildFilterQuery(filters);
        const url = `/api/cards/${encodeURIComponent(cardName)}/summary${qs ? `?${qs}` : ''}`;
        const res = await api.get<CardSummary>(url);
        if (cancelled) return;
        const s = res.data;
        setStats(s.stats);
        setGenerationData(s.generationData);
        setGenerationDistribution(s.generationDistribution);
        setEloHistogram(s.eloHistogram);
        setEloChangeHistogram(s.eloChangeHistogram);
        setFilterOptions(s.filterOptions);

        if (!defaultsApplied) {
          setDefaultsApplied(true);
          setFilters(prev => {
            if (meta.hasStoredValue) return prev;
            const effectivelyEmpty =
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
              prev.playedGenMin === undefined &&
              prev.playedGenMax === undefined;
            if (!effectivelyEmpty) return prev;
            return {
              playerCounts: s.filterOptions.playerCounts,
              maps: s.filterOptions.maps,
              gameModes: s.filterOptions.gameModes,
              gameSpeeds: s.filterOptions.gameSpeeds,
              preludeOn: undefined,
              coloniesOn: undefined,
              draftOn: undefined,
            };
          });
        }
      } catch (err) {
        console.error('Error fetching card summary:', err);
        if (!cancelled) setError('Failed to load project card statistics. Please try again.');
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [cardName, filters]);

  // Reset to first page when filters change
  useEffect(() => { setGamesPage(1); }, [filters]);

  // Fetch games only when Table view is active
  useEffect(() => {
    if (viewMode !== 'table' || !cardName) return;
    let cancelled = false;
    const run = async () => {
      try {
        setGamesLoading(true);
        const qs = buildFilterQuery(filters);
        const extra = `page=${gamesPage}&pageSize=${gamesPageSize}&sort=TableId&sortDir=desc`;
        const url = `/api/cards/${encodeURIComponent(cardName)}/games?${qs ? `${qs}&` : ''}${extra}`;
        const res = await api.get<CardGamesPage>(url);
        if (cancelled) return;
        setGames(res.data.rows);
        setGamesTotal(res.data.total);
      } catch (err) {
        console.error('Error fetching card games:', err);
      } finally {
        if (!cancelled) setGamesLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [viewMode, cardName, filters, gamesPage, gamesPageSize]);

  const handleFiltersChange = useCallback((newFilters: ProjectCardFilters) => {
    setFilters(newFilters);
  }, [setFilters]);

  const availablePlayerCounts = filterOptions?.playerCounts ?? [];
  const availableMaps = filterOptions?.maps ?? [];
  const availableGameModes = filterOptions?.gameModes ?? [];
  const availableGameSpeeds = filterOptions?.gameSpeeds ?? [];
  const availablePlayerNames: string[] = [];
  const eloRange = filterOptions?.eloRange ?? { min: 0, max: 0 };
  const playedGenRange = filterOptions?.playedGenRange;

  if (!name) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Project Card Not Found
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Please provide a valid project card name in the URL.
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
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
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

  const initialLoading = summaryLoading && !defaultsApplied;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-3">
          <BackButton fallbackPath="/cards" />
        </div>
        <div className="mb-8">
          <ProjectCardHeader cardName={cardName} stats={stats} isLoading={initialLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              {initialLoading || !filterOptions ? (
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
                      <div className="h-4 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <FiltersPanel
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  availablePlayerCounts={availablePlayerCounts}
                  availableMaps={availableMaps}
                  availableGameModes={availableGameModes}
                  availableGameSpeeds={availableGameSpeeds}
                  availablePlayerNames={availablePlayerNames}
                  eloRange={eloRange}
                  playedGenRange={playedGenRange}
                />
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            {initialLoading ? (
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

                <div className="w-full">
                  {viewMode === 'chart' ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <EloHistogram data={eloHistogram} />
                        <EloHistogram data={eloChangeHistogram} title="Elo Change Distribution" useRedGreenColors={true} />
                        <GenerationDistribution data={generationDistribution} />
                        <WinRateByGeneration data={generationData} />
                      </div>
                      <div className="flex justify-center">
                        <div className="w-full max-w-md">
                          <EloGainByGeneration data={generationData} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ProjectCardTable
                      data={games}
                      total={gamesTotal}
                      page={gamesPage}
                      pageSize={gamesPageSize}
                      loading={gamesLoading}
                      onPageChange={setGamesPage}
                      onPageSizeChange={(size) => { setGamesPageSize(size); setGamesPage(1); }}
                    />
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
