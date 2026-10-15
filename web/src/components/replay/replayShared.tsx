import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import startingPlayerImg from '/assets/starting player.png';
import temperatureImg from '/assets/temperature.png';
import oxygenImg from '/assets/oxygen.png';
import oceanImg from '/assets/ocean.png';
import type { PlayerSnapshotVM, ResourceKey, TagKey } from '@/lib/replay/viewModel';

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
// `name` and `title` are the display names, which are also BGA's tracker names.
export const RESOURCES: { key: ResourceKey; name: string; icon: string; label: string }[] = [
  { key: 'mc', name: 'M€', icon: 'mc', label: 'MC' },
  { key: 'steel', name: 'Steel', icon: 'steel', label: 'Steel' },
  { key: 'titanium', name: 'Titanium', icon: 'titanium', label: 'Titan' },
  { key: 'plants', name: 'Plant', icon: 'plant', label: 'Plants' },
  { key: 'energy', name: 'Energy', icon: 'energy', label: 'Energy' },
  { key: 'heat', name: 'Heat', icon: 'heat', label: 'Heat' },
];

export const TAG_ROWS: { key: TagKey; title: string; icon: string }[][] = [
  [
    { key: 'building', title: 'Building tag', icon: 'building' },
    { key: 'space', title: 'Space tag', icon: 'space' },
    { key: 'science', title: 'Science tag', icon: 'science' },
    { key: 'power', title: 'Energy tag', icon: 'power' },
    { key: 'earth', title: 'Earth tag', icon: 'earth' },
    { key: 'jovian', title: 'Jovian tag', icon: 'jovian' },
  ],
  [
    { key: 'city', title: 'City tag', icon: 'city' },
    { key: 'plant', title: 'Plant tag', icon: 'plant' },
    { key: 'microbe', title: 'Microbe tag', icon: 'microbe' },
    { key: 'animal', title: 'Animal tag', icon: 'animal' },
    { key: 'wild', title: 'Wild tag', icon: 'wild' },
    { key: 'event', title: 'Event tag', icon: 'event' },
  ],
];

