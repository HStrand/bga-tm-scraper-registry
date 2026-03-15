import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/BackButton';
import { getCombinationBaselinesCached, getCombinationCombosCached } from '@/lib/combinationCache';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import { getCorpImage, getPlaceholderImage as getCorpPlaceholderImage, nameToSlug as corpNameToSlug } from '@/lib/corp';
import { getPreludeImage, getPreludePlaceholderImage } from '@/lib/prelude';
import {
  CombinationBaselines,
  CombinationBaselineRow,
  CombinationComboRow,
  ComboType,
} from '@/types/combination';

type ItemKind = 'corp' | 'prelude' | 'card';

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

function kindLabel(kind: ItemKind): string {
  return kind === 'corp' ? 'Corporation' : kind === 'prelude' ? 'Prelude' : 'Project Card';
}

// Which combo types involve this item kind, and in which slot?
interface ComboSource {
  comboType: ComboType;
  slot: 'first' | 'second' | 'either';
  partnerKind: ItemKind;
  partnerLabel: string;
}

function getComboSources(kind: ItemKind): ComboSource[] {
  switch (kind) {
    case 'corp': return [
      { comboType: 'corp-prelude', slot: 'first', partnerKind: 'prelude', partnerLabel: 'Preludes' },
      { comboType: 'corp-card', slot: 'first', partnerKind: 'card', partnerLabel: 'Cards' },
    ];
    case 'prelude': return [
      { comboType: 'corp-prelude', slot: 'second', partnerKind: 'corp', partnerLabel: 'Corporations' },
      { comboType: 'prelude-prelude', slot: 'either', partnerKind: 'prelude', partnerLabel: 'Other Preludes' },
      { comboType: 'prelude-card', slot: 'first', partnerKind: 'card', partnerLabel: 'Cards' },
    ];
    case 'card': return [
      { comboType: 'corp-card', slot: 'second', partnerKind: 'corp', partnerLabel: 'Corporations' },
      { comboType: 'prelude-card', slot: 'second', partnerKind: 'prelude', partnerLabel: 'Preludes' },
      { comboType: 'card-card', slot: 'either', partnerKind: 'card', partnerLabel: 'Other Cards' },
    ];
  }
}

interface PartnerRow {
  partnerName: string;
  partnerKind: ItemKind;
  gameCount: number;
  avgEloChange: number;
  winRate: number;
  lift: number;
  partnerBaseline: CombinationBaselineRow | undefined;
}

function extractPartners(
  combos: CombinationComboRow[],
  itemName: string,
  source: ComboSource,
  baselineMap: Map<string, CombinationBaselineRow>,
  itemBaseline: CombinationBaselineRow | undefined,
): PartnerRow[] {
  const results: PartnerRow[] = [];
  for (const combo of combos) {
    let partnerName: string | null = null;
    if (source.slot === 'either') {
      if (combo.name1 === itemName) partnerName = combo.name2;
      else if (combo.name2 === itemName) partnerName = combo.name1;
    } else if (source.slot === 'first' && combo.name1 === itemName) {
      partnerName = combo.name2;
    } else if (source.slot === 'second' && combo.name2 === itemName) {
      partnerName = combo.name1;
    }
    if (!partnerName) continue;

    const partnerBaseline = baselineMap.get(partnerName);
    const lift = itemBaseline
      ? combo.avgEloChange - (itemBaseline.avgEloChange + (partnerBaseline?.avgEloChange ?? 0))
      : combo.avgEloChange;

    results.push({
      partnerName,
      partnerKind: source.partnerKind,
      gameCount: combo.gameCount,
      avgEloChange: combo.avgEloChange,
      winRate: combo.winRate,
      lift,
      partnerBaseline,
    });
  }
  return results.sort((a, b) => b.lift - a.lift);
}

