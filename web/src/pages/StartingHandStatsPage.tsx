import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { StartingHandStatsRow } from '@/types/startinghand';
import { getStartingHandStatsCached } from '@/lib/startingHandCache';
import { getCardImage, getCardPlaceholderImage, slugToCardName } from '@/lib/card';
import { getTier } from '@/lib/startingHandTier';
import { BackButton } from '@/components/BackButton';

export function StartingHandStatsPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [allData, setAllData] = useState<StartingHandStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hover tooltip state
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const cardName = useMemo(() => (name ? decodeURIComponent(name) : ''), [name]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getStartingHandStatsCached();
        setAllData(response);
      } catch (err) {
        console.error('Error fetching starting hand stats:', err);
        setError('Failed to load starting hand statistics. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const cardData = useMemo(() => {
    if (!cardName || allData.length === 0) return null;
    return allData.find(row =>
      row.card.toLowerCase() === cardName.toLowerCase()
    ) || null;
  }, [allData, cardName]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 400;
    const margin = 16;

    let x = rect.right + margin;
    if (x + tooltipWidth > window.innerWidth - margin) {
      x = rect.left - tooltipWidth - margin;
    }

    let y = rect.top + rect.height / 2 - tooltipHeight / 2;
    if (y < margin) {
      y = margin;
    } else if (y + tooltipHeight > window.innerHeight - margin) {
      y = window.innerHeight - tooltipHeight - margin;
    }

    setTooltipPos({ x, y });
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const imageSrc = cardName ? (getCardImage(cardName) || getCardPlaceholderImage()) : getCardPlaceholderImage();

  const tier = useMemo(() => {
    return cardData ? getTier(cardData.avgEloChangeKept) : getTier(null);
  }, [cardData]);

  const getEloChangeDisplay = (eloChange: number | null, large = false) => {
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
        : 'text-slate-900 dark:text-slate-100';

    return (
      <span className={`${colorClass} ${large ? 'text-xl md:text-2xl font-semibold' : ''}`}>
        {prefix}{eloChange.toFixed(2)}
      </span>
    );
  };

  if (!name) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Card Not Found
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Please provide a valid card name in the URL.
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
        {/* Back button */}
        <div className="flex items-center justify-between mb-3">
          <BackButton fallbackPath="/startinghands" />
        </div>

        {loading ? (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700">
            <div className="grid grid-cols-12 gap-6 p-6 items-center">
              <div className="col-span-12 md:col-span-8">
                <div className="h-8 w-48 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-4"></div>
                <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-2"></div>
                <div className="space-y-4 mt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="text-center">
                        <div className="h-6 w-16 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-1 mx-auto"></div>
                        <div className="h-4 w-12 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mx-auto"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ml-8">
                <div className="w-32 h-32 bg-slate-300 dark:bg-slate-600 rounded-xl animate-pulse"></div>
              </div>
            </div>
          </div>
        ) : !cardData ? (
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Card Not Found
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              No starting hand data found for "{cardName}".
            </p>
          </div>
        ) : (
          <>
            {/* Header with card image */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-50 via-slate-50 to-amber-100 dark:from-slate-900 dark:via-slate-800 dark:to-amber-900 border border-amber-200 dark:border-slate-700 shadow-sm mb-8">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 shadow-lg"></div>
              <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 px-3 py-1 text-xs font-semibold tracking-wide">
                STARTING HAND
              </span>

              <div className="grid grid-cols-12 gap-6 p-6 pt-12 items-center">
                <div className="col-span-12 md:col-span-8">
                  <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
                    {cardData.card}
                  </h1>
                  <div className="h-1 w-28 rounded-full bg-gradient-to-r from-amber-400 via-orange-300 to-amber-500"></div>

                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    Starting Hand Draft Statistics
                  </p>

                  {/* Tier badge */}
                  <div className={`inline-flex items-center gap-2 rounded-lg border-2 ${tier.border} ${tier.bg} px-4 py-2 mb-4`}>
                    <span className={`text-2xl md:text-3xl font-black tracking-tight ${tier.color}`}>
                      {tier.label}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">Tier</span>
                  </div>

                  {/* Key metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <div className="text-center">
                      <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                        {cardData.offeredGames.toLocaleString()}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">Offered Games</div>
                    </div>

                    <div className="text-center">
                      <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                        {cardData.keepRate != null ? (cardData.keepRate * 100).toFixed(1) + '%' : 'N/A'}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">Keep Rate</div>
                    </div>

                    <div className="text-center">
                      <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                        {cardData.keptGames.toLocaleString()}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">Kept Games</div>
                    </div>

                    <div className="text-center">
                      <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                        {cardData.notKeptGames.toLocaleString()}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">Not Kept Games</div>
                    </div>
                  </div>
                </div>

                {/* Card image */}
                <div className="col-span-12 md:col-span-4 flex justify-center">
                  <div
                    className="relative rounded-2xl ring-1 ring-amber-300/70 dark:ring-amber-700/50 shadow-xl overflow-hidden cursor-pointer hover:ring-amber-400/80 dark:hover:ring-amber-600/60 transition-all duration-200"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                  >
                    <img
                      src={imageSrc}
                      alt={cardData.card}
                      className="h-48 md:h-56 w-auto object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = getCardPlaceholderImage();
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Hover tooltip */}
              {showTooltip && createPortal(
                <div
                  className="fixed z-50 pointer-events-none"
                  style={{
                    left: tooltipPos.x,
                    top: tooltipPos.y,
                    maxWidth: 'calc(100vw - 32px)',
                  }}
                >
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2">
                    <img
                      src={imageSrc}
                      alt={cardData.card}
                      className="rounded max-w-none h-80 w-auto object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = getCardPlaceholderImage();
                      }}
                    />
                    <div className="text-center mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {cardData.card}
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>

            {/* Elo comparison section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center">
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Avg Elo Gain (Offered)</div>
                <div className="text-2xl font-semibold">
                  {getEloChangeDisplay(cardData.avgEloChangeOffered, true)}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center">
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Avg Elo Gain (Kept)</div>
                <div className="text-2xl font-semibold">
                  {getEloChangeDisplay(cardData.avgEloChangeKept, true)}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center">
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">Avg Elo Gain (Not Kept)</div>
                <div className="text-2xl font-semibold">
                  {getEloChangeDisplay(cardData.avgEloChangeNotKept, true)}
                </div>
              </div>
            </div>

            {/* Link to full card stats */}
            <div className="text-center">
              <button
                onClick={() => navigate(`/cards/${encodeURIComponent(cardData.card)}`)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              >
                View full card stats
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
