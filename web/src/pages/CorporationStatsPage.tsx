import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CorporationPlayerStatsRow, CorporationStats, CorporationFilters, HistogramBin } from '@/types/corporation';
import { CorporationHeader } from '@/components/CorporationHeader';
import { FiltersPanel } from '@/components/FiltersPanel';
import { EloHistogram } from '@/components/charts/EloHistogram';
import { PositionsBar } from '@/components/charts/PositionsBar';
import { ScoreEloScatter } from '@/components/charts/ScoreEloScatter';
import { GameDetailsTable } from '@/components/GameDetailsTable';
import { Button } from '@/components/ui/button';

export function CorporationStatsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<CorporationPlayerStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  // Initialize filters with all options selected
  const [filters, setFilters] = useState<CorporationFilters>({
    playerCounts: [],
    maps: [],
    gameModes: [],
    gameSpeed: undefined,
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
        const response = await axios.get<CorporationPlayerStatsRow[]>(`/api/corporations/${slug}/playerstats`);
        setData(response.data);

        // Initialize filters with all available options
        const playerCounts = [...new Set(response.data.map(row => row.playerCount).filter(Boolean))].sort((a, b) => a! - b!);
        const maps = [...new Set(response.data.map(row => row.map).filter(Boolean))].sort() as string[];
        const gameModes = [...new Set(response.data.map(row => row.gameMode).filter(Boolean))].sort() as string[];

        setFilters({
          playerCounts: playerCounts as number[],
          maps,
          gameModes,
          gameSpeed: undefined,
          preludeOn: undefined,
          coloniesOn: undefined,
          draftOn: undefined,
        });
      } catch (err) {
        console.error('Error fetching corporation stats:', err);
        setError('Failed to load corporation statistics. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  // Get available options for filters
  const availablePlayerCounts = useMemo(() => {
    return [...new Set(data.map(row => row.playerCount).filter(Boolean))].sort((a, b) => a! - b!) as number[];
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
      if (filters.eloMin && row.elo && row.elo < filters.eloMin) return false;
      if (filters.eloMax && row.elo && row.elo > filters.eloMax) return false;

      // Player count filter
      if (row.playerCount && !filters.playerCounts.includes(row.playerCount)) return false;

      // Map filter
      if (row.map && !filters.maps.includes(row.map)) return false;

      // Game mode filter
      if (row.gameMode && !filters.gameModes.includes(row.gameMode)) return false;

      // Game speed filter
      if (filters.gameSpeed && row.gameSpeed !== filters.gameSpeed) return false;

      // Expansion filters
      if (filters.preludeOn !== undefined && row.preludeOn !== filters.preludeOn) return false;
      if (filters.coloniesOn !== undefined && row.coloniesOn !== filters.coloniesOn) return false;
      if (filters.draftOn !== undefined && row.draftOn !== filters.draftOn) return false;

      return true;
    });
  }, [data, filters]);

  // Compute statistics
  const stats = useMemo((): CorporationStats => {
    const validData = filteredData.filter(row => row.finalScore != null);
    const totalGames = validData.length;

    if (totalGames === 0) {
      return {
        totalGames: 0,
        winRate: 0,
        avgElo: 0,
        avgEloChange: 0,
        avgFinalScore: 0,
        avgDuration: 0,
        avgGenerations: 0,
        positionsCount: {},
        playerCountDistribution: {},
      };
    }

    const wins = validData.filter(row => row.position === 1).length;
    const winRate = wins / totalGames;

    const avgElo = validData.reduce((sum, row) => sum + (row.elo || 0), 0) / totalGames;
    const avgEloChange = validData.reduce((sum, row) => sum + (row.eloChange || 0), 0) / totalGames;
    const avgFinalScore = validData.reduce((sum, row) => sum + (row.finalScore || 0), 0) / totalGames;
    const avgDuration = validData.reduce((sum, row) => sum + (row.durationMinutes || 0), 0) / totalGames;
    const avgGenerations = validData.reduce((sum, row) => sum + (row.generations || 0), 0) / totalGames;

    // Position distribution
    const positionsCount = validData.reduce((acc, row) => {
      if (row.position) {
        acc[row.position] = (acc[row.position] || 0) + 1;
      }
      return acc;
    }, {} as Record<number, number>);

    // Player count distribution
    const playerCountDistribution = validData.reduce((acc, row) => {
      if (row.playerCount) {
        acc[row.playerCount] = (acc[row.playerCount] || 0) + 1;
      }
      return acc;
    }, {} as Record<number, number>);

    return {
      totalGames,
      winRate,
      avgElo,
      avgEloChange,
      avgFinalScore,
      avgDuration,
      avgGenerations,
      positionsCount,
      playerCountDistribution,
    };
  }, [filteredData]);

  // Compute histogram data for Elo
  const eloHistogramData = useMemo((): HistogramBin[] => {
    const elos = filteredData.map(row => row.elo).filter(Boolean) as number[];
    if (elos.length === 0) return [];

    const min = Math.min(...elos);
    const max = Math.max(...elos);
    const binCount = Math.min(12, Math.max(5, Math.ceil(elos.length / 20))); // Dynamic bin count
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

    // Fixed range from -20 to 20 with 20 bins
    const min = -20;
    const max = 20;
    const binCount = 20;
    const binSize = (max - min) / binCount;

    const bins: HistogramBin[] = [];
    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binSize;
      const binMax = min + (i + 1) * binSize;
      // Filter elo changes to only include those within our range, then count those in this bin
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

  const handleFiltersChange = useCallback((newFilters: CorporationFilters) => {
    setFilters(newFilters);
  }, []);

  if (!slug) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Corporation Not Found
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Please provide a valid corporation slug in the URL.
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <CorporationHeader slug={slug} stats={stats} isLoading={loading} />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              {!loading && (
                <FiltersPanel
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  availablePlayerCounts={availablePlayerCounts}
                  availableMaps={availableMaps}
                  availableGameModes={availableGameModes}
                  availableGameSpeeds={availableGameSpeeds}
                  eloRange={eloRange}
                />
              )}
            </div>
          </div>

          {/* Charts area */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                    <div className="h-6 w-32 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-4"></div>
                    <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Charts grid */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <EloHistogram data={eloHistogramData} />
                  <EloHistogram data={eloChangeHistogramData} title="Elo Change Distribution" useRedGreenColors={true} />
                </div>
                
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
                    <ScoreEloScatter data={filteredData} />
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
