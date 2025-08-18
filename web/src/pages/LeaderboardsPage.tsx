import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trophy, Leaf, TrendingUp, Target, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FiltersPanel } from '@/components/FiltersPanel';
import { useCookieState } from '@/hooks/useCookieState';
import type {
  LeaderboardView,
  PlayerScore,
  PlayerGreeneryStats,
  PlayerParameterStats,
  PlayerMilestoneStats,
  PlayerAwardStats,
  MilestoneType,
  AwardType,
  HighScoreFilters
} from '@/types/leaderboard';
import type { CorporationFilters } from '@/types/corporation';
import {
  getPlayerScores,
  getPlayerGreeneryStats,
  getPlayerParameterStats,
  getPlayerMilestoneStats,
  getPlayerAwardStats,
  getTopScores,
  getTopGreeneries,
  getTopParameters,
  getTopMilestones,
  getTopAwards
} from '@/lib/leaderboard';

// Import images
import vpImage from '/assets/vp.png';
import greeneryImage from '/assets/greenery.png';
import trImage from '/assets/tr.png';
import milestonesImage from '/assets/milestones.png';
import awardsImage from '/assets/awards.png';

interface ViewConfig {
  id: LeaderboardView;
  title: string;
  description: string;
  icon: React.ElementType;
  image: string;
}

const viewConfigs: ViewConfig[] = [
  {
    id: 'scores',
    title: 'High Scores',
    description: 'Highest scoring games',
    icon: Trophy,
    image: vpImage
  },
  {
    id: 'greeneries',
    title: 'Greeneries',
    description: 'Most greeneries placed',
    icon: Leaf,
    image: greeneryImage
  },
  {
    id: 'parameters',
    title: 'Global Parameters',
    description: 'Most parameter increases',
    icon: TrendingUp,
    image: trImage
  },
  {
    id: 'milestones',
    title: 'Milestones',
    description: 'Top milestone claim rates',
    icon: Target,
    image: milestonesImage
  },
  {
    id: 'awards',
    title: 'Awards',
    description: 'Top award win rates',
    icon: Award,
    image: awardsImage
  }
];

const milestoneOptions: { value: MilestoneType; label: string }[] = [
  { value: 'terraformer', label: 'Terraformer' },
  { value: 'gardener', label: 'Gardener' },
  { value: 'builder', label: 'Builder' },
  { value: 'mayor', label: 'Mayor' },
  { value: 'planner', label: 'Planner' }
];

const awardOptions: { value: AwardType; label: string }[] = [
  { value: 'thermalist', label: 'Thermalist' },
  { value: 'banker', label: 'Banker' },
  { value: 'scientist', label: 'Scientist' },
  { value: 'miner', label: 'Miner' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'total', label: 'Total Awards' }
];

