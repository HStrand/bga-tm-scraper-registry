import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCookieState } from '@/hooks/useCookieState';
import { Button } from '@/components/ui/button';
import { getCombinationBaselinesCached, getCombinationCombosCached } from '@/lib/combinationCache';
import { getCardImage, getCardPlaceholderImage, cardNameToSlug } from '@/lib/card';
import { getCorpImage, getPlaceholderImage as getCorpPlaceholderImage, nameToSlug as corpNameToSlug } from '@/lib/corp';
import { getPreludeImage, getPreludePlaceholderImage } from '@/lib/prelude';
import {
  CombinationBaselines,
  CombinationBaselineRow,
  CombinationComboRow,
  ComboType,
} from '@/types/combination';

type ItemKind = 'corp' | 'prelude' | 'card';

const COMBO_TYPES: { value: ComboType; label: string; slot1Label: string; slot2Label: string; slot1Kind: ItemKind; slot2Kind: ItemKind }[] = [
  { value: 'corp-prelude', label: 'Corp + Prelude', slot1Label: 'Corporation', slot2Label: 'Prelude', slot1Kind: 'corp', slot2Kind: 'prelude' },
  { value: 'corp-card', label: 'Corp + Card', slot1Label: 'Corporation', slot2Label: 'Card', slot1Kind: 'corp', slot2Kind: 'card' },
  { value: 'prelude-prelude', label: 'Prelude + Prelude', slot1Label: 'Prelude 1', slot2Label: 'Prelude 2', slot1Kind: 'prelude', slot2Kind: 'prelude' },
  { value: 'prelude-card', label: 'Prelude + Card', slot1Label: 'Prelude', slot2Label: 'Card', slot1Kind: 'prelude', slot2Kind: 'card' },
  { value: 'card-card', label: 'Card + Card', slot1Label: 'Card 1', slot2Label: 'Card 2', slot1Kind: 'card', slot2Kind: 'card' },
];

function getItemImage(name: string, kind: ItemKind): string {
  switch (kind) {
    case 'corp': return getCorpImage(corpNameToSlug(name)) || getCorpPlaceholderImage();
    case 'prelude': return getPreludeImage(name) || getPreludePlaceholderImage();
    case 'card': return getCardImage(name) || getCardPlaceholderImage();
  }
}

function getItemPlaceholder(kind: ItemKind): string {
  switch (kind) {
    case 'corp': return getCorpPlaceholderImage();
    case 'prelude': return getPreludePlaceholderImage();
    case 'card': return getCardPlaceholderImage();
  }
}

type SortField = 'name1' | 'name2' | 'gameCount' | 'avgEloChange' | 'winRate' | 'lift1' | 'lift2' | 'eloLift';
type SortDirection = 'asc' | 'desc' | null;

interface ComboRowWithLift extends CombinationComboRow {
  baseline1Elo: number | null;
  baseline2Elo: number | null;
  lift1: number | null;
  lift2: number | null;
  eloLift: number | null;
}

