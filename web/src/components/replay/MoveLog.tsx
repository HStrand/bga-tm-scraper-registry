import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info, MapPin } from 'lucide-react';
import { getCardImage, getCardPlaceholderImage } from '@/lib/card';
import type { GameLogMove } from '@/types/gamelog';
import { getCubeImage, getIcon, tileIcons, resourceIcons } from './replayShared';
import cityTileImage from '/assets/tiles/city tile.png';
import greeneryTileImage from '/assets/tiles/greenery tile.png';
import oceanTileImage from '/assets/tiles/ocean tile.png';
import temperatureImg from '/assets/temperature.png';
import temperatureMiniImg from '/assets/temperature mini.png';

const milestoneImages = import.meta.glob('../../../assets/milestones/*.png', { eager: true }) as Record<string, { default: string }>;
const awardImages = import.meta.glob('../../../assets/awards/*.png', { eager: true }) as Record<string, { default: string }>;

function getMilestoneImage(name: string): string | undefined {
  const slug = name.toLowerCase().replace(/\s+/g, '_');
  const entry = Object.entries(milestoneImages).find(([key]) => {
    const base = key.replace(/^.*[\\/]/, '').toLowerCase().replace('.png', '');
    return base === slug || base === name.toLowerCase().replace(/\s+/g, '');
  });
  return entry?.[1].default;
}

function getAwardImage(name: string): string | undefined {
  const slug = name.toLowerCase().replace(/\s+/g, '_');
  const entry = Object.entries(awardImages).find(([key]) => {
    const base = key.replace(/^.*[\\/]/, '').toLowerCase().replace('.png', '');
    return base === slug || base === name.toLowerCase().replace(/\s+/g, '');
  });
  return entry?.[1].default;
}
import oxygenImg from '/assets/oxygen.png';
import oceanImg from '/assets/ocean.png';
import trImg from '/assets/tr.png';

const specialTileImages = import.meta.glob('../../../assets/tiles/*.png', { eager: true }) as Record<string, { default: string }>;

const TILE_ALIASES: Record<string, string> = {
  'mining area': 'mining',
  'mining rights': 'mining',
};

function getTileImage(tileType: string): string | undefined {
  const norm = tileType.toLowerCase();
  if (norm === 'city') return cityTileImage;
  if (norm === 'greenery' || norm === 'forest') return greeneryTileImage;
  if (norm === 'ocean') return oceanTileImage;
  const slug = TILE_ALIASES[norm] ?? norm;
  const entry = Object.entries(specialTileImages).find(([key]) => {
    const base = key.replace(/^.*[\\/]/, '').toLowerCase().replace('.png', '');
    return base === slug;
  });
  return entry?.[1].default;
}

interface MoveLogProps {
  moves: GameLogMove[];
  currentStep: number;
  generationBoundaries: Map<number, { start: number; end: number }>;
  playerColors: Record<string, string>;
  onJump: (step: number) => void;
}

