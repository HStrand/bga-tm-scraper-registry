import startingPlayerImg from '/assets/starting player.png';
import temperatureImg from '/assets/temperature.png';
import oxygenImg from '/assets/oxygen.png';
import oceanImg from '/assets/ocean.png';

// --- Icon loading ---
export const resourceIcons = import.meta.glob('../../../assets/resources/*.png', { eager: true }) as Record<string, { default: string }>;
export const tagIcons = import.meta.glob('../../../assets/tags/*.png', { eager: true }) as Record<string, { default: string }>;
export const tileIcons = import.meta.glob('../../../assets/tiles/*.png', { eager: true }) as Record<string, { default: string }>;
export const cubeIcons = import.meta.glob('../../../assets/cubes/*.png', { eager: true }) as Record<string, { default: string }>;

export { startingPlayerImg, temperatureImg, oxygenImg, oceanImg };

export function getIcon(icons: Record<string, { default: string }>, name: string): string | undefined {
  const entry = Object.entries(icons).find(([key]) =>
    key.replace(/^.*[\\/]/, '').toLowerCase() === `${name}.png`
  );
  return entry?.[1].default;
}

export function getCubeImage(hexColor: string): string | undefined {
  const slug = hexColor.replace('#', '').toLowerCase();
  return getIcon(cubeIcons, slug);
}

// --- Resource/production/tag definitions ---
export const RESOURCES = [
  { key: 'M€', prodKey: 'M€ Production', icon: 'mc', label: 'MC' },
  { key: 'Steel', prodKey: 'Steel Production', icon: 'steel', label: 'Steel' },
  { key: 'Titanium', prodKey: 'Titanium Production', icon: 'titanium', label: 'Titan' },
  { key: 'Plant', prodKey: 'Plant Production', icon: 'plant', label: 'Plants' },
  { key: 'Energy', prodKey: 'Energy Production', icon: 'energy', label: 'Energy' },
  { key: 'Heat', prodKey: 'Heat Production', icon: 'heat', label: 'Heat' },
];

export const TAG_ROWS = [
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

// --- Shared components ---

export function Badge({ label, value, icon, hideLabel, large }: { label: string; value: string | number | null | undefined; icon?: string; hideLabel?: boolean; large?: boolean }) {
  if (value == null) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium text-slate-300 ${large ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'}`} style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%), rgba(15,20,35,0.7)', border: '1px solid rgba(148,163,184,0.1)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.3)' }}>
      {icon && <img src={icon} alt={label} className={`${large ? 'w-8 h-8' : 'w-6 h-6'} object-contain`} />}
      {!hideLabel && <>{label}:</>} <span className="font-bold text-white glow-white">{value}</span>
    </span>
  );
}

