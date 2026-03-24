import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import type { GameLogMove, GameState } from '@/types/gamelog';
import startingPlayerImg from '/assets/starting player.png';
import temperatureImg from '/assets/temperature.png';
import oxygenImg from '/assets/oxygen.png';
import oceanImg from '/assets/ocean.png';

// --- Icon loading ---
const resourceIcons = import.meta.glob('../../../assets/resources/*.png', { eager: true }) as Record<string, { default: string }>;
const tagIcons = import.meta.glob('../../../assets/tags/*.png', { eager: true }) as Record<string, { default: string }>;
const tileIcons = import.meta.glob('../../../assets/tiles/*.png', { eager: true }) as Record<string, { default: string }>;
const cubeIcons = import.meta.glob('../../../assets/cubes/*.png', { eager: true }) as Record<string, { default: string }>;

function getIcon(icons: Record<string, { default: string }>, name: string): string | undefined {
  const entry = Object.entries(icons).find(([key]) =>
    key.replace(/^.*[\\/]/, '').toLowerCase() === `${name}.png`
  );
  return entry?.[1].default;
}

function getCubeImage(hexColor: string): string | undefined {
  // hexColor like "#ff0000" -> "ff0000"
  const slug = hexColor.replace('#', '').toLowerCase();
  return getIcon(cubeIcons, slug);
}

// --- Resource/production/tag definitions ---
const RESOURCES = [
  { key: 'M€', prodKey: 'M€ Production', icon: 'mc', label: 'MC' },
  { key: 'Steel', prodKey: 'Steel Production', icon: 'steel', label: 'Steel' },
  { key: 'Titanium', prodKey: 'Titanium Production', icon: 'titanium', label: 'Titan' },
  { key: 'Plant', prodKey: 'Plant Production', icon: 'plant', label: 'Plants' },
  { key: 'Energy', prodKey: 'Energy Production', icon: 'energy', label: 'Energy' },
  { key: 'Heat', prodKey: 'Heat Production', icon: 'heat', label: 'Heat' },
];

const TAG_ROWS = [
  [
    { key: 'Building tag', altKey: 'Count of Building tags', icon: 'building' },
    { key: 'Space tag', altKey: 'Count of Space tags', icon: 'space' },
    { key: 'Science tag', altKey: 'Count of Science tags', icon: 'science' },
    { key: 'Energy tag', altKey: 'Count of Power tags', icon: 'power' },
    { key: 'Earth tag', altKey: 'Count of Earth tags', icon: 'earth' },
    { key: 'Jovian tag', altKey: 'Count of Jovian tags', icon: 'jovian' },
  ],
  [
    { key: 'City tag', altKey: 'Count of City tags', icon: 'city' },
    { key: 'Plant tag', altKey: 'Count of Plant tags', icon: 'plant' },
    { key: 'Microbe tag', altKey: 'Count of Microbe tags', icon: 'microbe' },
    { key: 'Animal tag', altKey: 'Count of Animal tags', icon: 'animal' },
    { key: 'Wild tag', altKey: 'Count of Wild tags', icon: 'wild' },
    { key: 'Event tag', altKey: 'Count of played Events cards', icon: 'event' },
  ],
  [
    { key: 'City', icon: 'city tile', iconSource: 'tile' as const, label: 'Cities' },
    { key: 'Forest', icon: 'greenery tile', iconSource: 'tile' as const, label: 'Greeneries' },
    { key: 'Land', icon: 'tile', iconSource: 'tile' as const, label: 'Tiles' },
  ],
];

function Badge({ label, value, icon, hideLabel, large }: { label: string; value: string | number | null | undefined; icon?: string; hideLabel?: boolean; large?: boolean }) {
  if (value == null) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 ${large ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'}`}>
      {icon && <img src={icon} alt={label} className={`${large ? 'w-8 h-8' : 'w-6 h-6'} object-contain`} />}
      {!hideLabel && <>{label}:</>} <span className="font-bold">{value}</span>
    </span>
  );
}

