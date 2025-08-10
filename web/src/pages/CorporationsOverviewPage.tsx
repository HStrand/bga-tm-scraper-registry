import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AllCorporationPlayerStatsRow, CorporationOverviewRow, CorporationFilters } from '@/types/corporation';
import { FiltersPanel } from '@/components/FiltersPanel';
import { Button } from '@/components/ui/button';
import { getAllCorporationStatsCached, clearAllCorporationStatsCache } from '@/lib/corpCache';
import { getCorpImage, getPlaceholderImage, slugToTitle, nameToSlug } from '@/lib/corp';

type SortField = keyof CorporationOverviewRow;
type SortDirection = 'asc' | 'desc' | null;

export function CorporationsOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AllCorporationPlayerStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>('winRate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Hover preview tooltip state
  const [hoveredCorp, setHoveredCorp] = useState<{ slug: string; imageSrc: string; name: string } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const desiredMidYRef = useRef(0);
  const triggerRectRef = useRef<DOMRect | null>(null);

  // Recalculate tooltip position with clamping and flipping
  const updateTooltipPosition = useCallback(() => {
    if (!tooltipRef.current) return;
    const margin = 8;
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    // Vertical clamp
    const desiredTop = desiredMidYRef.current - tipRect.height / 2;
    const clampedTop = Math.max(margin, Math.min(desiredTop, viewportH - tipRect.height - margin));

    // Horizontal placement with flip and hard clamp
    let left = tooltipPos.left;

    if (triggerRectRef.current) {
      const trigger = triggerRectRef.current;

      const spaceRight = viewportW - (trigger.right + 16) - margin;
      const spaceLeft = (trigger.left - 16) - margin;
      const needsShrink = tipRect.width > (viewportW - 2 * margin);

      if (!needsShrink) {
        // Prefer right if it fits
        if (tipRect.width <= spaceRight) {
          left = trigger.right + 16;
        } else {
          // Force flip to the left if right doesn't fit, then clamp to viewport
          const leftCandidate = trigger.left - tipRect.width - 16;
          left = Math.max(margin, Math.min(leftCandidate, viewportW - tipRect.width - margin));
        }
      } else {
        // Tooltip is wider than viewport - anchor to margin and let maxWidth scale it
        left = margin;
      }
    } else {
      // Fallback: clamp within viewport
      const maxLeft = Math.max(margin, viewportW - tipRect.width - margin);
      left = Math.max(margin, Math.min(left, maxLeft));
    }

    setTooltipPos({ top: clampedTop, left });
  }, [tooltipPos.left]);

  // Initialize filters with all options selected
  const [filters, setFilters] = useState<CorporationFilters>({
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
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getAllCorporationStatsCached();
        setData(response);

        // Initialize filters with all available options
        const playerCounts = [...new Set(response.map(row => row.playerCount).filter(Boolean))].sort((a, b) => a! - b!);
        const maps = [...new Set(response.map(row => row.map).filter(Boolean))].sort() as string[];
        const gameModes = [...new Set(response.map(row => row.gameMode).filter(Boolean))].sort() as string[];
        const gameSpeeds = [...new Set(response.map(row => row.gameSpeed).filter(Boolean))].sort() as string[];

        setFilters({
          playerCounts: playerCounts as number[],
          maps,
          gameModes,
          gameSpeeds,
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
  }, []);

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

      return true;
    });
  }, [data, filters]);

  // Aggregate data by corporation
  const corporationOverview = useMemo((): CorporationOverviewRow[] => {
    const corporationMap = new Map<string, {
      totalGames: number;
      wins: number;
      eloSum: number;
      eloChangeSum: number;
    }>();

    filteredData.forEach(row => {
      const slug = nameToSlug(row.corporation);
      const existing = corporationMap.get(slug) || { totalGames: 0, wins: 0, eloSum: 0, eloChangeSum: 0 };
      
      existing.totalGames++;
      if (row.position === 1) existing.wins++;
      existing.eloSum += row.elo || 0;
      existing.eloChangeSum += row.eloChange || 0;
      
      corporationMap.set(slug, existing);
    });

    const result: CorporationOverviewRow[] = [];
    corporationMap.forEach((value, slug) => {
      if (value.totalGames > 0) {
        result.push({
          corporation: slug,
          totalGames: value.totalGames,
          winRate: value.wins / value.totalGames,
          avgElo: value.eloSum / value.totalGames,
          avgEloChange: value.eloChangeSum / value.totalGames,
        });
      }
    });

    return result;
  }, [filteredData]);

  // Calculate times played range from aggregated data
  const timesPlayedRange = useMemo(() => {
    if (corporationOverview.length === 0) return { min: 0, max: 0 };
    
    const counts = corporationOverview.map(corp => corp.totalGames);
    return {
      min: Math.min(...counts),
      max: Math.max(...counts),
    };
  }, [corporationOverview]);

  // Keep tooltip within viewport; also recompute on resize/scroll while visible
  useEffect(() => {
    if (!hoveredCorp) return;

    const handler = () => updateTooltipPosition();
    // Initial position adjustment after mount
    handler();

    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [hoveredCorp, updateTooltipPosition]);

  // Apply times played filter and sort data
  const sortedData = useMemo(() => {
    // First apply times played filter
    let filteredOverview = corporationOverview;
    if (filters.timesPlayedMin || filters.timesPlayedMax) {
      filteredOverview = corporationOverview.filter(corp => {
        if (filters.timesPlayedMin && corp.totalGames < filters.timesPlayedMin) return false;
        if (filters.timesPlayedMax && corp.totalGames > filters.timesPlayedMax) return false;
        return true;
      });
    }

    // Then sort
    if (!sortField || !sortDirection) return filteredOverview;

    return [...filteredOverview].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      // Handle null/undefined values - always put them at the end
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Numeric comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // String comparison
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [corporationOverview, sortField, sortDirection, filters.timesPlayedMin, filters.timesPlayedMax]);

  // Paginate the sorted data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, currentPage, pageSize]);

  // Calculate pagination info
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, sortedData.length);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    // Reset to first page when sorting changes
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllCorporationStatsCached(true); // Force refresh
      setData(response);
    } catch (err) {
      console.error('Error refreshing corporation stats:', err);
      setError('Failed to refresh corporation statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFiltersChange = useCallback((newFilters: CorporationFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
  }, []);

  const handleRowClick = (corporation: string) => {
    navigate(`/corporations/${corporation}`);
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕️';
    if (sortDirection === 'asc') return '↑';
    if (sortDirection === 'desc') return '↓';
    return '↕️';
  };

  const getEloChangeDisplay = (eloChange: number) => {
    const prefix = eloChange > 0 ? '+' : '';
    const colorClass = eloChange > 0 
      ? 'text-green-600 dark:text-green-400' 
      : eloChange < 0 
        ? 'text-red-600 dark:text-red-400' 
        : 'text-slate-600 dark:text-slate-400';
    
    return (
      <span className={colorClass}>
        {prefix}{eloChange.toFixed(2)}
      </span>
    );
  };

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
          <Button onClick={handleRefresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                Corporations Overview
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Compare corporation performance across all games
              </p>
            </div>
            <Button onClick={handleRefresh} variant="outline" disabled={loading}>
              Refresh Data
            </Button>
          </div>
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
                  availablePlayerNames={availablePlayerNames}
                  eloRange={eloRange}
                  timesPlayedRange={timesPlayedRange}
                />
              )}
            </div>
          </div>

          {/* Table area */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <div className="h-6 w-48 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-4"></div>
                <div className="space-y-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 shadow-sm overflow-visible">
                <div className="p-6 border-b border-zinc-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Corporation Rankings
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {sortedData.length.toLocaleString()} corporations
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        className="px-2 py-1 text-sm border border-zinc-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-700/50">
                      <tr>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('corporation')}
                        >
                          Corporation {getSortIcon('corporation')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('winRate')}
                        >
                          Win Rate {getSortIcon('winRate')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('avgEloChange')}
                        >
                          Avg Elo Gain {getSortIcon('avgEloChange')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('totalGames')}
                        >
                          Times Played {getSortIcon('totalGames')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('avgElo')}
                        >
                          Avg Elo {getSortIcon('avgElo')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {paginatedData.map((row) => {
                        const displayName = slugToTitle(row.corporation);
                        const imageSrc = getCorpImage(row.corporation) || getPlaceholderImage();
                        
                        return (
                          <tr 
                            key={row.corporation}
                            onClick={() => handleRowClick(row.corporation)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3 text-sm">
                              <div
                                className="flex items-center gap-3 relative group"
                                onMouseEnter={(e) => {
                                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                  desiredMidYRef.current = rect.top + rect.height / 2;
                                  triggerRectRef.current = rect;
                                  setHoveredCorp({ slug: row.corporation, imageSrc, name: displayName });
                                  setTooltipPos({ left: rect.right + 16, top: desiredMidYRef.current });
                                }}
                                onMouseLeave={() => setHoveredCorp(null)}
                              >
                                <img
                                  src={imageSrc}
                                  alt={displayName}
                                  className="w-8 h-8 rounded object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = getPlaceholderImage();
                                  }}
                                />
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {displayName}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {(row.winRate * 100).toFixed(1)}%
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {getEloChangeDisplay(row.avgEloChange)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {row.totalGames.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {row.avgElo.toFixed(0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Hover image tooltip (single overlay) */}
                {hoveredCorp && createPortal(
                  <div
                    ref={tooltipRef}
                    className="fixed z-50 pointer-events-none"
                    style={{ top: tooltipPos.top, left: tooltipPos.left, maxWidth: 'calc(100vw - 32px)' }}
                  >
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2">
                      <img
                        src={hoveredCorp.imageSrc}
                        alt={hoveredCorp.name}
                        className="rounded max-w-full max-h-[80vh] h-auto w-auto"
                        onLoad={updateTooltipPosition}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = getPlaceholderImage();
                        }}
                      />
                      <div className="text-center mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {hoveredCorp.name}
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
                
                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="p-4 border-t border-zinc-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        Page {currentPage} of {totalPages}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(1)}
                          disabled={currentPage === 1}
                        >
                          First
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        
                        {/* Page numbers */}
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePageChange(pageNum)}
                                className="w-8 h-8 p-0"
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          Last
                        </Button>
                      </div>
                    </div>
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
