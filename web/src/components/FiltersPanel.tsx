import { useState, useEffect } from 'react';
import { CorporationFilters } from '@/types/corporation';
import { Button } from '@/components/ui/button';

interface FiltersPanelProps {
  filters: CorporationFilters;
  onFiltersChange: (filters: CorporationFilters) => void;
  availablePlayerCounts: number[];
  availableMaps: string[];
  availableGameModes: string[];
  availableGameSpeeds: string[];
  eloRange: { min: number; max: number };
}

export function FiltersPanel({
  filters,
  onFiltersChange,
  availablePlayerCounts,
  availableMaps,
  availableGameModes,
  availableGameSpeeds,
  eloRange,
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
      gameModes: availableGameModes,
      gameSpeed: undefined,
      preludeOn: undefined,
      coloniesOn: undefined,
      draftOn: undefined,
    };
    setLocalFilters(defaultFilters);
  };

  const togglePlayerCount = (count: number) => {
    const newCounts = localFilters.playerCounts.includes(count)
      ? localFilters.playerCounts.filter(c => c !== count)
      : [...localFilters.playerCounts, count].sort((a, b) => a - b);
    updateFilters({ playerCounts: newCounts });
  };

  const toggleMap = (map: string) => {
    const newMaps = localFilters.maps.includes(map)
      ? localFilters.maps.filter(m => m !== map)
      : [...localFilters.maps, map].sort();
    updateFilters({ maps: newMaps });
  };

  const toggleGameMode = (gameMode: string) => {
    const newGameModes = localFilters.gameModes.includes(gameMode)
      ? localFilters.gameModes.filter(gm => gm !== gameMode)
      : [...localFilters.gameModes, gameMode].sort();
    updateFilters({ gameModes: newGameModes });
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

      {/* Game Modes */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Game Modes
        </label>
        <div className="flex flex-wrap gap-2">
          {availableGameModes.map(gameMode => (
            <button
              key={gameMode}
              onClick={() => toggleGameMode(gameMode)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                localFilters.gameModes.includes(gameMode)
                  ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-200'
                  : 'bg-white/60 dark:bg-slate-700/60 backdrop-blur-sm border-zinc-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50/70 dark:hover:bg-slate-600/70'
              }`}
            >
              {gameMode}
            </button>
          ))}
        </div>
      </div>

      {/* Game Speed */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Game Speed
        </label>
        <select
          value={localFilters.gameSpeed || ''}
          onChange={(e) => updateFilters({ gameSpeed: e.target.value || undefined })}
          className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-slate-600 rounded-md bg-white/80 dark:bg-slate-700/70 backdrop-blur-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        >
          <option value="">All Speeds</option>
          {availableGameSpeeds.map(speed => (
            <option key={speed} value={speed}>{speed}</option>
          ))}
        </select>
      </div>

      {/* Expansion Toggles */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Game configuration
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Prelude</span>
            <button
              onClick={() => updateFilters({ 
                preludeOn: localFilters.preludeOn === undefined ? true : localFilters.preludeOn ? false : undefined 
              })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localFilters.preludeOn === true
                  ? 'bg-amber-500'
                  : localFilters.preludeOn === false
                    ? 'bg-red-500'
                    : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localFilters.preludeOn === true
                    ? 'translate-x-6'
                    : localFilters.preludeOn === false
                      ? 'translate-x-1'
                      : 'translate-x-3'
                }`}
              />
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Colonies</span>
            <button
              onClick={() => updateFilters({ 
                coloniesOn: localFilters.coloniesOn === undefined ? true : localFilters.coloniesOn ? false : undefined 
              })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localFilters.coloniesOn === true
                  ? 'bg-amber-500'
                  : localFilters.coloniesOn === false
                    ? 'bg-red-500'
                    : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localFilters.coloniesOn === true
                    ? 'translate-x-6'
                    : localFilters.coloniesOn === false
                      ? 'translate-x-1'
                      : 'translate-x-3'
                }`}
              />
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Draft</span>
            <button
              onClick={() => updateFilters({ 
                draftOn: localFilters.draftOn === undefined ? true : localFilters.draftOn ? false : undefined 
              })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localFilters.draftOn === true
                  ? 'bg-amber-500'
                  : localFilters.draftOn === false
                    ? 'bg-red-500'
                    : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  localFilters.draftOn === true
                    ? 'translate-x-6'
                    : localFilters.draftOn === false
                      ? 'translate-x-1'
                      : 'translate-x-3'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Active filters summary */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {localFilters.eloMin || localFilters.eloMax || localFilters.gameSpeed ||
           localFilters.preludeOn !== undefined || localFilters.coloniesOn !== undefined || localFilters.draftOn !== undefined ||
           localFilters.playerCounts.length !== availablePlayerCounts.length ||
           localFilters.maps.length !== availableMaps.length ||
           localFilters.gameModes.length !== availableGameModes.length
            ? 'Filters active'
            : 'No filters applied'
          }
        </div>
      </div>
    </div>
  );
}