const MoveEntry = memo(function MoveEntry({ move, moveIndex, isCurrent, isExpanded, cubeImg, playerColor, allPlayerNames, onClick, onHover, onLeave }: {
  move: GameLogMove; moveIndex: number; isCurrent: boolean; isExpanded: boolean;
  cubeImg: string | undefined; playerColor: string; allPlayerNames: string[]; onClick: () => void; onHover: () => void; onLeave: () => void;
}) {
  return (
    <div
      className={`px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 ${isCurrent ? 'bg-white/5 border border-white/10' : 'opacity-50 hover:opacity-80'}`}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-slate-500 flex-shrink-0">#{moveIndex + 1}</span>
        {move.action_type === 'game_state_change' ? (<>
          <span className="text-xs text-slate-500 italic">Game State Change</span>
          <span className="relative group flex-shrink-0">
            <Info className="w-3 h-3 text-slate-600 cursor-help" />
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block z-50 bg-slate-800 text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap border border-slate-700 leading-relaxed">
              BGA stores internal game state changes in logs.<br />These moves have no effect and are shown for completeness.
            </span>
          </span>
        </>) : (<>
          {cubeImg ? (
            <img src={cubeImg} alt="" className="w-4 h-4 flex-shrink-0" />
          ) : (
            <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: playerColor }} />
          )}
          <span className="font-bold text-white text-xs">{move.player_name}</span>
        </>)}
      </div>
      {move.action_type === 'place_tile' && move.tile_placed && move.tile_location ? (
        <TilePlacement move={move} />
      ) : (() => {
        const payments = move.action_type !== 'game_state_change' ? parsePayments(move.description) : null;
        if (payments) return <ResourcePayment playerName={move.player_name} payments={payments} />;
        if (move.action_type !== 'game_state_change') {
          // Show inline card images only for explicit discard/sell actions (not drafts, starting hands, or keeps)
          const isDiscardAction = /discards?\s+(a\s+)?card/i.test(move.description);
          const isSellAction = /sells?\s+(a\s+)?card/i.test(move.description);
          const cardList = isDiscardAction && move.cards_discarded?.length ? move.cards_discarded
            : isSellAction && move.cards_sold?.length ? move.cards_sold
            : null;
          return (<>
            <RichDescription text={move.description} playerName={move.player_name} playerNames={allPlayerNames} />
            {cardList && (
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[11px] text-slate-300">
                {cardList.map((card, i) => {
                  const img = getCardImage(card) ?? getCardPlaceholderImage();
                  return <InlineCard key={`${card}-${i}`} cardName={card} cardImg={img} />;
                })}
              </div>
            )}
          </>);
        }
        return null;
      })()}
    </div>
  );
});

function resolveTileName(move: GameLogMove): string {
  // 1. Use reason if available
  if (move.tile_placed === 'tile' && move.reason) return move.reason;
  // 2. Look up special_tiles from game_state
  if (move.tile_placed === 'tile' && move.game_state?.special_tiles) {
    const playerTiles = move.game_state.special_tiles[move.player_id];
    if (playerTiles) {
      // Find the special tile whose location matches this move's tile_location
      for (const [name, loc] of Object.entries(playerTiles)) {
        if (move.tile_location && loc.includes(move.tile_location.replace(/^Hex at /, 'Hex '))) return name;
        // Also try matching by coordinates
        const coordMatch = move.tile_location?.match(/\((\d+,\d+)\)/);
        if (coordMatch && loc.includes(coordMatch[1])) return name;
      }
      // If only one special tile for this player, use it
      const entries = Object.keys(playerTiles);
      if (entries.length === 1) return entries[0];
    }
  }
  // 3. Fall back to tile_placed
  return move.tile_placed!;
}

