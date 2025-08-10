import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getCardImage, getCardPlaceholderImage, slugToCardName } from '@/lib/card';
import { ProjectCardStats } from '@/types/projectcard';

interface ProjectCardHeaderProps {
  slug: string;
  stats: ProjectCardStats;
  isLoading?: boolean;
}

export function ProjectCardHeader({ slug, stats, isLoading }: ProjectCardHeaderProps) {
  const displayName = slugToCardName(slug);
  const imageSrc = getCardImage(displayName) || getCardPlaceholderImage();
  
  // Hover tooltip state
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 320; // Approximate width of tooltip
    const tooltipHeight = 400; // Approximate height of tooltip
    const margin = 16;
    
    // Determine horizontal position (prefer right, flip to left if no space)
    let x = rect.right + margin;
    if (x + tooltipWidth > window.innerWidth - margin) {
      x = rect.left - tooltipWidth - margin;
    }
    
    // Determine vertical position (center on image, adjust if off-screen)
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

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700">
        <div className="grid grid-cols-12 gap-6 p-6 items-center">
          <div className="col-span-12 md:col-span-8">
            <div className="h-8 w-48 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-4"></div>
            <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-2"></div>
            <div className="space-y-4 mt-6">
              {/* Row 1 skeleton - Main metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="text-center">
                    <div className="h-6 w-16 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-1 mx-auto"></div>
                    <div className="h-4 w-12 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mx-auto"></div>
                  </div>
                ))}
              </div>
              
              {/* Row 2 skeleton - VP Scored */}
              <div className="grid grid-cols-1 gap-2">
                <div className="text-center">
                  <div className="h-6 w-16 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mb-1 mx-auto"></div>
                  <div className="h-4 w-20 bg-slate-300 dark:bg-slate-600 rounded animate-pulse mx-auto"></div>
                </div>
              </div>
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-50 via-slate-50 to-blue-100 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 border border-blue-200 dark:border-slate-700 shadow-sm">
      {/* Accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 shadow-lg"></div>
      <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-3 py-1 text-xs font-semibold tracking-wide">
        PROJECT CARD
      </span>
      
      <div className="grid grid-cols-12 gap-6 p-6 items-center">
        <div className="col-span-12 md:col-span-8">
          {/* Card name */}
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
            {displayName}
          </h1>
          <div className="h-1 w-28 rounded-full bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500"></div>
          
          {/* Subtitle */}
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Project Card Statistics & Performance
          </p>
          
          {/* Key metrics */}
          <div className="space-y-4 mt-4">
            {/* Row 1: Main metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {stats.totalGames.toLocaleString()}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Games</div>
              </div>

              <div className="text-center">
                <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {(stats.winRate * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Win Rate</div>
              </div>

              <div className="text-center">
                <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {stats.avgElo.toFixed(0)}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Avg Elo</div>
              </div>

              <div className="text-center">
                <div className={`text-xl md:text-2xl font-semibold ${
                  stats.avgEloChange > 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : stats.avgEloChange < 0 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-slate-900 dark:text-slate-100'
                }`}>
                  {stats.avgEloChange > 0 ? '+' : ''}{stats.avgEloChange.toFixed(2)}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Avg Elo Change</div>
              </div>
            </div>

            {/* Row 2: VP Scored */}
            <div className="grid grid-cols-1 gap-2">
              <div className="text-center">
                <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {stats.avgVpScored.toFixed(1)}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Avg VP Scored</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Card image */}
        <div className="col-span-12 md:col-span-4 flex justify-center">
          <div 
            className="relative rounded-2xl ring-1 ring-blue-300/70 dark:ring-blue-700/50 shadow-xl overflow-hidden cursor-pointer hover:ring-blue-400/80 dark:hover:ring-blue-600/60 transition-all duration-200"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <img
              src={imageSrc}
              alt={displayName}
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
              alt={displayName}
              className="rounded max-w-none h-80 w-auto object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = getCardPlaceholderImage();
              }}
            />
            <div className="text-center mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
              {displayName}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