export function LeaderboardsPage() {
  const [currentView, setCurrentView] = useCookieState<LeaderboardView>('tm_leaderboard_view', 'scores');
  const [selectedMilestone, setSelectedMilestone] = useCookieState<MilestoneType>('tm_milestone_type', 'terraformer');
  const [selectedAward, setSelectedAward] = useCookieState<AwardType>('tm_award_type', 'total');
  
  // Use CorporationFilters for high scores filtering to reuse FiltersPanel
  const [filters, setFilters, , meta] = useCookieState<CorporationFilters>(
    'tm_leaderboard_filters_v1',
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

  // Data states
  const [playerScores, setPlayerScores] = useState<PlayerScore[]>([]);
  const [greeneryStats, setGreeneryStats] = useState<PlayerGreeneryStats[]>([]);
  const [parameterStats, setParameterStats] = useState<PlayerParameterStats[]>([]);
  const [milestoneStats, setMilestoneStats] = useState<PlayerMilestoneStats[]>([]);
  const [awardStats, setAwardStats] = useState<PlayerAwardStats[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data based on current view
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        switch (currentView) {
          case 'scores':
            if (playerScores.length === 0) {
              const scores = await getPlayerScores();
              setPlayerScores(scores);
              
              // Initialize filters with all available options
              const playerCounts = [...new Set(scores.map(row => row.playerCount).filter(Boolean))].sort((a, b) => a! - b!);
              const maps = [...new Set(scores.map(row => row.map).filter(Boolean))].sort() as string[];
              const gameModes = [...new Set(scores.map(row => row.gameMode).filter(Boolean))].sort() as string[];
              const gameSpeeds = [...new Set(scores.map(row => row.gameSpeed).filter(Boolean))].sort() as string[];

              setFilters(prev => {
                // If we already loaded a stored value, don't override with defaults
                if (meta.hasStoredValue) return prev;

                // Apply defaults only if previous filters were effectively empty (fresh load)
                if (
                  prev.playerCounts.length === 0 &&
                  prev.maps.length === 0 &&
                  prev.gameModes.length === 0 &&
                  prev.gameSpeeds.length === 0 &&
                  prev.preludeOn === undefined &&
                  prev.coloniesOn === undefined &&
                  prev.draftOn === undefined
                ) {
                  return {
                    playerCounts: playerCounts as number[],
                    maps,
                    gameModes,
                    gameSpeeds,
                    preludeOn: undefined,
                    coloniesOn: undefined,
                    draftOn: undefined,
                  };
                }
                return prev;
              });
            }
            break;
          case 'greeneries':
            if (greeneryStats.length === 0) {
              const stats = await getPlayerGreeneryStats();
              setGreeneryStats(stats);
            }
            break;
          case 'parameters':
            if (parameterStats.length === 0) {
              const stats = await getPlayerParameterStats();
              setParameterStats(stats);
            }
            break;
          case 'milestones':
            if (milestoneStats.length === 0) {
              const stats = await getPlayerMilestoneStats();
              setMilestoneStats(stats);
            }
            break;
          case 'awards':
            if (awardStats.length === 0) {
              const stats = await getPlayerAwardStats();
              setAwardStats(stats);
            }
            break;
        }
      } catch (err) {
        console.error('Error loading leaderboard data:', err);
        setError('Failed to load leaderboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentView, playerScores.length, greeneryStats.length, parameterStats.length, milestoneStats.length, awardStats.length]);

  // Get available options for filters
  const availablePlayerCounts = useMemo(() => {
    return [...new Set(playerScores.map(row => row.playerCount).filter(Boolean))].sort((a, b) => a! - b!) as number[];
  }, [playerScores]);

  const availableMaps = useMemo(() => {
    return [...new Set(playerScores.map(row => row.map).filter(Boolean))].sort() as string[];
  }, [playerScores]);

  const availableGameModes = useMemo(() => {
    return [...new Set(playerScores.map(row => row.gameMode).filter(Boolean))].sort() as string[];
  }, [playerScores]);

  const availableGameSpeeds = useMemo(() => {
    return [...new Set(playerScores.map(row => row.gameSpeed).filter(Boolean))].sort() as string[];
  }, [playerScores]);

  const availablePlayerNames = useMemo(() => {
    return [...new Set(playerScores.map(row => row.playerName).filter(Boolean))].sort() as string[];
  }, [playerScores]);

  const availableCorporations = useMemo(() => {
    return [...new Set(playerScores.map(row => row.corporation).filter(Boolean))].sort() as string[];
  }, [playerScores]);

  const eloRange = useMemo(() => {
    const elos = playerScores.map(row => row.elo).filter(Boolean) as number[];
    return {
      min: Math.min(...elos) || 0,
      max: Math.max(...elos) || 2000,
    };
  }, [playerScores]);

  const generationsRange = useMemo(() => {
    const gens = playerScores.map(row => row.generations).filter(Boolean) as number[];
    return {
      min: Math.min(...gens) || 0,
      max: Math.max(...gens) || 20,
    };
  }, [playerScores]);

  // Filter data based on current filters
  const filteredPlayerScores = useMemo(() => {
    return playerScores.filter(row => {
      // Elo range filter - exclude N/A elo when min/max elo filters are applied
      if (filters.eloMin && (!row.elo || row.elo < filters.eloMin)) return false;
      if (filters.eloMax && (!row.elo || row.elo > filters.eloMax)) return false;

      // Player name filter
      if (filters.playerName && row.playerName !== filters.playerName) return false;

      // Corporation filter
      if (filters.corporation && row.corporation !== filters.corporation) return false;

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

      // Generations filter
      if (filters.generationsMin !== undefined && (row.generations === null || row.generations === undefined || row.generations < filters.generationsMin)) return false;
      if (filters.generationsMax !== undefined && (row.generations === null || row.generations === undefined || row.generations > filters.generationsMax)) return false;

      return true;
    });
  }, [playerScores, filters]);

  // Filter and get top data for current view
  const displayData = useMemo(() => {
    switch (currentView) {
      case 'scores':
        return getTopScores(filteredPlayerScores, 25); // Top 25 for high scores
      case 'greeneries':
        return getTopGreeneries(greeneryStats); // Top 25 (default)
      case 'parameters':
        return getTopParameters(parameterStats); // Top 25 (default)
      case 'milestones':
        return getTopMilestones(milestoneStats, selectedMilestone); // Top 25 (default)
      case 'awards':
        return getTopAwards(awardStats, selectedAward); // Top 25 (default)
      default:
        return [];
    }
  }, [currentView, filteredPlayerScores, greeneryStats, parameterStats, milestoneStats, awardStats, selectedMilestone, selectedAward]);

  const handleFiltersChange = useCallback((newFilters: CorporationFilters) => {
    setFilters(newFilters);
  }, [setFilters]);

  const currentConfig = viewConfigs.find(v => v.id === currentView)!;


  const renderLeaderboard = () => {
    if (loading) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      );
    }

    if (displayData.length === 0) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 text-center">
          <p className="text-slate-600 dark:text-slate-400">No data available for the current selection.</p>
        </div>
      );
    }

    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Top {displayData.length} - {currentConfig.title}
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Player
                </th>
                {currentView === 'scores' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Elo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Corporation
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Map
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Generations
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Players
                    </th>
                  </>
                )}
                {currentView === 'greeneries' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Greeneries/Game
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Total Games
                    </th>
                  </>
                )}
                {currentView === 'parameters' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Parameters/Game
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Total Games
                    </th>
                  </>
                )}
                {currentView === 'milestones' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {milestoneOptions.find(m => m.value === selectedMilestone)?.label} Rate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Tharsis Games
                    </th>
                  </>
                )}
                {currentView === 'awards' && (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {awardOptions.find(a => a.value === selectedAward)?.label} Rate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Tharsis Games
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {displayData.map((item, index) => (
                <tr 
                  key={index} 
                  className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                    currentView === 'scores' ? 'cursor-pointer' : ''
                  }`}
                  onClick={currentView === 'scores' ? () => window.open(`https://boardgamearena.com/table?table=${(item as PlayerScore).tableId}`, '_blank') : undefined}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                    #{index + 1}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                    {'playerId' in item && item.playerId ? (
                      <a
                        href={`https://boardgamearena.com/player?id=${item.playerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {'playerName' in item ? item.playerName : (item as PlayerGreeneryStats | PlayerParameterStats).name || 'Unknown'}
                      </a>
                    ) : (
                      <span>
                        {'playerName' in item ? item.playerName : (item as PlayerGreeneryStats | PlayerParameterStats).name || 'Unknown'}
                      </span>
                    )}
                  </td>
                  {currentView === 'scores' && (
                    <>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerScore).finalScore}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerScore).elo?.toFixed(0) || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerScore).corporation}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerScore).map}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerScore).generations || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerScore).playerCount ? `${(item as PlayerScore).playerCount}P` : 'N/A'}
                      </td>
                    </>
                  )}
                  {currentView === 'greeneries' && (
                    <>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerGreeneryStats).greeneriesPerGame.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerGreeneryStats).gameCount}
                      </td>
                    </>
                  )}
                  {currentView === 'parameters' && (
                    <>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerParameterStats).parameterIncreasesPerGame.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerParameterStats).gameCount}
                      </td>
                    </>
                  )}
                  {currentView === 'milestones' && (
                    <>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {((item as PlayerMilestoneStats)[`${selectedMilestone}Rate` as keyof PlayerMilestoneStats] as number).toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerMilestoneStats).tharsisGames}
                      </td>
                    </>
                  )}
                  {currentView === 'awards' && (
                    <>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {((item as PlayerAwardStats)[selectedAward === 'total' ? 'totalAwardRate' : `${selectedAward}Rate` as keyof PlayerAwardStats] as number).toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {(item as PlayerAwardStats).tharsisGames}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Leaderboards
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Explore top performers across different game statistics
          </p>
        </div>

        {/* View selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {viewConfigs.map((config) => {
            const Icon = config.icon;
            const isActive = currentView === config.id;
            
            return (
              <button
                key={config.id}
                onClick={() => setCurrentView(config.id)}
                className={`
                  relative p-4 rounded-lg border-2 transition-all text-left
                  ${isActive 
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/25' 
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                  }
                `}
              >
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={config.image}
                    alt={config.title}
                    className="w-8 h-8 rounded object-cover"
                  />
                  <Icon className={`w-5 h-5 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`} />
                </div>
                <h3 className={`font-semibold mb-1 ${isActive ? 'text-amber-900 dark:text-amber-100' : 'text-slate-900 dark:text-slate-100'}`}>
                  {config.title}
                </h3>
                <p className={`text-sm ${isActive ? 'text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'}`}>
                  {config.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Main content with sidebar layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              {currentView === 'scores' && !loading && (
                <FiltersPanel
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  availablePlayerCounts={availablePlayerCounts}
                  availableCorporations={availableCorporations}
                  availableMaps={availableMaps}
                  availableGameModes={availableGameModes}
                  availableGameSpeeds={availableGameSpeeds}
                  availablePlayerNames={availablePlayerNames}
                  eloRange={eloRange}
                  generationsRange={generationsRange}
                />
              )}
              
              {currentView === 'milestones' && (
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Select Milestone</h3>
                  <div className="flex flex-wrap gap-2">
                    {milestoneOptions.map(option => (
                      <Button
                        key={option.value}
                        onClick={() => setSelectedMilestone(option.value)}
                        variant={selectedMilestone === option.value ? 'default' : 'outline'}
                        size="sm"
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {currentView === 'awards' && (
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Select Award</h3>
                  <div className="flex flex-wrap gap-2">
                    {awardOptions.map(option => (
                      <Button
                        key={option.value}
                        onClick={() => setSelectedAward(option.value)}
                        variant={selectedAward === option.value ? 'default' : 'outline'}
                        size="sm"
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard area */}
          <div className="lg:col-span-3">
            {renderLeaderboard()}
          </div>
        </div>
      </div>
    </div>
  );
}
