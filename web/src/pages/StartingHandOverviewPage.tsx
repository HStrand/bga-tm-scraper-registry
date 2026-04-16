import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useCookieState } from '@/hooks/useCookieState';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { StartingHandStatsRow, StartingHandOverviewRow, StartingHandOverviewFilters } from '@/types/startinghand';
import { Button } from '@/components/ui/button';
import { getStartingHandStatsCached, clearStartingHandStatsCache } from '@/lib/startingHandCache';
import { getCardImage, getCardPlaceholderImage, cardNameToSlug } from '@/lib/card';
import { getTier, TIER_ORDER } from '@/lib/startingHandTier';

type SortField = keyof StartingHandOverviewRow;
type SortDirection = 'asc' | 'desc' | null;

export function StartingHandOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<StartingHandStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>('avgEloChangeKept');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewMode, setViewMode] = useCookieState<'table' | 'tier'>('tm_startinghand_view_v1', 'table');

  // Hover preview tooltip state
  const [hoveredCard, setHoveredCard] = useState<{
    slug: string;
    imageSrc: string;
    name: string;
    avgEloChangeKept: number | null;
    keepRate: number | null;
    offeredGames: number;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const desiredMidYRef = useRef(0);
  const triggerRectRef = useRef<DOMRect | null>(null);

  // Filters (persisted per page via cookie)
  const [filters, setFilters] = useCookieState<StartingHandOverviewFilters>(
    'tm_filters_startinghands_overview_v1',
    {
      offeredGamesMin: undefined,
      searchTerm: '',
    }
  );

  // Recalculate tooltip position with clamping and flipping
  const updateTooltipPosition = useCallback(() => {
    if (!tooltipRef.current) return;
    const margin = 8;
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    const desiredTop = desiredMidYRef.current - tipRect.height / 2;
    const clampedTop = Math.max(margin, Math.min(desiredTop, viewportH - tipRect.height - margin));

    let left = tooltipPos.left;

    if (triggerRectRef.current) {
      const trigger = triggerRectRef.current;
      const spaceRight = viewportW - (trigger.right + 16) - margin;
      const needsShrink = tipRect.width > (viewportW - 2 * margin);

      if (!needsShrink) {
        if (tipRect.width <= spaceRight) {
          left = trigger.right + 16;
        } else {
          const leftCandidate = trigger.left - tipRect.width - 16;
          left = Math.max(margin, Math.min(leftCandidate, viewportW - tipRect.width - margin));
        }
      } else {
        left = margin;
      }
    } else {
      const maxLeft = Math.max(margin, viewportW - tipRect.width - margin);
      left = Math.max(margin, Math.min(left, maxLeft));
    }

    setTooltipPos({ top: clampedTop, left });
  }, [tooltipPos.left]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getStartingHandStatsCached();
        setData(response);
      } catch (err) {
        console.error('Error fetching starting hand stats:', err);
        setError('Failed to load starting hand statistics. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Convert API data to overview rows, filtering out garbage data
  const EXCLUDED_CARDS = new Set(['Sell patents', 'City', 'Aquifer', 'Greenery']);
  const cardOverview = useMemo((): StartingHandOverviewRow[] => {
    return data.filter(row => !EXCLUDED_CARDS.has(row.card)).map(row => ({
      card: cardNameToSlug(row.card),
      name: row.card,
      offeredGames: row.offeredGames,
      keptGames: row.keptGames,
      notKeptGames: row.notKeptGames,
      keepRate: row.keepRate,
      avgEloChangeOffered: row.avgEloChangeOffered,
      avgEloChangeKept: row.avgEloChangeKept,
      avgEloChangeNotKept: row.avgEloChangeNotKept,
    }));
  }, [data]);

  // Calculate offered games range from data
  const offeredGamesRange = useMemo(() => {
    if (cardOverview.length === 0) return { min: 0, max: 0 };
    const counts = cardOverview.map(card => card.offeredGames);
    return {
      min: Math.min(...counts),
      max: Math.max(...counts),
    };
  }, [cardOverview]);

  // Keep tooltip within viewport
  useEffect(() => {
    if (!hoveredCard) return;

    const handler = () => updateTooltipPosition();
    handler();

    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [hoveredCard, updateTooltipPosition]);

  // Apply filters
  const filteredCards = useMemo(() => {
    let filtered = cardOverview;
    if (filters.offeredGamesMin) {
      filtered = filtered.filter(card => card.offeredGames >= filters.offeredGamesMin!);
    }
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(card => card.name.toLowerCase().includes(searchLower));
    }
    return filtered;
  }, [cardOverview, filters]);

  // Sort filtered data for the table view
  const sortedData = useMemo(() => {
    if (!sortField || !sortDirection) return filteredCards;

    return [...filteredCards].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredCards, sortField, sortDirection]);

  // Group cards by tier for the tier list view
  const tierGroups = useMemo(() => {
    const groups = new Map<string, StartingHandOverviewRow[]>();
    for (const t of TIER_ORDER) groups.set(t.label, []);
    groups.set('?', []);
    for (const card of filteredCards) {
      const t = getTier(card.avgEloChangeKept);
      groups.get(t.label)!.push(card);
    }
    for (const [, arr] of groups) {
      arr.sort((a, b) => (b.avgEloChangeKept ?? -Infinity) - (a.avgEloChangeKept ?? -Infinity));
    }
    return groups;
  }, [filteredCards]);

  // Paginate the sorted data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, sortedData.length);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
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
      const response = await getStartingHandStatsCached(true);
      setData(response);
    } catch (err) {
      console.error('Error refreshing starting hand stats:', err);
      setError('Failed to refresh starting hand statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFiltersChange = useCallback((newFilters: StartingHandOverviewFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  const handleRowClick = (cardName: string) => {
    navigate(`/startinghands/${encodeURIComponent(cardName)}`);
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕️';
    if (sortDirection === 'asc') return '↑';
    if (sortDirection === 'desc') return '↓';
    return '↕️';
  };

  const getEloChangeDisplay = (eloChange: number | null) => {
    if (eloChange == null) {
      return (
        <span className="text-slate-600 dark:text-slate-400">
          N/A
        </span>
      );
    }

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
                Starting Hand Overview
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Compare starting hand draft decisions and click on a card to view detailed information
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                Based on 2-player ranked games with Prelude and Draft on, Colonies off
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
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
                    Filters
                  </h3>

                  {/* Min offered games filter */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Min Offered Games
                    </label>
                    <input
                      type="number"
                      min={offeredGamesRange.min}
                      max={offeredGamesRange.max}
                      value={filters.offeredGamesMin || ''}
                      onChange={(e) => handleFiltersChange({
                        ...filters,
                        offeredGamesMin: e.target.value ? parseInt(e.target.value) : undefined
                      })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      placeholder={`${offeredGamesRange.min} - ${offeredGamesRange.max}`}
                    />
                  </div>

                  {/* Search filter */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Search Cards
                    </label>
                    <input
                      type="text"
                      value={filters.searchTerm || ''}
                      onChange={(e) => handleFiltersChange({
                        ...filters,
                        searchTerm: e.target.value
                      })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      placeholder="Search by card name..."
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Table / tier-list area */}
          <div className="lg:col-span-3 space-y-6">
            {!loading && (
              <div className="flex items-center justify-center gap-2 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg w-fit mx-auto">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="px-4 py-2"
                >
                  Table View
                </Button>
                <Button
                  variant={viewMode === 'tier' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('tier')}
                  className="px-4 py-2"
                >
                  Tier List
                </Button>
              </div>
            )}
            {loading ? (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <div className="h-6 w-48 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-4"></div>
                <div className="space-y-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                  ))}
                </div>
              </div>
            ) : viewMode === 'table' ? (
              <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 shadow-sm overflow-visible">
                <div className="p-6 border-b border-zinc-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Starting Hand Rankings
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {sortedData.length.toLocaleString()} cards
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
                          onClick={() => handleSort('name')}
                        >
                          Card {getSortIcon('name')}
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('keepRate')}
                        >
                          Keep Rate {getSortIcon('keepRate')}
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('avgEloChangeOffered')}
                        >
                          Avg Elo Gain (Offered) {getSortIcon('avgEloChangeOffered')}
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('avgEloChangeKept')}
                        >
                          Avg Elo Gain (Kept) {getSortIcon('avgEloChangeKept')}
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('avgEloChangeNotKept')}
                        >
                          Avg Elo Gain (Not Kept) {getSortIcon('avgEloChangeNotKept')}
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors"
                          onClick={() => handleSort('offeredGames')}
                        >
                          Offered Games {getSortIcon('offeredGames')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {paginatedData.map((row) => {
                        const imageSrc = getCardImage(row.name) || getCardPlaceholderImage();

                        return (
                          <tr
                            key={row.card}
                            onClick={() => handleRowClick(row.name)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-3 text-sm">
                              <div
                                className="flex items-center gap-3 relative group"
                                onMouseEnter={(e) => {
                                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                  desiredMidYRef.current = rect.top + rect.height / 2;
                                  triggerRectRef.current = rect;
                                  setHoveredCard({
                                    slug: row.card, imageSrc, name: row.name,
                                    avgEloChangeKept: row.avgEloChangeKept,
                                    keepRate: row.keepRate,
                                    offeredGames: row.offeredGames,
                                  });
                                  setTooltipPos({ left: rect.right + 16, top: desiredMidYRef.current });
                                }}
                                onMouseLeave={() => setHoveredCard(null)}
                              >
                                <img
                                  src={imageSrc}
                                  alt={row.name}
                                  className="w-8 h-8 rounded object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = getCardPlaceholderImage();
                                  }}
                                />
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {row.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {row.keepRate != null ? (row.keepRate * 100).toFixed(1) + '%' : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {getEloChangeDisplay(row.avgEloChangeOffered)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {getEloChangeDisplay(row.avgEloChangeKept)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {getEloChangeDisplay(row.avgEloChangeNotKept)}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                              {row.offeredGames.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

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
            ) : (
              <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 shadow-sm overflow-visible">
                <div className="p-6 border-b border-zinc-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Tier List
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {filteredCards.length.toLocaleString()} cards grouped by Avg Elo Gain when kept
                  </p>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {[...TIER_ORDER, { label: '?', color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-700', border: 'border-slate-300 dark:border-slate-600' }].map(tier => {
                    const cardsInTier = tierGroups.get(tier.label) ?? [];
                    if (cardsInTier.length === 0) return null;
                    return (
                      <div key={tier.label} className="flex items-stretch">
                        <div className={`flex items-center justify-center w-20 flex-shrink-0 border-r-2 ${tier.border} ${tier.bg}`}>
                          <span className={`text-2xl md:text-3xl font-black tracking-tight ${tier.color}`}>
                            {tier.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 p-3 flex-1">
                          {cardsInTier.map(card => {
                            const imageSrc = getCardImage(card.name) || getCardPlaceholderImage();
                            return (
                              <button
                                key={card.card}
                                onClick={() => handleRowClick(card.name)}
                                onMouseEnter={(e) => {
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                  desiredMidYRef.current = rect.top + rect.height / 2;
                                  triggerRectRef.current = rect;
                                  setHoveredCard({
                                    slug: card.card, imageSrc, name: card.name,
                                    avgEloChangeKept: card.avgEloChangeKept,
                                    keepRate: card.keepRate,
                                    offeredGames: card.offeredGames,
                                  });
                                  setTooltipPos({ left: rect.right + 16, top: desiredMidYRef.current });
                                }}
                                onMouseLeave={() => setHoveredCard(null)}
                                className="flex flex-col items-center w-20 group cursor-pointer"
                                aria-label={`${card.name} — ${card.avgEloChangeKept != null ? card.avgEloChangeKept.toFixed(2) : 'N/A'} avg elo kept`}
                              >
                                <img
                                  src={imageSrc}
                                  alt={card.name}
                                  className="w-16 h-auto rounded ring-1 ring-slate-200 dark:ring-slate-600 group-hover:ring-2 group-hover:ring-amber-400 transition"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = getCardPlaceholderImage();
                                  }}
                                />
                                <span className="mt-1 text-[11px] leading-tight text-center text-slate-700 dark:text-slate-300 line-clamp-2 w-full">
                                  {card.name}
                                </span>
                                {card.avgEloChangeKept != null && (
                                  <span className={`text-[10px] font-medium ${
                                    card.avgEloChangeKept > 0
                                      ? 'text-green-600 dark:text-green-400'
                                      : card.avgEloChangeKept < 0
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-slate-500'
                                  }`}>
                                    {card.avgEloChangeKept > 0 ? '+' : ''}{card.avgEloChangeKept.toFixed(2)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {hoveredCard && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none"
          style={{ top: tooltipPos.top, left: tooltipPos.left, maxWidth: 'calc(100vw - 32px)' }}
        >
          <div className="w-72 rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.25)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5)] ring-1 ring-black/10 dark:ring-white/10">
            <div className="relative bg-slate-900">
              <img
                src={hoveredCard.imageSrc}
                alt={hoveredCard.name}
                className="w-full h-auto block"
                onLoad={updateTooltipPosition}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = getCardPlaceholderImage();
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
              <div className="absolute top-2.5 left-2.5">
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/30">
                  Project Card
                </span>
              </div>
              <div className="absolute bottom-0 inset-x-0 px-3.5 pb-3 pt-8">
                <div className="text-white text-base font-bold leading-tight drop-shadow-md">{hoveredCard.name}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x bg-sky-50 dark:bg-sky-950/40 divide-sky-200/50 dark:divide-sky-800/30">
              {[
                {
                  label: 'Avg Elo (Kept)',
                  value: hoveredCard.avgEloChangeKept != null
                    ? `${hoveredCard.avgEloChangeKept > 0 ? '+' : ''}${hoveredCard.avgEloChangeKept.toFixed(2)}`
                    : 'N/A',
                  color: hoveredCard.avgEloChangeKept != null && hoveredCard.avgEloChangeKept > 0
                    ? 'text-green-600 dark:text-green-400'
                    : hoveredCard.avgEloChangeKept != null && hoveredCard.avgEloChangeKept < 0
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-slate-400',
                },
                {
                  label: 'Keep Rate',
                  value: hoveredCard.keepRate != null
                    ? `${(hoveredCard.keepRate * 100).toFixed(1)}%`
                    : 'N/A',
                  color: 'text-slate-800 dark:text-slate-100',
                },
                {
                  label: 'Offered',
                  value: hoveredCard.offeredGames.toLocaleString(),
                  color: 'text-slate-800 dark:text-slate-100',
                },
              ].map(stat => (
                <div key={stat.label} className="py-2.5 px-2 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold mb-0.5">{stat.label}</div>
                  <div className={`text-sm font-bold ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