function TilePlacement({ move }: { move: GameLogMove }) {
  const tileName = resolveTileName(move);
  const tileImg = getTileImage(tileName);
  // Parse location name from "Pavonis Mons (2,4)" → name="Pavonis Mons", coords="2,4"
  const locMatch = move.tile_location?.match(/^(.+?)\s*\((\d+,\d+)\)$/);
  const locName = locMatch ? locMatch[1].trim() : move.tile_location;
  const locCoords = locMatch ? locMatch[2] : null;

  return (
    <div className="flex items-center gap-2.5 mt-1">
      {tileImg && (
        <img src={tileImg} alt={tileName} className="w-10 h-10 flex-shrink-0 drop-shadow" />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white">{tileName}</p>
        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <MapPin size={10} className="flex-shrink-0" />
          {locName}
          {locCoords && <span className="text-slate-500">({locCoords})</span>}
        </p>
        {move.reason && move.reason !== tileName && move.reason !== move.tile_placed && (
          <p className="text-[10px] text-slate-500 italic">{move.reason}</p>
        )}
      </div>
    </div>
  );
}

const RESOURCE_ICON_MAP: Record<string, string> = {
  'plant': 'plant',
  'heat': 'heat',
  'steel': 'steel',
  'titanium': 'titanium',
  'energy': 'energy',
  'm€': 'mc',
  'mc': 'mc',
};

interface PaymentInfo {
  amount: number;
  resource: string;
  iconName: string;
}

function parsePayments(description: string): PaymentInfo[] | null {
  // Match patterns like "PlayerName pays X Resource" separated by |
  const parts = description.split('|').map(s => s.trim());
  const payments: PaymentInfo[] = [];
  for (const part of parts) {
    const match = part.match(/pays (\d+) (\S+(?:\s*€)?)/i);
    if (!match) return null; // Not a pure payment description
    const amount = parseInt(match[1], 10);
    const resource = match[2];
    const iconName = RESOURCE_ICON_MAP[resource.toLowerCase()];
    if (!iconName) return null;
    payments.push({ amount, resource, iconName });
  }
  return payments.length > 0 ? payments : null;
}

function ResourcePayment({ playerName, payments }: { playerName: string; payments: PaymentInfo[] }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-300">
      <span>{playerName} pays</span>
      {payments.map((p, i) => {
        const icon = getIcon(resourceIcons, p.iconName);
        return (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-slate-500 mx-0.5">+</span>}
            <span className="font-bold text-white">{p.amount}</span>
            {icon ? (
              <img src={icon} alt={p.resource} className="w-4 h-4" />
            ) : (
              <span className="text-slate-400">{p.resource}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

const INLINE_ICONS: Record<string, string> = {
  'Heat': getIcon(resourceIcons, 'heat') ?? '',
  'Plant': getIcon(resourceIcons, 'plant') ?? '',
  'Steel': getIcon(resourceIcons, 'steel') ?? '',
  'Titanium': getIcon(resourceIcons, 'titanium') ?? '',
  'Energy': getIcon(resourceIcons, 'energy') ?? '',
  'M€': getIcon(resourceIcons, 'mc') ?? '',
  'MC': getIcon(resourceIcons, 'mc') ?? '',
  'TR': trImg,
  'Temperature': temperatureImg,
  'Oxygen': oxygenImg,
  'Oxygen Level': oxygenImg,
  'Oceans': oceanImg,
};

// Build a regex that matches "N Resource" patterns for inline icon replacement
// Sort keys longest-first so "Oxygen Level" matches before "Oxygen"
const ICON_KEYS_SORTED = Object.keys(INLINE_ICONS).sort((a, b) => b.length - a.length);
const ICON_PATTERN = new RegExp(
  `(\\d+)\\s+(${ICON_KEYS_SORTED.join('|')})(?![a-zA-Z])`,
  'g'
);

// Rewrite verbose segments into cleaner JSX
function rewriteSegment(seg: string, key: number): JSX.Element | null | undefined {
  // "Player increases Temperature by X step/s to a value of Y"
  const tempMatch = seg.match(/^(.+?) increases Temperature by (\d+) step\/s to a value of (-?\d+)/i);
  if (tempMatch) return (
    <p key={key} className="flex items-center gap-0.5 flex-wrap">
      <span className="font-bold text-white">{tempMatch[1]}</span>
      <span> increases </span>
      <span className="font-bold text-white">temperature</span>
      <img src={temperatureMiniImg} alt="temperature" className="w-3.5 h-3.5" />
      <span> to </span>
      <span className="font-bold text-white">{tempMatch[3]}°C</span>
    </p>
  );

  // "Player increases Oxygen Level by X step/s to a value of Y"
  const oxyMatch = seg.match(/^(.+?) increases Oxygen(?: Level)? by (\d+) step\/s to a value of (\d+)/i);
  if (oxyMatch) return (
    <p key={key} className="flex items-center gap-0.5 flex-wrap">
      <span className="font-bold text-white">{oxyMatch[1]}</span>
      <span> increases </span>
      <span className="font-bold text-white">oxygen</span>
      <img src={oxygenImg} alt="oxygen" className="w-3.5 h-3.5" />
      <span> to </span>
      <span className="font-bold text-white">{oxyMatch[3]}%</span>
    </p>
  );

  // "Player increases Oceans by X step/s to a value of Y"
  const oceanMatch = seg.match(/^(.+?) increases Oceans by (\d+) step\/s to a value of (\d+)/i);
  if (oceanMatch) return (
    <p key={key} className="flex items-center gap-0.5 flex-wrap">
      <span className="font-bold text-white">{oceanMatch[1]}</span>
      <span> increases </span>
      <span className="font-bold text-white">oceans</span>
      <img src={oceanImg} alt="oceans" className="w-3.5 h-3.5" />
      <span> to </span>
      <span className="font-bold text-white">{oceanMatch[3]}/9</span>
    </p>
  );

  // "Player increases/reduces X Production by N"
  const prodMatch = seg.match(/^(.+?) (increases|reduces) (\S+(?:\s*€)?) Production by (\d+)/i);
  if (prodMatch) {
    const verb = prodMatch[2].toLowerCase();
    const resName = prodMatch[3];
    const amount = prodMatch[4];
    const iconKey = RESOURCE_ICON_MAP[resName.toLowerCase()];
    const icon = iconKey ? getIcon(resourceIcons, iconKey) : null;
    // Capture any trailing text like "(immediate effect of X)"
    const rest = seg.slice(prodMatch[0].length);
    return (
      <p key={key} className="flex items-center gap-0.5 flex-wrap">
        <span className="font-bold text-white">{prodMatch[1]}</span>
        <span> {verb} </span>
        <span>{resName} Production</span>
        {icon && <img src={icon} alt={resName} className="w-3.5 h-3.5" />}
        <span> by </span>
        <span className="font-bold text-white">{amount}</span>
        {rest && <span>{rest}</span>}
      </p>
    );
  }

  // "Player plays card CardName"
  const playsMatch = seg.match(/^(.+?) plays card (.+)$/i);
  if (playsMatch) {
    const cardName = playsMatch[2];
    const cardImg = getCardImage(cardName) ?? getCardPlaceholderImage();
    return (
      <p key={key} className="flex items-center gap-1 flex-wrap">
        <span className="font-bold text-white">{playsMatch[1]}</span>
        <span> plays </span>
        <InlineCard cardName={cardName} cardImg={cardImg} />
      </p>
    );
  }

  // "Player draws/drafts/activates/reveals CardName" — optionally followed by
  // ": trailing context" (e.g. "reveals Fuel Factory: it does not have a Plant tag").
  const verbMatch = seg.match(/^(.+?) (draws|drafts|activates|reveals) (.+)$/i);
  if (verbMatch && !verbMatch[3].match(/^\d+ cards?/i)) {
    const colonIdx = verbMatch[3].indexOf(':');
    const cardName = (colonIdx >= 0 ? verbMatch[3].slice(0, colonIdx) : verbMatch[3]).trim();
    const trailing = colonIdx >= 0 ? verbMatch[3].slice(colonIdx + 1).trim() : '';
    const cardImg = getCardImage(cardName) ?? getCardPlaceholderImage();
    return (
      <p key={key} className="flex items-center gap-1 flex-wrap">
        <span className="font-bold text-white">{verbMatch[1]}</span>
        <span> {verbMatch[2]} </span>
        <InlineCard cardName={cardName} cardImg={cardImg} />
        {trailing && <span className="text-slate-400">: {trailing}</span>}
      </p>
    );
  }

  // "Player keeps CardName"
  const keepsMatch = seg.match(/^(.+?) keeps (\S.+)$/i);
  if (keepsMatch && !keepsMatch[2].match(/^\d+ cards?/i)) {
    const cardName = keepsMatch[2];
    const cardImg = getCardImage(cardName) ?? getCardPlaceholderImage();
    return (
      <p key={key} className="flex items-center gap-1 flex-wrap">
        <span className="font-bold text-white">{keepsMatch[1]}</span>
        <span> keeps </span>
        <InlineCard cardName={cardName} cardImg={cardImg} />
      </p>
    );
  }

  // "Player claims milestone X"
  const msMatch = seg.match(/^(.+?) claims milestone (.+)$/i);
  if (msMatch) {
    return (
      <p key={key}>
        <span className="font-bold text-white">{msMatch[1]}</span>
        {' claims milestone '}
        <span className="font-bold text-green-400">{msMatch[2].trim()}</span>
      </p>
    );
  }

  // "Player funds X award"
  const awMatch = seg.match(/^(.+?) funds (.+?) award$/i);
  if (awMatch) {
    return (
      <p key={key}>
        <span className="font-bold text-white">{awMatch[1]}</span>
        {' funds '}
        <span className="font-bold text-amber-400">{awMatch[2].trim()}</span>
        {' award'}
      </p>
    );
  }

  // "Player plays standard project X"
  const stdMatch = seg.match(/^(.+?) plays standard project (.+)$/i);
  if (stdMatch) return (
    <p key={key}>
      <span className="font-bold text-white">{stdMatch[1]}</span>
      {' plays standard project '}
      <span className="font-bold text-white">{stdMatch[2]}</span>
    </p>
  );

  // "Parameter Temperature increase triggers a bonus" → skip
  if (/^Parameter .+ triggers a bonus$/i.test(seg)) return null;

  // "Player moves X into tableau_" → skip (internal)
  if (/moves .+ into tableau_/i.test(seg)) return null;

  return undefined; // not matched — use default rendering
}

function RichDescription({ text, playerName, playerNames }: { text: string; playerName: string; playerNames: string[] }) {
  // Replace "You verb" with "playerName verbs" (conjugate to third person)
  const normalized = text.replace(/\bYou (\w+)/g, (_match, verb: string) => {
    const v = verb.toLowerCase();
    if (v.endsWith('s') || v.endsWith('x') || v.endsWith('sh') || v.endsWith('ch')) return `${playerName} ${verb}es`;
    if (v.endsWith('y') && !/[aeiou]y$/i.test(v)) return `${playerName} ${verb.slice(0, -1)}ies`;
    return `${playerName} ${verb}s`;
  });
  const parts = normalized.split('|').map(s => s.trim());

  return (
    <div className="text-[11px] text-slate-300 leading-relaxed space-y-0.5">
      {parts.map((part, i) => {
        // Try segment-level rewrites
        const rewrite = rewriteSegment(part, i);
        if (rewrite === null) return null; // skip this segment
        if (rewrite !== undefined) return rewrite;

        // Default: apply inline icon replacement + bold player names
        return <p key={i}>{boldPlayerNames(renderInlineIcons(part), playerNames)}</p>;
      })}
    </div>
  );
}

function boldPlayerNames(elements: (string | JSX.Element)[], playerNames: string[]): (string | JSX.Element)[] {
  if (playerNames.length === 0) return elements;
  const namePattern = new RegExp(`(${playerNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const result: (string | JSX.Element)[] = [];
  let keyIdx = 0;
  for (const el of elements) {
    if (typeof el !== 'string') { result.push(el); continue; }
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    namePattern.lastIndex = 0;
    while ((match = namePattern.exec(el)) !== null) {
      if (match.index > lastIdx) result.push(el.slice(lastIdx, match.index));
      result.push(<span key={`pn-${keyIdx++}`} className="font-bold text-white">{match[1]}</span>);
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx === 0) result.push(el);
    else if (lastIdx < el.length) result.push(el.slice(lastIdx));
  }
  return result;
}

function renderInlineIcons(text: string): (string | JSX.Element)[] {
  const elements: (string | JSX.Element)[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  ICON_PATTERN.lastIndex = 0;
  while ((match = ICON_PATTERN.exec(text)) !== null) {
    if (match.index > lastIdx) elements.push(text.slice(lastIdx, match.index));
    const icon = INLINE_ICONS[match[2]];
    const showLabel = match[2] === 'TR';
    elements.push(
      <span key={match.index} className="inline-flex items-center gap-0.5 mx-0.5">
        <span className="font-bold text-white">{match[1]}</span>
        {showLabel && <span className="font-bold text-white">{match[2]}</span>}
        {icon ? <img src={icon} alt={match[2]} className="w-3.5 h-3.5 inline-block align-text-bottom" /> : (
          !showLabel && <span>{match[2]}</span>
        )}
      </span>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) elements.push(text.slice(lastIdx));
  return elements.length > 0 ? elements : [text];
}

function InlineCard({ cardName, cardImg }: { cardName: string; cardImg: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const onEnter = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const previewH = 400;
      const previewW = 280;
      let top = rect.top - previewH - 8;
      if (top < 8) top = rect.bottom + 8;
      let left = rect.left + rect.width / 2 - previewW / 2;
      if (left < 8) left = 8;
      if (left + previewW > window.innerWidth - 8) left = window.innerWidth - previewW - 8;
      setPos({ x: left, y: top });
    }
    setHover(true);
  }, []);

  return (
    <span
      ref={ref}
      className="inline-flex items-center gap-1 cursor-pointer"
      onMouseEnter={onEnter}
      onMouseLeave={() => setHover(false)}
    >
      <img src={cardImg} alt={cardName} className="w-5 h-7 rounded-sm object-cover" />
      <span className="font-bold text-white">{cardName}</span>
      {hover && createPortal(
        <img
          src={cardImg}
          alt={cardName}
          className="rounded-lg shadow-2xl shadow-black/70 pointer-events-none"
          style={{ position: 'fixed', left: pos.x, top: pos.y, width: 280, zIndex: 9999 }}
        />,
        document.body
      )}
    </span>
  );
}

function CardPreview({ cardName, cardCost }: { cardName: string; cardCost?: number | null }) {
  const img = getCardImage(cardName) ?? getCardPlaceholderImage();
  return (
    <div className="mt-1.5">
      <p className="text-[11px] font-medium text-slate-300 mb-1">
        {cardName}
        {cardCost != null && (
          <span className="text-slate-500 ml-1">({cardCost} MC)</span>
        )}
      </p>
      <img src={img} alt={cardName} className="w-full rounded-lg shadow-lg shadow-black/30" />
    </div>
  );
}

export function MoveLog({ moves, currentStep, generationBoundaries, playerColors, onJump }: MoveLogProps) {
  const currentMove = moves[currentStep];
  const currentGen = currentMove?.game_state?.generation;
  const bounds = currentGen != null ? generationBoundaries.get(currentGen) : undefined;
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentStep]);

  const startIdx = bounds?.start ?? currentStep;
  const endIdx = Math.min(bounds?.end ?? currentStep, currentStep);

  // Collect all unique player names for bolding in descriptions
  const allPlayerNames = useMemo(() => {
    const names = new Set<string>();
    for (const m of moves) names.add(m.player_name);
    return [...names];
  }, [moves]);

  return (
    <div className="glass-panel rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
      <div ref={scrollRef} className="overflow-y-auto scrollbar-subtle py-2 space-y-1">
        {Array.from({ length: endIdx - startIdx + 1 }, (_, i) => {
          const idx = endIdx - i;
          const move = moves[idx];
          if (!move) return null;
          const isCurrent = idx === currentStep;
          const color = playerColors[move.player_id] ?? '#888';
          return (
            <div key={idx} ref={isCurrent ? activeRef : undefined}>
              <MoveEntry
                move={move} moveIndex={idx} isCurrent={isCurrent}
                isExpanded={isCurrent || hoveredIdx === idx}
                cubeImg={getCubeImage(color)}
                playerColor={color}
                allPlayerNames={allPlayerNames}
                onClick={() => onJump(idx)}
                onHover={() => setHoveredIdx(idx)}
                onLeave={() => setHoveredIdx(null)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
