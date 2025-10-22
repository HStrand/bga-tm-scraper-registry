import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useCookieState } from '@/hooks/useCookieState';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AwardRow, AwardOverviewRow } from '@/types/award';
import { CorporationFilters } from '@/types/corporation';
import { FiltersPanel } from '@/components/FiltersPanel';
import { Button } from '@/components/ui/button';
import { getAwardsOverview, getAwardsFilterOptions } from '@/lib/awardCache';
import { getCorporationFilterOptions } from '@/lib/corpCache';
import type { AwardsFilterOptions } from '@/lib/awardCache';
import type { CorporationFilterOptions } from '@/lib/corpCache';
import { getAwardImage, getPlaceholderImage, nameToSlug } from '@/lib/award';

type SortField = keyof AwardOverviewRow;
type SortDirection = 'asc' | 'desc' | null;

export function AwardsOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AwardRow[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overviewRows, setOverviewRows] = useState<AwardOverviewRow[]>([]);
  const [awardOptions, setAwardOptions] = useState<AwardsFilterOptions | null>(null);
  const [globalOptions, setGlobalOptions] = useState<CorporationFilterOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>('winRate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Hover preview tooltip state
  const [hoveredAward, setHoveredAward] = useState<{ slug: string; imageSrc: string; name: string } | null>(null);
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
      const needsShrink = tipRect.width > (viewportW - 2 * margin);

      if (!needsShrink) {
        // Prefer right if it fits; otherwise flip left and clamp
        if (tipRect.width <= spaceRight) {
          left = trigger.right + 16;
        } else {
          const leftCandidate = trigger.left - tipRect.width - 16;
          left = Math.max(margin, Math.min(leftCandidate, viewportW - tipRect.width - margin));
        }
      } else {
        // Tooltip wider than viewport; anchor to margin
        left = margin;
      }
    } else {
      // Fallback clamp
      const maxLeft = Math.max(margin, viewportW - tipRect.width - margin);
      left = Math.max(margin, Math.min(left, maxLeft));
    }

    setTooltipPos({ top: clampedTop, left });
  }, [tooltipPos.left]);

  // Keep tooltip within viewport; also recompute on resize/scroll while visible
  useEffect(() => {
    if (!hoveredAward) return;

    const handler = () => updateTooltipPosition();
    // Initial position adjustment after mount
    handler();

    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [hoveredAward, updateTooltipPosition]);

  // Initialize filters with all options selected (persisted per page via cookie)
  const [filters, setFilters, , meta] = useCookieState<CorporationFilters>(
    'tm_filters_awards_overview_v1',
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

  // Initial load: fetch options; if we have stored filters, fetch overview immediately and load options in background
  useEffect(() => {
    const run = async () => {
      try {
        setIsInitialLoad(true);
        setError(null);

        if (meta.hasStoredValue) {
          // Kick off options in background
          getCorporationFilterOptions().then(setGlobalOptions).catch(() => {});
          getAwardsFilterOptions().then(setAwardOptions).catch(() => {});
          // Rankings will be fetched in the filters effect below
        } else {
          // No stored filters: fetch options to establish sensible defaults
          const [gOpts, aOpts] = await Promise.all([getCorporationFilterOptions(), getAwardsFilterOptions()]);
          setGlobalOptions(gOpts);
          setAwardOptions(aOpts);

          const playerCounts = gOpts.playerCounts;
          const maps = gOpts.maps;
          const gameModes = gOpts.gameModes;
          const gameSpeeds = gOpts.gameSpeeds;

          setFilters(prev => {
            if (
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
              prev.timesPlayedMin === undefined &&
              prev.timesPlayedMax === undefined
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

          setIsInitialLoad(false);
        }
      } catch (err) {
        console.error('Error preparing awards overview:', err);
        setError('Failed to load award statistics. Please try again.');
        setIsInitialLoad(false);
      }
    };
    run();
  }, []);

  // Fetch awards overview whenever filters change
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setIsRefreshing(true);
        setError(null);
        const rows = await getAwardsOverview(filters);
        if (!cancelled) {
          setOverviewRows(rows);
          setIsInitialLoad(false);
        }
      } catch (err) {
        console.error('Error fetching awards overview:', err);
        if (!cancelled) setError('Failed to load award statistics. Please try again.');
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [filters]);

  // Get available options for filters
  const availablePlayerCounts = useMemo(() => {
    return globalOptions?.playerCounts ?? [];
  }, [globalOptions]);

  const availableMaps = useMemo(() => {
    return globalOptions?.maps ?? [];
  }, [globalOptions]);

  const availableGameModes = useMemo(() => {
    return globalOptions?.gameModes ?? [];
  }, [globalOptions]);

  const availableGameSpeeds = useMemo(() => {
    return globalOptions?.gameSpeeds ?? [];
  }, [globalOptions]);

  const availablePlayerNames = useMemo(() => {
    return [] as string[]; // use server-side autocomplete
  }, []);
  
  const availableCorporations = useMemo(() => {
    return awardOptions?.corporations ?? [];
  }, [awardOptions]);

  const eloRange = useMemo(() => {
    return {
      min: globalOptions?.eloRange.min ?? 0,
      max: globalOptions?.eloRange.max ?? 0,
    };
  }, [globalOptions]);

  const generationsRange = useMemo(() => {
    return {
      min: globalOptions?.generationsRange.min ?? 0,
      max: globalOptions?.generationsRange.max ?? 0,
    };
  }, [globalOptions]);

  const fundedGenRange = useMemo(() => {
    return {
      min: awardOptions?.fundedGenRange.min ?? 0,
      max: awardOptions?.fundedGenRange.max ?? 0,
    };
  }, [awardOptions]);

  // Server-side filtering: overview is fetched from API when filters change
  const filteredData: AwardRow[] = [];

  // Use server-provided aggregated rows
  const awardOverview: AwardOverviewRow[] = useMemo(() => overviewRows, [overviewRows]);

  // Calculate times played range from aggregated data
  const timesPlayedRange = useMemo(() => {
    if (awardOverview.length === 0) return { min: 0, max: 0 };
    
    const counts = awardOverview.map(award => award.timesFunded);
    return {
      min: Math.min(...counts),
      max: Math.max(...counts),
    };
  }, [awardOverview]);

  // Apply times played filter and sort data
  const sortedData = useMemo(() => {
    // First apply times played filter
    let filteredOverview = awardOverview;
    if (filters.timesPlayedMin || filters.timesPlayedMax) {
      filteredOverview = awardOverview.filter(award => {
        if (filters.timesPlayedMin && award.timesFunded < filters.timesPlayedMin) return false;
        if (filters.timesPlayedMax && award.timesFunded > filters.timesPlayedMax) return false;
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
  }, [awardOverview, sortField, sortDirection, filters.timesPlayedMin, filters.timesPlayedMax]);

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
      setIsRefreshing(true);
      setError(null);
      const [aOpts] = await Promise.all([getAwardsFilterOptions(true)]);
      setAwardOptions(aOpts);
      const rows = await getAwardsOverview(filters);
      setOverviewRows(rows);
    } catch (err) {
      console.error('Error refreshing award statistics:', err);
      setError('Failed to refresh award statistics. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFiltersChange = useCallback((newFilters: CorporationFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
  }, [setFilters]);

  const handleRowClick = (awardName: string) => {
    // For now, we don't have individual award detail pages
    // navigate(`/awards/${encodeURIComponent(awardName)}`);
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
                Awards Overview
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Compare award performance and funding statistics
              </p>
            </div>
            <Button onClick={handleRefresh} variant="outline" disabled={isRefreshing || isInitialLoad}>
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              {!isInitialLoad && globalOptions && awardOptions && (
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
                  timesPlayedRange={timesPlayedRange}
                  playedGenRange={fundedGenRange}
                  timesPlayedLabel="Times Funded"
                  playedGenLabel="Funded Generation"
                />
              )}
            </div>
          </div>

          {/* Table area */}
          <div className="lg:col-span-3">
            {isInitialLoad ? (
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
                        Award Rankings
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {sortedData.length.toLocaleString()} awards
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
                          onClick={() => handleSort('award')}
                        >
                          Award {getSortIcon('award')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('winRate')}
                        >
                          Win Rate {getSortIcon('winRate')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('avgEloGain')}
                        >
                          Avg Elo Gain {getSortIcon('avgEloGain')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('timesFunded')}
                        >
                          Times Funded {getSortIcon('timesFunded')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('avgFundedGen')}
                        >
                          Avg Funded Gen {getSortIcon('avgFundedGen')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('avgElo')}
                        >
                          Avg Elo {getSortIcon('avgElo')}
                        </th>
                        <th 
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('flipRate')}
                        >
                          Flip Rate {getSortIcon('flipRate')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {paginatedData.map((row) => {
                        const displayName = row.award;
                        const imageSrc = getAwardImage(displayName) || getPlaceholderImage();
                        
                        return (
                          <tr 
                            key={row.award}
                            onClick={() => handleRowClick(displayName)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3 text-sm">
                              <div
                                className="flex items-center gap-3 relative group"
                                onMouseEnter={(e) => {
                                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                  desiredMidYRef.current = rect.top + rect.height / 2;
                                  triggerRectRef.current = rect;
                                  setHoveredAward({ slug: nameToSlug(displayName), imageSrc, name: displayName });
                                  setTooltipPos({ left: rect.right + 16, top: desiredMidYRef.current });
                                }}
                                onMouseLeave={() => setHoveredAward(null)}
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
                              {getEloChangeDisplay(row.avgEloGain)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {row.timesFunded.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {row.avgFundedGen.toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {row.avgElo.toFixed(0)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {(row.flipRate * 100).toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Hover image tooltip (single overlay) */}
                {hoveredAward && createPortal(
                  <div
                    ref={tooltipRef}
                    className="fixed z-50 pointer-events-none"
                    style={{ top: tooltipPos.top, left: tooltipPos.left, maxWidth: 'calc(100vw - 32px)' }}
                  >
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2">
                      <img
                        src={hoveredAward.imageSrc}
                        alt={hoveredAward.name}
                        className="rounded max-w-full max-h-[80vh] h-auto w-auto"
                        onLoad={updateTooltipPosition}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = getPlaceholderImage();
                        }}
                      />
                      <div className="text-center mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {hoveredAward.name}
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
