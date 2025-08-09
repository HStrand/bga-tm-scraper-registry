import { useState, useEffect } from 'react';
import { CorporationFilters } from '@/types/corporation';
import { Button } from '@/components/ui/button';

interface FiltersPanelProps {
  filters: CorporationFilters;
  onFiltersChange: (filters: CorporationFilters) => void;
  availablePlayerCounts: number[];
  availableMaps: string[];
  eloRange: { min: number; max: number };
  scoreRange: { min: number; max: number };
  maxPosition: number;
}

export function FiltersPanel({
  filters,
  onFiltersChange,
  availablePlayerCounts,
  availableMaps,
  eloRange,
  scoreRange,
  maxPosition,
}: FiltersPanelProps) {
  const [localFilters, setLocalFilters] = useState(filters);

  // Debounce filter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange(localFilters);
    }, 300);

    return () => clearTimeout(timer);
  }, [localFilters, onFiltersChange]);

  const updateFilters = (updates: Partial<CorporationFilters>) => {
    setLocalFilters(prev => ({ ...prev, ...updates }));
  };

  const resetFilters = () => {
    const defaultFilters: CorporationFilters = {
      playerCounts: availablePlayerCounts,
      maps: availableMaps,
      positions: Array.from({ length: maxPosition }, (_, i) => i + 1),
    };
    setLocalFilters(defaultFilters);
  };

  const togglePlayerCount = (count: number) => {
    const newCounts = localFilters.playerCounts.includes(count)
      ? localFilters.playerCounts.filter(c => c !== count)
      : [...localFilters.playerCounts, count].sort((a, b) => a - b);
    updateFilters({ playerCounts: newCounts });
  };

  const togglePosition = (position: number) => {
    const newPositions = localFilters.positions.includes(position)
      ? localFilters.positions.filter(p => p !== position)
      : [...localFilters.positions, position].sort((a, b) => a - b);
    updateFilters({ positions: newPositions });
  };

  const toggleMap = (map: string) => {
    const newMaps = localFilters.maps.includes(map)
      ? localFilters.maps.filter(m => m !== map)
      : [...localFilters.maps, map].sort();
    updateFilters({ maps: newMaps });
  };

  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-slate-700 p-6 space-y-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Filters
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={resetFilters}
          className="text-xs"
        >
          Reset
        </Button>
      </div>

      {/* Elo Range */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Elo Range
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input
              type="number"
              placeholder={`Min (${eloRange.min})`}
              value={localFilters.eloMin || ''}
              onChange={(e) => updateFilters({ 
                eloMin: e.target.value ? Number(e.target.value) : undefined 
              })}
              className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-slate-600 rounded-md bg-white/80 dark:bg-slate-700/70 backdrop-blur-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
          <div>
            <input
              type="number"
              placeholder={`Max (${eloRange.max})`}
              value={localFilters.eloMax || ''}
              onChange={(e) => updateFilters({ 
                eloMax: e.target.value ? Number(e.target.value) : undefined 
              })}
              className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-slate-600 rounded-md bg-white/80 dark:bg-slate-700/70 backdrop-blur-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Player Count */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Player Count
        </label>
        <div className="flex flex-wrap gap-2">
          {availablePlayerCounts.map(count => (
            <button
              key={count}
              onClick={() => togglePlayerCount(count)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                localFilters.playerCounts.includes(count)
                  ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-200'
                  : 'bg-white/60 dark:bg-slate-700/60 backdrop-blur-sm border-zinc-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50/70 dark:hover:bg-slate-600/70'
              }`}
            >
              {count}P
            </button>
          ))}
        </div>
      </div>

      {/* Maps */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Maps
        </label>
        <div className="flex flex-wrap gap-2">
          {availableMaps.map(map => (
            <button
              key={map}
              onClick={() => toggleMap(map)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                localFilters.maps.includes(map)
                  ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-200'
                  : 'bg-white/60 dark:bg-slate-700/60 backdrop-blur-sm border-zinc-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50/70 dark:hover:bg-slate-600/70'
              }`}
            >
              {map}
            </button>
          ))}
        </div>
      </div>

      {/* Min Final Score */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Min Final Score
        </label>
        <input
          type="number"
          placeholder={`Min (${scoreRange.min})`}
          value={localFilters.minFinalScore || ''}
          onChange={(e) => updateFilters({ 
            minFinalScore: e.target.value ? Number(e.target.value) : undefined 
          })}
          className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-slate-600 rounded-md bg-white/80 dark:bg-slate-700/70 backdrop-blur-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
      </div>

      {/* Positions */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Positions
        </label>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: maxPosition }, (_, i) => i + 1).map(position => (
            <button
              key={position}
              onClick={() => togglePosition(position)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                localFilters.positions.includes(position)
                  ? position === 1
                    ? 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200'
                    : 'bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                  : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              {position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}th`}
            </button>
          ))}
        </div>
      </div>

      {/* Active filters summary */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {localFilters.eloMin || localFilters.eloMax || localFilters.minFinalScore || 
           localFilters.playerCounts.length !== availablePlayerCounts.length ||
           localFilters.maps.length !== availableMaps.length ||
           localFilters.positions.length !== maxPosition
            ? 'Filters active'
            : 'No filters applied'
          }
        </div>
      </div>
    </div>
  );
}