function PartnerCard({ partner, rank, best }: { partner: PartnerRow; rank: number; best: boolean }) {
  const liftColor = partner.lift > 0
    ? 'text-green-600 dark:text-green-400'
    : partner.lift < 0
      ? 'text-red-500 dark:text-red-400'
      : 'text-slate-500';

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700">
      <div className="relative flex-shrink-0">
        <img
          src={getItemImage(partner.partnerName, partner.partnerKind)}
          alt={partner.partnerName}
          className="w-12 h-12 rounded-lg object-cover"
          onError={e => { (e.target as HTMLImageElement).src = getItemPlaceholder(partner.partnerKind); }}
        />
        <div className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${best ? 'bg-green-500' : 'bg-red-500'}`}>
          {rank}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{partner.partnerName}</div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className={`text-xs font-bold ${liftColor}`}>
            {partner.lift > 0 ? '+' : ''}{partner.lift.toFixed(2)} lift
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {partner.gameCount.toLocaleString()} games
          </span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-bold ${partner.avgEloChange > 0 ? 'text-green-600 dark:text-green-400' : partner.avgEloChange < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-500'}`}>
          {partner.avgEloChange > 0 ? '+' : ''}{partner.avgEloChange.toFixed(2)}
        </div>
        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">combo elo</div>
      </div>
    </div>
  );
}

function SynergyBarRow({ partner, maxAbsLift }: { partner: PartnerRow; maxAbsLift: number }) {
  const isPositive = partner.lift >= 0;
  const pct = maxAbsLift > 0 ? (Math.abs(partner.lift) / maxAbsLift) * 100 : 0;
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);
  const nameRef = useRef<HTMLDivElement>(null);

  const baselineText = partner.partnerBaseline
    ? `${partner.partnerBaseline.avgEloChange > 0 ? '+' : ''}${partner.partnerBaseline.avgEloChange.toFixed(2)}`
    : null;

  const showTooltip = () => {
    if (!nameRef.current) return;
    const rect = nameRef.current.getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8 });
  };

  return (
    <div className="group flex items-center gap-3 py-1 hover:bg-slate-50 dark:hover:bg-slate-700/30 rounded-lg px-2 -mx-2 transition-colors">
      {/* Image + Name (always on the left) */}
      <div
        ref={nameRef}
        className="w-44 flex-shrink-0 flex items-center gap-2 cursor-default"
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltip(null)}
      >
        <img
          src={getItemImage(partner.partnerName, partner.partnerKind)}
          alt=""
          className="w-7 h-7 rounded-md object-cover flex-shrink-0"
          onError={e => { (e.target as HTMLImageElement).src = getItemPlaceholder(partner.partnerKind); }}
        />
        <span className="text-sm text-slate-700 dark:text-slate-200 font-medium truncate">
          {partner.partnerName}
          {baselineText && (
            <span className="text-slate-400 dark:text-slate-500 font-normal">
              {' '}({baselineText})
            </span>
          )}
        </span>
      </div>

      {/* Tooltip */}
      {tooltip && createPortal(
        <div
          className="fixed z-50 pointer-events-none"
          style={{ bottom: `calc(100vh - ${tooltip.y}px)`, left: tooltip.x, transform: 'translateX(-50%)' }}
        >
          <div className="relative max-w-xs">
            <div className="bg-slate-800 dark:bg-slate-700 text-white text-xs leading-relaxed rounded-lg px-3.5 py-2.5 shadow-xl ring-1 ring-black/10 whitespace-nowrap">
              {partner.partnerName}
              {baselineText && (
                <span className="text-slate-300"> ({baselineText})</span>
              )}
            </div>
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-slate-800 dark:bg-slate-700 ring-1 ring-black/5" />
          </div>
        </div>,
        document.body
      )}

      {/* Bar */}
      <div className="flex-1 flex items-center min-w-0">
        <div
          className={`h-6 rounded-full flex items-center min-w-[2.5rem] transition-all duration-300 shadow-sm ${
            isPositive
              ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600 justify-end pr-2'
              : 'bg-gradient-to-r from-red-400 to-red-500 dark:from-red-500 dark:to-red-600 justify-end pr-2'
          }`}
          style={{ width: `${Math.max(pct, 10)}%` }}
        >
          <span className="text-[11px] font-bold text-white drop-shadow-sm whitespace-nowrap">
            {isPositive ? '+' : ''}{partner.lift.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Games count */}
      <div className="w-16 flex-shrink-0 text-right">
        <span className="text-xs text-slate-400 dark:text-slate-500">{partner.gameCount.toLocaleString()}</span>
      </div>
    </div>
  );
}