export const TILE_COUNT_ROW: { key: keyof PlayerSnapshotVM['tileCounts']; icon: string; label: string }[] = [
  { key: 'cities', icon: 'city tile', label: 'Cities' },
  { key: 'greeneries', icon: 'greenery tile', label: 'Greeneries' },
  { key: 'total', icon: 'tile', label: 'Tiles' },
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

const RESOURCE_COLORS: Record<ResourceKey, string> = {
  mc: '#b8860b',
  steel: '#8b4513',
  titanium: '#2d2d2d',
  plants: '#2d6a1e',
  energy: '#6b21a8',
  heat: '#b91c1c',
};

function CellTooltip({ icon, label, sublabel, children }: { icon?: string; label: string; sublabel?: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const onMove = useCallback((e: React.MouseEvent) => setPos({ x: e.clientX, y: e.clientY }), []);
  const onLeave = useCallback(() => setPos(null), []);
  return (
    <>
      <div onMouseEnter={onMove} onMouseMove={onMove} onMouseLeave={onLeave}>
        {children}
      </div>
      {pos && createPortal(
        <div className="fixed z-[9999] pointer-events-none" style={{ left: pos.x + 14, top: pos.y + 14 }}>
          <div className="glass-panel rounded-lg shadow-xl px-3 py-2 flex items-center gap-2.5">
            {icon && (
              <img src={icon} alt="" className="w-8 h-8 object-contain flex-shrink-0 drop-shadow-md" />
            )}
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white whitespace-nowrap">{label}</span>
              {sublabel && <span className="text-xs text-slate-400 whitespace-nowrap">{sublabel}</span>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function ResourceCell({ icon, value, prodValue, title, resourceKey, name }: { icon?: string; value: number; prodValue: number; title: string; resourceKey: ResourceKey; name: string }) {
  const bg = RESOURCE_COLORS[resourceKey] ?? '#334155';
  return (
    <CellTooltip icon={icon} label={name} sublabel={`${value} (production ${prodValue >= 0 ? '+' : ''}${prodValue})`}>
    <div className="flex flex-col items-center w-14 rounded-lg overflow-hidden">
      {/* Icon on colored background with overlaid count */}
      <div className="relative w-full flex items-center justify-center h-10" style={{ background: bg }}>
        {icon ? (
          <img src={icon} alt={title} className="w-8 h-8 object-contain drop-shadow-md" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-white/20" />
        )}
        <span
          className="absolute inset-0 flex items-center justify-center text-base font-bold text-white pointer-events-none"
          style={{ textShadow: '0 0 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85), 1px 1px 2px rgba(0,0,0,0.95)' }}
        >
          {value}
        </span>
      </div>
      {/* Production */}
      <div className="w-full text-center py-0.5" style={{ background: 'rgba(255,255,255,0.12)' }}>
        <span
          className={`text-base font-bold ${prodValue >= 0 ? 'text-green-400' : 'text-red-400'}`}
          style={{ textShadow: prodValue !== 0 ? (prodValue > 0 ? '0 0 6px rgba(74,222,128,0.4)' : '0 0 6px rgba(248,113,113,0.4)') : undefined }}
        >
          {prodValue >= 0 ? `+${prodValue}` : prodValue}
        </span>
      </div>
    </div>
    </CellTooltip>
  );
}

const TAG_COLORS: Record<string, string> = {
  'Building tag': '#6b4c2a',
  'Space tag': '#1a1a2e',
  'Science tag': '#f5f5f5',
  'Energy tag': '#6b21a8',
  'Earth tag': '#1e40af',
  'Jovian tag': '#92400e',
  'City tag': '#374151',
  'Plant tag': '#166534',
  'Microbe tag': '#065f46',
  'Animal tag': '#713f12',
  'Wild tag': '#6b7280',
  'Event tag': '#991b1b',
};

function TagCell({ icon, value, title, large }: { icon?: string; value: number; title: string; large?: boolean }) {
  const bg = TAG_COLORS[title] ?? '#334155';
  // Normalize titles like "Count of Science tags" → "Science tag"
  const cleanTitle = title.replace(/^Count of /i, '').replace(/tags$/i, 'tag').replace(/^(.)/, c => c.toUpperCase());
  return (
    <CellTooltip icon={icon} label={cleanTitle} sublabel={`Count: ${value}`}>
    <div className="flex items-center justify-center w-12">
      <div
        className="relative flex items-center justify-center w-11 h-11 rounded-full"
        style={{ background: bg, boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.4)' }}
      >
        {icon ? (
          <img src={icon} alt={title} className={`${large ? 'w-9 h-9' : 'w-8 h-8'} object-contain drop-shadow-md`} />
        ) : (
          <div className={`${large ? 'w-9 h-9' : 'w-8 h-8'} rounded-full bg-white/20`} />
        )}
        <span
          className="absolute inset-0 flex items-center justify-center text-base font-bold text-white pointer-events-none"
          style={{ textShadow: '0 0 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85), 1px 1px 2px rgba(0,0,0,0.95)' }}
        >
          {value}
        </span>
      </div>
    </div>
    </CellTooltip>
  );
}

export function PlayerTrackers({ player, inline }: { player: Pick<PlayerSnapshotVM, 'resources' | 'production' | 'tags' | 'tileCounts'>; inline?: boolean }) {
  const { resources, production, tags, tileCounts } = player;
  const [showResources, setShowResources] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [resourcesZoom, setResourcesZoom] = useState(1);
  const [tagsZoom, setTagsZoom] = useState(1);

  if (inline) {
    const toggleBtn = "p-1 rounded transition-colors";
    const activeToggle = "text-amber-400 hover:text-amber-300";
    const inactiveToggle = "text-slate-500 hover:text-slate-300";
    // Render as separate fragments so parent flex-wrap controls the flow
    return (
      <>
        {/* Toolbar — always full width, sits above the rows */}
        <div className="basis-full flex items-center gap-3 text-xs text-slate-500 mb-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowResources(v => !v)}
              className={`${toggleBtn} ${showResources ? activeToggle : inactiveToggle}`}
              title={showResources ? 'Hide resources' : 'Show resources'}
            >
              {showResources ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <span>Resources</span>
            {showResources && (
              <input type="range" min={0.6} max={1.4} step={0.05} value={resourcesZoom} onChange={e => setResourcesZoom(Number(e.target.value))} onMouseUp={e => (e.target as HTMLInputElement).blur()} className="w-16 h-1.5 accent-amber-500" title="Resource size" />
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowTags(v => !v)}
              className={`${toggleBtn} ${showTags ? activeToggle : inactiveToggle}`}
              title={showTags ? 'Hide tags' : 'Show tags'}
            >
              {showTags ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <span>Tags</span>
            {showTags && (
              <input type="range" min={0.6} max={1.4} step={0.05} value={tagsZoom} onChange={e => setTagsZoom(Number(e.target.value))} onMouseUp={e => (e.target as HTMLInputElement).blur()} className="w-16 h-1.5 accent-amber-500" title="Tag size" />
            )}
          </div>
        </div>
        <div className="basis-full h-0" />
        {/* Resources as one block */}
        {showResources && (
          <div className="flex gap-1 flex-shrink-0" style={{ zoom: resourcesZoom }}>
            {RESOURCES.map(r => (
              <ResourceCell key={r.key} resourceKey={r.key} name={r.name} icon={getIcon(resourceIcons, r.icon)} value={resources[r.key]} prodValue={production[r.key]} title={`${r.label}: ${resources[r.key]} (prod: ${production[r.key]})`} />
            ))}
          </div>
        )}
        {/* Force tags onto a new row below resources */}
        {showResources && showTags && <div className="basis-full h-0" />}
        {/* Tags can wrap against each other */}
        {showTags && (
          <div className="flex gap-1 flex-wrap" style={{ zoom: tagsZoom }}>
            {TAG_ROWS[0].map(t => (
              <TagCell key={t.key} icon={getIcon(tagIcons, t.icon)} value={tags[t.key]} title={t.title} />
            ))}
            {TAG_ROWS[1].map(t => (
              <TagCell key={t.key} icon={getIcon(tagIcons, t.icon)} value={tags[t.key]} title={t.title} />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="border-t border-white/10 px-3 py-3 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {RESOURCES.map(r => (
          <ResourceCell key={r.key} resourceKey={r.key} name={r.name} icon={getIcon(resourceIcons, r.icon)} value={resources[r.key]} prodValue={production[r.key]} title={`${r.label}: ${resources[r.key]} (prod: ${production[r.key]})`} />
        ))}
      </div>
      <div className="border-t border-white/10 !mt-3 !mb-2" />
      <div className="flex flex-wrap gap-1">
        {TAG_ROWS[0].map(t => (
          <TagCell key={t.key} icon={getIcon(tagIcons, t.icon)} value={tags[t.key]} title={t.title} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {TAG_ROWS[1].map(t => (
          <TagCell key={t.key} icon={getIcon(tagIcons, t.icon)} value={tags[t.key]} title={t.title} />
        ))}
      </div>

      {/* Tiles */}
      <div className="flex flex-wrap gap-1">
        {TILE_COUNT_ROW.map(t => (
          <TagCell key={t.key} icon={getIcon(tileIcons, t.icon)} value={tileCounts[t.key]} title={t.label} large />
        ))}
      </div>
    </div>
  );
}
