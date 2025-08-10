import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { ProjectCardPlayerStatsRow, ProjectCardStats, ProjectCardFilters, GenerationData, HistogramBin, GenerationDistributionData } from '@/types/projectcard';
import { ProjectCardHeader } from '@/components/ProjectCardHeader';
import { FiltersPanel } from '@/components/FiltersPanel';
import { EloHistogram } from '@/components/charts/EloHistogram';
import { WinRateByGeneration } from '@/components/charts/WinRateByGeneration';
import { EloGainByGeneration } from '@/components/charts/EloGainByGeneration';
import { GenerationDistribution } from '@/components/charts/GenerationDistribution';
import { ProjectCardTable } from '@/components/ProjectCardTable';
import { Button } from '@/components/ui/button';
import { slugToCardName } from '@/lib/card';

export function ProjectCardStatsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<ProjectCardPlayerStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  // Initialize filters with all options selected
  const [filters, setFilters] = useState<ProjectCardFilters>({
    playerCounts: [],
    maps: [],
    gameModes: [],
    gameSpeeds: [],
    preludeOn: undefined,
    coloniesOn: undefined,
    draftOn: undefined,
  });

  // Fetch data
  useEffect(() => {
    if (!slug) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const cardName = slugToCardName(slug);
        const response = await axios.get<ProjectCardPlayerStatsRow[]>(`/api/cards/${encodeURIComponent(cardName)}/playerstats`);
        setData(response.data);

        // Initialize filters with all available options
        const maps = [...new Set(response.data.map(row => row.map).filter(Boolean))].sort() as string[];
        const gameModes = [...new Set(response.data.map(row => row.gameMode).filter(Boolean))].sort() as string[];
        const gameSpeeds = [...new Set(response.data.map(row => row.gameSpeed).filter(Boolean))].sort() as string[];
        const playerCounts = [...new Set(response.data.map(row => row.playerCount).filter((c): c is number => !!c))].sort((a, b) => a - b) as number[];

        setFilters({
          playerCounts,
          maps,
          gameModes,
          gameSpeeds,
          preludeOn: undefined,
          coloniesOn: undefined,
          draftOn: undefined,
        });
      } catch (err) {
        console.error('Error fetching project card stats:', err);
        setError('Failed to load project card statistics. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

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

  // Range of played generations present in the dataset (optional)
  const playedGenRange = useMemo(() => {
    const gens = data.map(row => row.playedGen).filter((g): g is number => g != null) as number[];
    if (gens.length === 0) return undefined;
    return {
      min: Math.min(...gens),
      max: Math.max(...gens),
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

      // Player count filter
      if (row.playerCount && !filters.playerCounts.includes(row.playerCount)) return false;

      // Map filter
      if (row.map && !filters.maps.includes(row.map)) return false;

      // Game mode filter
      if (row.gameMode && !filters.gameModes.includes(row.gameMode)) return false;

      // Game speed filter
      if (row.gameSpeed && !filters.gameSpeeds.includes(row.gameSpeed)) return false;

      // Expansion filters
      if (filters.preludeOn !== undefined && row.preludeOn !== filters.preludeOn) return false;
      if (filters.coloniesOn !== undefined && row.coloniesOn !== filters.coloniesOn) return false;
      if (filters.draftOn !== undefined && row.draftOn !== filters.draftOn) return false;

      // Played generation filter (apply only when at least one bound is set)
      if (filters.playedGenMin !== undefined || filters.playedGenMax !== undefined) {
        if (row.playedGen == null) return false;
        if (filters.playedGenMin !== undefined && row.playedGen < filters.playedGenMin) return false;
        if (filters.playedGenMax !== undefined && row.playedGen > filters.playedGenMax) return false;
      }

      return true;
    });
  }, [data, filters]);

  // Compute statistics
  const stats = useMemo((): ProjectCardStats => {
    const validData = filteredData.filter(row => row.position != null);
    const totalGames = validData.length;

    if (totalGames === 0) {
      return {
        totalGames: 0,
        winRate: 0,
        avgElo: 0,
        avgEloChange: 0,
        avgVpScored: 0,
      };
    }

    const wins = validData.filter(row => row.position === 1).length;
    const winRate = wins / totalGames;

    const avgElo = validData.reduce((sum, row) => sum + (row.elo || 0), 0) / totalGames;
    const avgEloChange = validData.reduce((sum, row) => sum + (row.eloChange || 0), 0) / totalGames;
    const avgVpScored = validData.reduce((sum, row) => sum + (row.vpScored || 0), 0) / totalGames;

    return {
      totalGames,
      winRate,
      avgElo,
      avgEloChange,
      avgVpScored,
    };
  }, [filteredData]);

  // Compute generation data for line charts
  const generationData = useMemo((): GenerationData[] => {
    const playedData = filteredData.filter(row => row.playedGen != null && row.position != null);
    
    if (playedData.length === 0) return [];

    const generationMap = new Map<number, { wins: number; totalGames: number; eloChangeSum: number }>();

    playedData.forEach(row => {
      const gen = row.playedGen!;
      const existing = generationMap.get(gen) || { wins: 0, totalGames: 0, eloChangeSum: 0 };
      
      existing.totalGames++;
      if (row.position === 1) existing.wins++;
      existing.eloChangeSum += row.eloChange || 0;
      
      generationMap.set(gen, existing);
    });

    const result: GenerationData[] = [];
    generationMap.forEach((value, generation) => {
      // Only include generations with at least 3 games for statistical relevance
      if (value.totalGames >= 3) {
        result.push({
          generation,
          winRate: value.wins / value.totalGames,
          avgEloChange: value.eloChangeSum / value.totalGames,
          gameCount: value.totalGames,
        });
      }
    });

    return result.sort((a, b) => a.generation - b.generation);
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

  // Compute generation distribution data
  const generationDistributionData = useMemo((): GenerationDistributionData[] => {
    const playedData = filteredData.filter(row => row.playedGen != null);
    if (playedData.length === 0) return [];

    const generationCounts = new Map<number, number>();
    
    playedData.forEach(row => {
      const gen = row.playedGen!;
      generationCounts.set(gen, (generationCounts.get(gen) || 0) + 1);
    });
    
    const total = playedData.length;
    const result: GenerationDistributionData[] = Array.from(generationCounts.entries()).map(([generation, count]) => ({
      generation,
      count,
      percentage: (count / total) * 100
    }));
    
    return result.sort((a, b) => a.generation - b.generation);
  }, [filteredData]);

  const handleFiltersChange = useCallback((newFilters: ProjectCardFilters) => {
    setFilters(newFilters);
  }, []);

  if (!slug) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Project Card Not Found
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Please provide a valid project card slug in the URL.
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
        {/* Header */}
        <div className="mb-8">
          <ProjectCardHeader slug={slug} stats={stats} isLoading={loading} />
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

                    {/* Elo Range */}
                    <div className="space-y-3">
                      <div className="h-4 w-24 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded" />
                        <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded" />
                      </div>
                    </div>

                    {/* Player Count */}
                    <div className="space-y-3">
                      <div className="h-4 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                        ))}
                      </div>
                    </div>

                    {/* Maps */}
                    <div className="space-y-3">
                      <div className="h-4 w-20 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                        ))}
                      </div>
                    </div>

                    {/* Game Modes */}
                    <div className="space-y-3">
                      <div className="h-4 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                        ))}
                      </div>
                    </div>

                    {/* Played Gen */}
                    <div className="space-y-3">
                      <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded" />
                        <div className="h-9 bg-slate-200 dark:bg-slate-700 rounded" />
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
                        <GenerationDistribution data={generationDistributionData} />
                        <WinRateByGeneration data={generationData} />
                      </div>
                      
                      {/* Bottom row - single chart centered */}
                      <div className="flex justify-center">
                        <div className="w-full max-w-md">
                          <EloGainByGeneration data={generationData} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ProjectCardTable data={filteredData} />
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
