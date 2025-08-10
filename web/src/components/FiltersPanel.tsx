import { useState, useEffect, useRef } from 'react';
import { CorporationFilters } from '@/types/corporation';
import { Button } from '@/components/ui/button';

interface FiltersPanelProps {
  filters: CorporationFilters;
  onFiltersChange: (filters: CorporationFilters) => void;
  availablePlayerCounts: number[];
  availableMaps: string[];
  availableGameModes: string[];
  availableGameSpeeds: string[];
  availablePlayerNames: string[];
  eloRange: { min: number; max: number };
}

export function FiltersPanel({
  filters,
  onFiltersChange,
  availablePlayerCounts,
  availableMaps,
  availableGameModes,
  availableGameSpeeds,
  availablePlayerNames,
  eloRange,
}: FiltersPanelProps) {
  const [localFilters, setLocalFilters] = useState(filters);
  const [gameSpeedDropdownOpen, setGameSpeedDropdownOpen] = useState(false);
  const gameSpeedDropdownRef = useRef<HTMLDivElement>(null);
  const [playerSearchOpen, setPlayerSearchOpen] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const playerSearchRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gameSpeedDropdownRef.current && !gameSpeedDropdownRef.current.contains(event.target as Node)) {
        setGameSpeedDropdownOpen(false);
      }
      if (playerSearchRef.current && !playerSearchRef.current.contains(event.target as Node)) {
        setPlayerSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
      gameSpeeds: availableGameSpeeds,
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

  const toggleGameSpeed = (gameSpeed: string) => {
    const newGameSpeeds = localFilters.gameSpeeds.includes(gameSpeed)
      ? localFilters.gameSpeeds.filter(gs => gs !== gameSpeed)
      : [...localFilters.gameSpeeds, gameSpeed].sort();
    updateFilters({ gameSpeeds: newGameSpeeds });
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

      {/* Player Name Search */}
      <div className="space-y-3" ref={playerSearchRef}>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Player Name
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Search for a player..."
            value={playerSearchQuery}
            onChange={(e) => {
              setPlayerSearchQuery(e.target.value);
              setPlayerSearchOpen(e.target.value.length > 0);
            }}
            onFocus={() => setPlayerSearchOpen(playerSearchQuery.length > 0)}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-slate-600 rounded-md bg-white/80 dark:bg-slate-700/70 backdrop-blur-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          {localFilters.playerName && (
            <button
              onClick={() => {
                updateFilters({ playerName: undefined });
                setPlayerSearchQuery('');
                setPlayerSearchOpen(false);
              }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          
          {playerSearchOpen && playerSearchQuery.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-zinc-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-auto">
              <div className="p-2">
                {availablePlayerNames
                  .filter(name => name.toLowerCase().includes(playerSearchQuery.toLowerCase()))
                  .slice(0, 10) // Limit to 10 results
                  .map(playerName => (
                    <div
                      key={playerName}
                      onClick={() => {
                        updateFilters({ playerName });
                        setPlayerSearchQuery(playerName);
                        setPlayerSearchOpen(false);
                      }}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer text-sm text-slate-900 dark:text-slate-100"
                    >
                      {playerName}
                    </div>
                  ))}
                {availablePlayerNames.filter(name => name.toLowerCase().includes(playerSearchQuery.toLowerCase())).length === 0 && (
                  <div className="p-2 text-sm text-slate-500 dark:text-slate-400">
                    No players found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {localFilters.playerName && (
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Filtering by: <span className="font-medium text-amber-600 dark:text-amber-400">{localFilters.playerName}</span>
          </div>
        )}
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
      <div className="space-y-3" ref={gameSpeedDropdownRef}>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Game Speed
        </label>
        <div className="relative">
          <button
            onClick={() => setGameSpeedDropdownOpen(!gameSpeedDropdownOpen)}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-slate-600 rounded-md bg-white/80 dark:bg-slate-700/70 backdrop-blur-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent text-left flex items-center justify-between"
          >
            <span>
              {localFilters.gameSpeeds.length === availableGameSpeeds.length 
                ? 'All Speeds' 
                : localFilters.gameSpeeds.length === 0 
                  ? 'No speeds selected'
                  : `${localFilters.gameSpeeds.length} selected`
              }
            </span>
            <svg className={`w-4 h-4 transition-transform ${gameSpeedDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {gameSpeedDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-zinc-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-auto">
              <div className="p-2">
                <div className="flex items-center space-x-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    id="select-all-speeds"
                    checked={localFilters.gameSpeeds.length === availableGameSpeeds.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateFilters({ gameSpeeds: [...availableGameSpeeds] });
                      } else {
                        updateFilters({ gameSpeeds: [] });
                      }
                    }}
                    className="w-4 h-4 text-amber-600 bg-gray-100 border-gray-300 rounded focus:ring-amber-500 dark:focus:ring-amber-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <label htmlFor="select-all-speeds" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
                    (Select All)
                  </label>
                </div>
                {availableGameSpeeds.map(speed => (
                  <div key={speed} className="flex items-center space-x-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      id={`speed-${speed}`}
                      checked={localFilters.gameSpeeds.includes(speed)}
                      onChange={() => toggleGameSpeed(speed)}
                      className="w-4 h-4 text-amber-600 bg-gray-100 border-gray-300 rounded focus:ring-amber-500 dark:focus:ring-amber-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label htmlFor={`speed-${speed}`} className="text-sm text-slate-900 dark:text-slate-100 cursor-pointer">
                      {speed}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expansion Toggles */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Game Configuration
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
          {localFilters.eloMin || localFilters.eloMax ||
           localFilters.preludeOn !== undefined || localFilters.coloniesOn !== undefined || localFilters.draftOn !== undefined ||
           localFilters.playerCounts.length !== availablePlayerCounts.length ||
           localFilters.maps.length !== availableMaps.length ||
           localFilters.gameModes.length !== availableGameModes.length ||
           localFilters.gameSpeeds.length !== availableGameSpeeds.length
            ? 'Filters active'
            : 'No filters applied'
          }
        </div>
      </div>
    </div>
  );
}