function TrackerCell({ icon, value, subValue, title }: { icon?: string; value: number; subValue?: number; title: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={title}>
      {icon ? (
        <img src={icon} alt={title} className="w-5 h-5 object-contain" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-slate-300 dark:bg-slate-600" />
      )}
      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-none">{value}</span>
      {subValue !== undefined && (
        <span className={`text-[10px] font-medium leading-none ${subValue >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {subValue >= 0 ? `+${subValue}` : subValue}
        </span>
      )}
    </div>
  );
}

function getTracker(trackers: Record<string, number>, key: string, altKey?: string): number {
  return trackers[key] ?? (altKey ? trackers[altKey] ?? 0 : 0);
}

function PlayerTrackers({ trackers, tileCounts }: { trackers: Record<string, number>; tileCounts?: { cities: number; greeneries: number; total: number } }) {
  return (
    <div className="border-t border-slate-200 dark:border-slate-700 px-2 py-2 space-y-2">
      {/* Resources + Production */}
      <div className="flex justify-between gap-1">
        {RESOURCES.map(r => (
          <TrackerCell
            key={r.key}
            icon={getIcon(resourceIcons, r.icon)}
            value={trackers[r.key] ?? 0}
            subValue={trackers[r.prodKey] ?? 0}
            title={`${r.label}: ${trackers[r.key] ?? 0} (prod: ${trackers[r.prodKey] ?? 0})`}
          />
        ))}
      </div>
      {/* Tags & Tiles */}
      {TAG_ROWS.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-2">
          {row.map(t => {
            const icons = 'iconSource' in t && t.iconSource === 'tile' ? tileIcons : tagIcons;
            const altKey = 'altKey' in t ? t.altKey : undefined;
            let val = getTracker(trackers, t.key, altKey);
            // Fall back to computed tile counts when tracker keys are missing
            if (val === 0 && tileCounts && 'iconSource' in t) {
              if (t.key === 'City') val = tileCounts.cities;
              else if (t.key === 'Forest') val = tileCounts.greeneries;
              else if (t.key === 'Land') val = tileCounts.total;
            }
            return (
              <TrackerCell
                key={t.key}
                icon={getIcon(icons, t.icon)}
                value={val}
                title={`${'label' in t ? t.label : t.key}: ${val}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface MovePanelProps {
  move: GameLogMove | undefined;
  gameState: GameState | undefined;
  playerColors: Record<string, string>;
  playerNames: Record<string, string>;
  playerCorporations: Record<string, string>;
  playerElos?: Record<string, number | null>;
  playerTileCounts?: Record<string, { cities: number; greeneries: number; total: number }>;
  onOpenTableau?: (playerId: string) => void;
  onOpenDiscardPile?: () => void;
}

export function MovePanel({ move, gameState, playerColors, playerNames, playerCorporations, playerElos, playerTileCounts, onOpenTableau, onOpenDiscardPile }: MovePanelProps) {
  const cardImage = move?.card_played
    ? getCardImage(move.card_played) ?? getCardPlaceholderImage()
    : null;

  return (
    <div className="space-y-3">
      {/* Global parameters */}
      {gameState && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex flex-wrap gap-2">
            <Badge label="Gen" value={gameState.generation} large />
            <Badge label="Temp" value={gameState.temperature != null ? `${gameState.temperature}\u00B0C` : null} icon={temperatureImg} hideLabel large />
            <Badge label="O2" value={gameState.oxygen != null ? `${gameState.oxygen}%` : null} icon={oxygenImg} hideLabel large />
            <Badge label="Oceans" value={gameState.oceans != null ? `${gameState.oceans}/9` : null} icon={oceanImg} hideLabel large />
            <Badge label="Draw" value={gameState.draw_pile ?? 0} icon={getCardPlaceholderImage()} />
            {onOpenDiscardPile ? (
              <button onClick={onOpenDiscardPile} className="hover:opacity-80 transition-opacity">
                <Badge label="Discard" value={gameState.discard_pile ?? 0} icon={getCardPlaceholderImage()} />
              </button>
            ) : (
              <Badge label="Discard" value={gameState.discard_pile ?? 0} icon={getCardPlaceholderImage()} />
            )}
          </div>
        </div>
      )}

      {/* Player scoreboards */}
      {gameState?.player_vp && Object.keys(gameState.player_vp).length > 0 &&
        Object.entries(gameState.player_vp).map(([pid, vp]) => {
          const d = vp.total_details;
          return (
            <div
              key={pid}
              className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ backgroundColor: `${playerColors[pid]}18` }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getCubeImage(playerColors[pid]) ? (
                    <img src={getCubeImage(playerColors[pid])!} alt="" className="w-6 h-6 flex-shrink-0" />
                  ) : (
                    <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: playerColors[pid] }} />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {playerNames[pid] ?? pid}
                        {playerElos?.[pid] != null && (
                          <span className="font-normal text-xs text-slate-400 dark:text-slate-500 ml-1">({playerElos[pid]})</span>
                        )}
                      </span>
                      {gameState?.starting_player === pid && (
                        <img src={startingPlayerImg} alt="Starting player" className="w-7 h-7 flex-shrink-0" title="Starting player this generation" />
                      )}
                      {onOpenTableau && (
                        <button
                          onClick={() => onOpenTableau(pid)}
                          className="rounded hover:opacity-80 transition-opacity flex-shrink-0"
                          title="View cards"
                        >
                          <img src={getCardPlaceholderImage()} alt="View cards" className="w-5 h-7 object-cover rounded-sm" />
                        </button>
                      )}
                    </div>
                    {playerCorporations[pid] && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 -mt-0.5">{playerCorporations[pid]}</div>
                    )}
                  </div>
                </div>
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {vp.total ?? '?'} <span className="text-xs font-medium text-slate-500 dark:text-slate-400">VP</span>
                </span>
              </div>
              {d && (
                <div className="grid grid-cols-3 gap-px bg-slate-200 dark:bg-slate-700 border-t border-slate-200 dark:border-slate-700">
                  {([
                    ['TR', d.tr],
                    ['Awards', d.awards],
                    ['Miles', d.milestones],
                    ['Cities', d.cities],
                    ['Green', d.greeneries],
                    ['Cards', d.cards],
                  ] as const).map(([label, val]) => (
                    <div key={label} className="bg-white dark:bg-slate-800 px-2 py-1.5 text-center">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{val ?? 0}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</div>
                    </div>
                  ))}
                </div>
              )}
              {gameState?.player_trackers?.[pid] && (
                <PlayerTrackers trackers={gameState.player_trackers[pid]} tileCounts={playerTileCounts?.[pid]} />
              )}
            </div>
          );
        })
      }

      {/* Current move */}
      {move && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-2">
            {getCubeImage(playerColors[move.player_id]) ? (
              <img src={getCubeImage(playerColors[move.player_id])!} alt="" className="w-6 h-6 flex-shrink-0" />
            ) : (
              <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: playerColors[move.player_id] }} />
            )}
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {move.player_name}
            </span>
            <span className="text-xs text-slate-400">{move.action_type}</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">{move.description}</p>
          {move.tile_placed && move.tile_location && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Placed {move.tile_placed} at {move.tile_location}
            </p>
          )}
        </div>
      )}

      {move?.card_played && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {move.card_played}
            {move.card_cost != null && (
              <span className="text-slate-400 ml-1">({move.card_cost} MC)</span>
            )}
          </p>
          <img
            src={cardImage!}
            alt={move.card_played}
            className="w-64 rounded-lg shadow"
          />
        </div>
      )}
    </div>
  );
}