export function TrackerCell({ icon, value, subValue, title }: { icon?: string; value: number; subValue?: number; title: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={title}>
      {icon ? (
        <img src={icon} alt={title} className="w-5 h-5 object-contain" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-slate-600" />
      )}
      <span className="text-xs font-bold text-slate-200 leading-none">{value}</span>
      {subValue !== undefined && (
        <span className={`text-[10px] font-medium leading-none ${subValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {subValue >= 0 ? `+${subValue}` : subValue}
        </span>
      )}
    </div>
  );
}

function getTracker(trackers: Record<string, number>, key: string, altKey?: string): number {
  return trackers[key] ?? (altKey ? trackers[altKey] ?? 0 : 0);
}

const RESOURCE_COLORS: Record<string, string> = {
  'M€': '#b8860b',
  'Steel': '#8b4513',
  'Titanium': '#2d2d2d',
  'Plant': '#2d6a1e',
  'Energy': '#6b21a8',
  'Heat': '#b91c1c',
};

function ResourceCell({ icon, value, prodValue, title, resourceKey }: { icon?: string; value: number; prodValue: number; title: string; resourceKey: string }) {
  const bg = RESOURCE_COLORS[resourceKey] ?? '#334155';
  return (
    <div className="flex flex-col items-center w-14 rounded-lg overflow-hidden" title={title}>
      {/* Icon on colored background */}
      <div className="w-full flex items-center justify-center py-1.5" style={{ background: bg }}>
        {icon ? (
          <img src={icon} alt={title} className="w-7 h-7 object-contain drop-shadow-md" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/20" />
        )}
      </div>
      {/* Count */}
      <div className="w-full text-center py-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <span className="text-base font-bold text-white">{value}</span>
      </div>
      {/* Production */}
      <div className="w-full text-center py-0.5" style={{ background: 'rgba(0,0,0,0.2)' }}>
        <span
          className={`text-base font-bold ${prodValue >= 0 ? 'text-green-400' : 'text-red-400'}`}
          style={{ textShadow: prodValue !== 0 ? (prodValue > 0 ? '0 0 6px rgba(74,222,128,0.4)' : '0 0 6px rgba(248,113,113,0.4)') : undefined }}
        >
          {prodValue >= 0 ? `+${prodValue}` : prodValue}
        </span>
      </div>
    </div>
  );
}

function TagCell({ icon, value, title, large }: { icon?: string; value: number; title: string; large?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center rounded-lg ${large ? 'w-14 py-1.5' : 'w-12 py-1'}`}
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
      title={title}
    >
      {icon ? (
        <img src={icon} alt={title} className={`${large ? 'w-8 h-8' : 'w-6 h-6'} object-contain`} />
      ) : (
        <div className={`${large ? 'w-8 h-8' : 'w-6 h-6'} rounded-full bg-slate-600`} />
      )}
      <span className="text-sm font-bold text-slate-200 leading-none mt-0.5">{value}</span>
    </div>
  );
}

export function PlayerTrackers({ trackers, tileCounts }: { trackers: Record<string, number>; tileCounts?: { cities: number; greeneries: number; total: number } }) {
  return (
    <div className="border-t border-white/10 px-3 py-3 space-y-1.5">
      {/* Resources — inline flex, fixed-width cells */}
      <div className="flex flex-wrap gap-1">
        {RESOURCES.map(r => (
          <ResourceCell
            key={r.key}
            resourceKey={r.key}
            icon={getIcon(resourceIcons, r.icon)}
            value={trackers[r.key] ?? 0}
            prodValue={trackers[r.prodKey] ?? 0}
            title={`${r.label}: ${trackers[r.key] ?? 0} (prod: ${trackers[r.prodKey] ?? 0})`}
          />
        ))}
      </div>

      {/* Tags — inline flex rows */}
      <div className="flex flex-wrap gap-1">
        {TAG_ROWS[0].map(t => {
          const altKey = 'altKey' in t ? t.altKey : undefined;
          return (
            <TagCell
              key={t.key}
              icon={getIcon(tagIcons, t.icon)}
              value={getTracker(trackers, t.key, altKey)}
              title={t.key}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1">
        {TAG_ROWS[1].map(t => {
          const altKey = 'altKey' in t ? t.altKey : undefined;
          return (
            <TagCell
              key={t.key}
              icon={getIcon(tagIcons, t.icon)}
              value={getTracker(trackers, t.key, altKey)}
              title={t.key}
            />
          );
        })}
      </div>

      {/* Tiles */}
      <div className="flex flex-wrap gap-1">
        {TAG_ROWS[2].map(t => {
          let val = getTracker(trackers, t.key);
          if (val === 0 && tileCounts) {
            if (t.key === 'City') val = tileCounts.cities;
            else if (t.key === 'Forest') val = tileCounts.greeneries;
            else if (t.key === 'Land') val = tileCounts.total;
          }
          return (
            <TagCell
              key={t.key}
              icon={getIcon(tileIcons, t.icon)}
              value={val}
              title={'label' in t ? t.label : t.key}
              large
            />
          );
        })}
      </div>
    </div>
  );
}