export function CombinationsPage() {
  const [activeTab, setActiveTab] = useCookieState<ComboType>('tm_combo_tab_v1', 'corp-prelude');
  const [baselines, setBaselines] = useState<CombinationBaselines | null>(null);
  const [combos, setCombos] = useState<CombinationComboRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField | null>('eloLift');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [search1, setSearch1] = useState('');
  const [search2, setSearch2] = useState('');
  const [minGames, setMinGames] = useState<number | undefined>(undefined);

  // Hover preview tooltip state
  const [hoveredItem, setHoveredItem] = useState<{
    name: string;
    imageSrc: string;
    kind: ItemKind;
    baselineElo: number | null;
    baselineWr: number | null;
    baselineGames: number | null;
  } | null>(null);

  // Column header tooltip state
  const [headerTooltip, setHeaderTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const desiredMidYRef = useRef(0);
  const triggerRectRef = useRef<DOMRect | null>(null);

  const tabConfig = COMBO_TYPES.find(t => t.value === activeTab)!;

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

  useEffect(() => {
    if (!hoveredItem) return;
    const handler = () => updateTooltipPosition();
    handler();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [hoveredItem, updateTooltipPosition]);

  // Fetch baselines on mount
  useEffect(() => {
    getCombinationBaselinesCached()
      .then(setBaselines)
      .catch(err => console.error('Error fetching baselines:', err));
  }, []);

  // Fetch combos on tab change
  useEffect(() => {
    let cancelled = false;
    const fetchCombos = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getCombinationCombosCached(activeTab);
        if (!cancelled) setCombos(data);
      } catch (err) {
        console.error('Error fetching combos:', err);
        if (!cancelled) setError('Failed to load combination data. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCombos();
    return () => { cancelled = true; };
  }, [activeTab]);

  // Reset page on tab/filter change
  useEffect(() => { setCurrentPage(1); }, [activeTab, search1, search2, minGames]);

  // Build baseline lookup maps
  const baselineMaps = useMemo(() => {
    if (!baselines) return { cards: new Map(), corporations: new Map(), preludes: new Map() };
    const toMap = (rows: CombinationBaselineRow[]) =>
      new Map(rows.map(r => [r.name, r]));
    return {
      cards: toMap(baselines.cards),
      corporations: toMap(baselines.corporations),
      preludes: toMap(baselines.preludes),
    };
  }, [baselines]);

  // Get baseline for a name based on active tab slot
  const getBaseline = useCallback((name: string, slot: 1 | 2): CombinationBaselineRow | undefined => {
    const tab = activeTab;
    if (slot === 1) {
      if (tab.startsWith('corp')) return baselineMaps.corporations.get(name);
      if (tab.startsWith('prelude')) return baselineMaps.preludes.get(name);
      return baselineMaps.cards.get(name);
    }
    // slot 2
    if (tab === 'corp-prelude') return baselineMaps.preludes.get(name);
    if (tab === 'corp-card') return baselineMaps.cards.get(name);
    if (tab === 'prelude-prelude') return baselineMaps.preludes.get(name);
    if (tab === 'prelude-card') return baselineMaps.cards.get(name);
    return baselineMaps.cards.get(name); // card-card
  }, [activeTab, baselineMaps]);

  // Compute rows with lift
  const rowsWithLift = useMemo((): ComboRowWithLift[] => {
    return combos.map(combo => {
      const b1 = getBaseline(combo.name1, 1);
      const b2 = getBaseline(combo.name2, 2);
      const baseline1Elo = b1 ? b1.avgEloChange : null;
      const baseline2Elo = b2 ? b2.avgEloChange : null;
      const lift1 = b1 ? combo.avgEloChange - b1.avgEloChange : null;
      const lift2 = b2 ? combo.avgEloChange - b2.avgEloChange : null;
      const eloLift = b1 && b2
        ? combo.avgEloChange - (b1.avgEloChange + b2.avgEloChange)
        : null;
      return { ...combo, baseline1Elo, baseline2Elo, lift1, lift2, eloLift };
    });
  }, [combos, getBaseline]);

  // Filter and sort
  const sortedData = useMemo(() => {
    let filtered = rowsWithLift;

    if (minGames) {
      filtered = filtered.filter(r => r.gameCount >= minGames);
    }
    if (search1) {
      const s = search1.toLowerCase();
      filtered = filtered.filter(r => r.name1.toLowerCase().includes(s));
    }
    if (search2) {
      const s = search2.toLowerCase();
      filtered = filtered.filter(r => r.name2.toLowerCase().includes(s));
    }

    if (!sortField || !sortDirection) return filtered;

    return [...filtered].sort((a, b) => {
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
  }, [rowsWithLift, sortField, sortDirection, search1, search2, minGames]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startRow = (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, sortedData.length);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortField(null); setSortDirection(null); }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const [, comboData] = await Promise.all([
        getCombinationBaselinesCached(true).then(setBaselines),
        getCombinationCombosCached(activeTab, true),
      ]);
      setCombos(comboData);
    } catch (err) {
      console.error('Error refreshing:', err);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '\u2195\uFE0F';
    if (sortDirection === 'asc') return '\u2191';
    if (sortDirection === 'desc') return '\u2193';
    return '\u2195\uFE0F';
  };

  const formatElo = (val: number | null) => {
    if (val == null) return <span className="text-slate-600 dark:text-slate-400">N/A</span>;
    const prefix = val > 0 ? '+' : '';
    const color = val > 0
      ? 'text-green-600 dark:text-green-400'
      : val < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-600 dark:text-slate-400';
    return <span className={color}>{prefix}{val.toFixed(2)}</span>;
  };

  const formatWr = (val: number | null) => {
    if (val == null) return <span className="text-slate-600 dark:text-slate-400">N/A</span>;
    return <span>{(val * 100).toFixed(1)}%</span>;
  };

  const formatLift = (val: number | null) => {
    if (val == null) return <span className="text-slate-600 dark:text-slate-400">N/A</span>;
    const prefix = val > 0 ? '+' : '';
    const color = val > 0
      ? 'text-green-600 dark:text-green-400'
      : val < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-600 dark:text-slate-400';
    return <span className={color}>{prefix}{val.toFixed(2)}</span>;
  };

  const formatBaselineElo = (val: number | null) => {
    if (val == null) return '';
    const prefix = val > 0 ? '+' : '';
    return `(${prefix}${val.toFixed(2)})`;
  };

  const thClass = "px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors";

  const showHeaderTooltip = (text: string) => (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHeaderTooltip({ text, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
  };
  const hideHeaderTooltip = () => setHeaderTooltip(null);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Error Loading Data</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
          <Button onClick={handleRefresh}>Retry</Button>
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
              <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Combinations</h1>
              <p className="text-slate-600 dark:text-slate-400">
                Discover how pairs of starting-hand items perform together vs their individual baselines
              </p>
            </div>
            <Button onClick={handleRefresh} variant="outline" disabled={loading}>
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {COMBO_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.value
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 ring-1 ring-amber-200/60 dark:ring-amber-700/40'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters & Table */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filters sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Filters</h3>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Min Games
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={minGames || ''}
                    onChange={e => setMinGames(e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    placeholder="e.g. 100"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {tabConfig.slot1Label}
                  </label>
                  <input
                    type="text"
                    value={search1}
                    onChange={e => setSearch1(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    placeholder={`Search ${tabConfig.slot1Label.toLowerCase()}...`}
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {tabConfig.slot2Label}
                  </label>
                  <input
                    type="text"
                    value={search2}
                    onChange={e => setSearch2(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    placeholder={`Search ${tabConfig.slot2Label.toLowerCase()}...`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
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
                        {tabConfig.label} Rankings
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        {sortedData.length > 0
                          ? `Showing ${startRow.toLocaleString()}-${endRow.toLocaleString()} of ${sortedData.length.toLocaleString()} combinations`
                          : 'No combinations found'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
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
                        <th className={thClass} onClick={() => handleSort('name1')}>
                          {tabConfig.slot1Label} {getSortIcon('name1')}
                        </th>
                        <th className={thClass} onClick={() => handleSort('name2')}>
                          {tabConfig.slot2Label} {getSortIcon('name2')}
                        </th>
                        <th className={thClass} onClick={() => handleSort('gameCount')}>
                          Games {getSortIcon('gameCount')}
                        </th>
                        <th className={thClass} onClick={() => handleSort('avgEloChange')}>
                          Avg Elo {getSortIcon('avgEloChange')}
                        </th>
                        <th className={thClass} onClick={() => handleSort('winRate')}>
                          Win Rate {getSortIcon('winRate')}
                        </th>
                        <th className={thClass} onClick={() => handleSort('lift1')}
                          onMouseEnter={showHeaderTooltip(`Combo Avg Elo minus ${tabConfig.slot1Label}'s baseline Elo. Shows how much better (or worse) the combo performs compared to ${tabConfig.slot1Label} alone.`)}
                          onMouseLeave={hideHeaderTooltip}>
                          Lift vs {tabConfig.slot1Label} {getSortIcon('lift1')}
                        </th>
                        <th className={thClass} onClick={() => handleSort('lift2')}
                          onMouseEnter={showHeaderTooltip(`Combo Avg Elo minus ${tabConfig.slot2Label}'s baseline Elo. Shows how much better (or worse) the combo performs compared to ${tabConfig.slot2Label} alone.`)}
                          onMouseLeave={hideHeaderTooltip}>
                          Lift vs {tabConfig.slot2Label} {getSortIcon('lift2')}
                        </th>
                        <th className={thClass} onClick={() => handleSort('eloLift')}
                          onMouseEnter={showHeaderTooltip('Combo Avg Elo minus the sum of both items\' baseline Elos. Positive means the pair has synergy beyond what each contributes individually.')}
                          onMouseLeave={hideHeaderTooltip}>
                          Total Lift {getSortIcon('eloLift')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {paginatedData.map((row, i) => (
                        <tr
                          key={`${row.name1}-${row.name2}-${i}`}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                            <div
                              className="flex items-center gap-2"
                              onMouseEnter={e => {
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                desiredMidYRef.current = rect.top + rect.height / 2;
                                triggerRectRef.current = rect;
                                const imgSrc = getItemImage(row.name1, tabConfig.slot1Kind);
                                const bl = getBaseline(row.name1, 1);
                                setHoveredItem({
                                  name: row.name1, imageSrc: imgSrc, kind: tabConfig.slot1Kind,
                                  baselineElo: bl?.avgEloChange ?? null, baselineWr: bl?.winRate ?? null, baselineGames: bl?.gameCount ?? null,
                                });
                                setTooltipPos({ left: rect.right + 16, top: desiredMidYRef.current });
                              }}
                              onMouseLeave={() => setHoveredItem(null)}
                            >
                              <img
                                src={getItemImage(row.name1, tabConfig.slot1Kind)}
                                alt={row.name1}
                                className="w-8 h-8 rounded object-cover flex-shrink-0"
                                onError={e => { (e.target as HTMLImageElement).src = getItemPlaceholder(tabConfig.slot1Kind); }}
                              />
                              <span>
                                {row.name1}{' '}
                                <span className="text-xs text-slate-500 dark:text-slate-400">{formatBaselineElo(row.baseline1Elo)}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                            <div
                              className="flex items-center gap-2"
                              onMouseEnter={e => {
                                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                desiredMidYRef.current = rect.top + rect.height / 2;
                                triggerRectRef.current = rect;
                                const imgSrc = getItemImage(row.name2, tabConfig.slot2Kind);
                                const bl = getBaseline(row.name2, 2);
                                setHoveredItem({
                                  name: row.name2, imageSrc: imgSrc, kind: tabConfig.slot2Kind,
                                  baselineElo: bl?.avgEloChange ?? null, baselineWr: bl?.winRate ?? null, baselineGames: bl?.gameCount ?? null,
                                });
                                setTooltipPos({ left: rect.right + 16, top: desiredMidYRef.current });
                              }}
                              onMouseLeave={() => setHoveredItem(null)}
                            >
                              <img
                                src={getItemImage(row.name2, tabConfig.slot2Kind)}
                                alt={row.name2}
                                className="w-8 h-8 rounded object-cover flex-shrink-0"
                                onError={e => { (e.target as HTMLImageElement).src = getItemPlaceholder(tabConfig.slot2Kind); }}
                              />
                              <span>
                                {row.name2}{' '}
                                <span className="text-xs text-slate-500 dark:text-slate-400">{formatBaselineElo(row.baseline2Elo)}</span>
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                            {row.gameCount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {formatElo(row.avgEloChange)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {formatWr(row.winRate)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {formatLift(row.lift1)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {formatLift(row.lift2)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {formatLift(row.eloLift)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Hover image tooltip */}
                {hoveredItem && createPortal(
                  <div
                    ref={tooltipRef}
                    className="fixed z-50 pointer-events-none"
                    style={{ top: tooltipPos.top, left: tooltipPos.left, maxWidth: 'calc(100vw - 32px)' }}
                  >
                    <div className="w-72 rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.25)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.5)] ring-1 ring-black/10 dark:ring-white/10">
                      {/* Image section */}
                      <div className="relative bg-slate-900">
                        <img
                          src={hoveredItem.imageSrc}
                          alt={hoveredItem.name}
                          className="w-full h-auto block"
                          onLoad={updateTooltipPosition}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                        {/* Type badge */}
                        <div className="absolute top-2.5 left-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${
                            hoveredItem.kind === 'corp'
                              ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30'
                              : hoveredItem.kind === 'prelude'
                                ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/30'
                                : 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/30'
                          }`}>
                            {hoveredItem.kind === 'corp' ? 'Corporation' : hoveredItem.kind === 'prelude' ? 'Prelude' : 'Project Card'}
                          </span>
                        </div>
                        {/* Name overlay */}
                        <div className="absolute bottom-0 inset-x-0 px-3.5 pb-3 pt-8">
                          <div className="text-white text-base font-bold leading-tight drop-shadow-md">{hoveredItem.name}</div>
                        </div>
                      </div>

                      {/* Stats section */}
                      <div className={`grid grid-cols-3 divide-x ${
                        hoveredItem.kind === 'corp'
                          ? 'bg-amber-50 dark:bg-amber-950/40 divide-amber-200/50 dark:divide-amber-800/30'
                          : hoveredItem.kind === 'prelude'
                            ? 'bg-violet-50 dark:bg-violet-950/40 divide-violet-200/50 dark:divide-violet-800/30'
                            : 'bg-sky-50 dark:bg-sky-950/40 divide-sky-200/50 dark:divide-sky-800/30'
                      }`}>
                        {[
                          {
                            label: 'Avg Elo',
                            value: hoveredItem.baselineElo != null
                              ? `${hoveredItem.baselineElo > 0 ? '+' : ''}${hoveredItem.baselineElo.toFixed(2)}`
                              : 'N/A',
                            color: hoveredItem.baselineElo != null && hoveredItem.baselineElo > 0
                              ? 'text-green-600 dark:text-green-400'
                              : hoveredItem.baselineElo != null && hoveredItem.baselineElo < 0
                                ? 'text-red-500 dark:text-red-400'
                                : 'text-slate-400',
                          },
                          {
                            label: 'Win Rate',
                            value: hoveredItem.baselineWr != null
                              ? `${(hoveredItem.baselineWr * 100).toFixed(1)}%`
                              : 'N/A',
                            color: 'text-slate-800 dark:text-slate-100',
                          },
                          {
                            label: 'Games',
                            value: hoveredItem.baselineGames != null
                              ? hoveredItem.baselineGames.toLocaleString()
                              : 'N/A',
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

                {/* Column header tooltip */}
                {headerTooltip && createPortal(
                  <div
                    className="fixed z-50 pointer-events-none"
                    style={{ top: headerTooltip.y, left: headerTooltip.x, transform: 'translateX(-50%)' }}
                  >
                    <div className="relative max-w-xs">
                      {/* Arrow */}
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-slate-800 dark:bg-slate-700 ring-1 ring-black/5" />
                      <div className="bg-slate-800 dark:bg-slate-700 text-white text-xs leading-relaxed rounded-lg px-3.5 py-2.5 shadow-xl ring-1 ring-black/10">
                        {headerTooltip.text}
                      </div>
                    </div>
                  </div>,
                  document.body
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="p-4 border-t border-zinc-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        Page {currentPage} of {totalPages}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handlePageChange(1)} disabled={currentPage === 1}>
                          First
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) pageNum = i + 1;
                            else if (currentPage <= 3) pageNum = i + 1;
                            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                            else pageNum = currentPage - 2 + i;
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePageChange(pageNum)}
                                className="w-8 h-8 p-0"
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>
                          Next
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages}>
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