function SynergySection({ label, partners, partnerKind }: { label: string; partners: PartnerRow[]; partnerKind: ItemKind }) {
  if (partners.length === 0) return null;

  const top5 = partners.slice(0, 5);
  const bottom5 = partners.slice(-5).reverse();

  // Chart: top 10 + bottom 10, deduped
  const chartPartners = useMemo(() => {
    const items = [...partners.slice(0, 10), ...partners.slice(-10)];
    const seen = new Set<string>();
    return items.filter(p => {
      if (seen.has(p.partnerName)) return false;
      seen.add(p.partnerName);
      return true;
    });
  }, [partners]);

  const maxAbsLift = useMemo(() => Math.max(0.01, ...chartPartners.map(p => Math.abs(p.lift))), [chartPartners]);

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{label}</h3>

      {/* Diverging bar chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Synergy with {label}
          </h4>
          <span className="text-xs text-slate-400 dark:text-slate-500">Elo lift = combo Elo - sum of baselines</span>
        </div>

        <div className="space-y-0.5">
          {chartPartners.map(p => (
            <SynergyBarRow key={p.partnerName} partner={p} maxAbsLift={maxAbsLift} />
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 px-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-emerald-400 to-emerald-500" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Synergy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-red-400 to-red-500" />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Anti-synergy</span>
          </div>
        </div>
      </div>

      {/* Top / Bottom cards side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 mb-3">
            Best Synergies
          </h4>
          <div className="space-y-2">
            {top5.map((p, i) => (
              <PartnerCard key={p.partnerName} partner={p} rank={i + 1} best />
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-3">
            Worst Anti-Synergies
          </h4>
          <div className="space-y-2">
            {bottom5.map((p, i) => (
              <PartnerCard key={p.partnerName} partner={p} rank={i + 1} best={false} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CombinationDetailPage() {
  const { kind, name } = useParams<{ kind: string; name: string }>();
  const navigate = useNavigate();
  const itemKind = kind as ItemKind;
  const itemName = decodeURIComponent(name || '');

  const [baselines, setBaselines] = useState<CombinationBaselines | null>(null);
  const [comboData, setComboData] = useState<Partial<Record<ComboType, CombinationComboRow[]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const comboSources = useMemo(() => getComboSources(itemKind), [itemKind]);

  // Fetch all data
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const bl = await getCombinationBaselinesCached();
        if (cancelled) return;
        setBaselines(bl);

        const types = [...new Set(comboSources.map(s => s.comboType))];
        const results: Partial<Record<ComboType, CombinationComboRow[]>> = {};
        for (const t of types) {
          results[t] = await getCombinationCombosCached(t);
          if (cancelled) return;
        }
        setComboData(results);
      } catch (err) {
        console.error('Error loading combination detail:', err);
        if (!cancelled) setError('Failed to load data. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [itemKind, itemName]);

  // Baseline maps
  const baselineMaps = useMemo(() => {
    if (!baselines) return { corp: new Map<string, CombinationBaselineRow>(), prelude: new Map<string, CombinationBaselineRow>(), card: new Map<string, CombinationBaselineRow>() };
    const toMap = (rows: CombinationBaselineRow[]) => new Map(rows.map(r => [r.name, r]));
    return {
      corp: toMap(baselines.corporations),
      prelude: toMap(baselines.preludes),
      card: toMap(baselines.cards),
    };
  }, [baselines]);

  const itemBaseline = baselineMaps[itemKind]?.get(itemName);

  // Extract partners per source
  const sections = useMemo(() => {
    return comboSources.map(source => {
      const combos = comboData[source.comboType] || [];
      const partnerBaselineMap = baselineMaps[source.partnerKind];
      const partners = extractPartners(combos, itemName, source, partnerBaselineMap, itemBaseline);
      return { ...source, partners };
    }).filter(s => s.partners.length > 0);
  }, [comboSources, comboData, baselineMaps, itemName, itemBaseline]);

  // Overall best/worst across all sections
  const allPartners = useMemo(() => {
    return sections.flatMap(s => s.partners).sort((a, b) => b.lift - a.lift);
  }, [sections]);

  if (!['corp', 'prelude', 'card'].includes(kind || '')) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Invalid Type</h1>
          <Button onClick={() => navigate('/combinations')}>Back to Combinations</Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Error</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="h-64 bg-slate-200 dark:bg-slate-700 rounded-2xl animate-pulse mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const accent = itemKind === 'corp'
    ? { gradient: 'from-amber-50 via-slate-50 to-amber-100 dark:from-slate-900 dark:via-slate-800 dark:to-amber-900', bar: 'from-amber-400 via-orange-400 to-amber-500', border: 'border-amber-200 dark:border-slate-700', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', ring: 'ring-amber-300/70 dark:ring-amber-700/50', underline: 'from-amber-400 via-orange-300 to-amber-500' }
    : itemKind === 'prelude'
      ? { gradient: 'from-violet-50 via-slate-50 to-violet-100 dark:from-slate-900 dark:via-slate-800 dark:to-violet-900', bar: 'from-violet-400 via-purple-400 to-violet-500', border: 'border-violet-200 dark:border-slate-700', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300', ring: 'ring-violet-300/70 dark:ring-violet-700/50', underline: 'from-violet-400 via-purple-300 to-violet-500' }
      : { gradient: 'from-sky-50 via-slate-50 to-sky-100 dark:from-slate-900 dark:via-slate-800 dark:to-sky-900', bar: 'from-sky-400 via-blue-400 to-sky-500', border: 'border-sky-200 dark:border-slate-700', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300', ring: 'ring-sky-300/70 dark:ring-sky-700/50', underline: 'from-sky-400 via-blue-300 to-sky-500' };

  const eloColor = (v: number | null) =>
    v != null && v > 0 ? 'text-green-600 dark:text-green-400' : v != null && v < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100';

  const formatEloDisplay = (v: number | null) =>
    v != null ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : 'N/A';

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-3">
        <BackButton fallbackPath="/combinations" />
      </div>

      {/* Header */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${accent.gradient} ${accent.border} border shadow-sm mb-8`}>
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accent.bar} shadow-lg`} />
        <span className={`absolute top-3 left-3 inline-flex items-center rounded-full ${accent.badge} px-3 py-1 text-xs font-semibold tracking-wide uppercase`}>
          {kindLabel(itemKind)} Synergies
        </span>

        <div className="grid grid-cols-12 gap-6 p-6 pt-12 items-center">
          <div className="col-span-12 md:col-span-8">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {itemName}
            </h1>
            <div className={`h-1 w-28 rounded-full bg-gradient-to-r ${accent.underline}`} />

            <p className="text-slate-600 dark:text-slate-400 mt-1 mb-4">
              Combination performance and synergies
            </p>

            {/* Key metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              <div className="text-center">
                <div className={`text-xl md:text-2xl font-semibold ${eloColor(itemBaseline?.avgEloChange ?? null)}`}>
                  {formatEloDisplay(itemBaseline?.avgEloChange ?? null)}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Avg Elo Change</div>
              </div>
              <div className="text-center">
                <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {itemBaseline ? `${(itemBaseline.winRate * 100).toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Win Rate</div>
              </div>
              <div className="text-center">
                <div className="text-xl md:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {itemBaseline ? itemBaseline.gameCount.toLocaleString() : 'N/A'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Games Played</div>
              </div>
            </div>
          </div>

          {/* Image */}
          <div className="col-span-12 md:col-span-4 flex justify-center">
            <div className={`relative rounded-2xl ${accent.ring} ring-1 shadow-xl overflow-hidden`}>
              <img
                src={getItemImage(itemName, itemKind)}
                alt={itemName}
                className="h-48 md:h-56 w-auto object-contain"
                onError={e => { (e.target as HTMLImageElement).src = getItemPlaceholder(itemKind); }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overall highlight row */}
      {allPartners.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 mb-3">
              #1 Best Synergy Overall
            </h3>
            <PartnerCard partner={allPartners[0]} rank={1} best />
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-3">
              #1 Worst Anti-Synergy Overall
            </h3>
            <PartnerCard partner={allPartners[allPartners.length - 1]} rank={1} best={false} />
          </div>
        </div>
      )}

      {/* Per-type synergy sections */}
      <div className="space-y-12">
        {sections.map(section => (
          <SynergySection
            key={section.comboType}
            label={section.partnerLabel}
            partners={section.partners}
            partnerKind={section.partnerKind}
          />
        ))}
      </div>
    </div>
  );
}
