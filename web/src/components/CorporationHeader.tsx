import { getCorpImage, getPlaceholderImage, slugToTitle } from '@/lib/corp';
import { CorporationStats } from '@/types/corporation';

interface CorporationHeaderProps {
  slug: string;
  stats: CorporationStats;
  isLoading?: boolean;
}

export function CorporationHeader({ slug, stats, isLoading }: CorporationHeaderProps) {
  const displayName = slugToTitle(slug);
  const imageSrc = getCorpImage(slug) || getPlaceholderImage();

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700">
        <div className="flex items-center justify-between p-8">
          <div className="flex-1">
            <div className="h-8 w-48 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-4"></div>
            <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-2"></div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="text-center">
                  <div className="h-6 w-16 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-1 mx-auto"></div>
                  <div className="h-4 w-12 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mx-auto"></div>
                </div>
              ))}
            </div>
          </div>
          <div className="ml-8">
            <div className="w-32 h-32 bg-slate-300 dark:bg-slate-600 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-zinc-50 via-slate-50 to-zinc-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 border border-zinc-200 dark:border-slate-700 shadow-sm">
      {/* Accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 shadow-lg"></div>
      <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 px-3 py-1 text-xs font-semibold tracking-wide">
        CORPORATION
      </span>
      
      <div className="flex items-center justify-between p-8">
        <div className="flex-1">
          {/* Corporation name */}
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {displayName}
          </h1>
          <div className="h-1 w-28 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500"></div>
          
          {/* Subtitle */}
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Corporation Statistics & Performance
          </p>
          
          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {stats.totalGames.toLocaleString()}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Games</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {(stats.winRate * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Win Rate</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {stats.avgElo.toFixed(0)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Avg Elo</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {stats.avgFinalScore.toFixed(0)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Avg Score</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {Math.round(stats.avgDuration)}m
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Avg Duration</div>
            </div>
          </div>
        </div>
        
        {/* Corporation image */}
        <div className="ml-8 flex-shrink-0">
          <div className="relative p-3 rounded-2xl bg-white/90 dark:bg-slate-800/70 ring-2 ring-amber-300/70 dark:ring-amber-700/50 shadow-xl">
            <img
              src={imageSrc}
              alt={displayName}
              className="w-64 md:w-96 lg:w-[28rem] h-auto max-h-[22rem] object-contain rounded-xl"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = getPlaceholderImage();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
