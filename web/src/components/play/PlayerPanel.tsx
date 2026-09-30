import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getCardPlaceholderImage } from '@/lib/card';
import { getCardCategory } from '@/lib/cardMetadata';
import type { PlayerInfoVM, PlayerSnapshotVM } from '@/lib/replay/viewModel';
import {
  RESOURCES, TAG_ROWS, getCubeImage, getIcon, resourceIcons, startingPlayerImg, tagIcons, tileIcons,
} from '@/components/replay/replayShared';
import trImg from '/assets/tr.png';
import vpImg from '/assets/vp.png';
import { cardImage } from './controls';

const TAGS = TAG_ROWS.flat();

interface PlayerPanelProps {
  info: PlayerInfoVM;
  player: PlayerSnapshotVM;
  /** What the player is doing now: "action 2 of 2", "passed", "waiting"... */
  status: string;
  /** Whether it is this player's move. */
  isActive: boolean;
  isFirstPlayer: boolean;
}

/** A player's board at a glance; resting the pointer on it shows the cards they have played. */
export function PlayerPanel({ info, player, status, isActive, isFirstPlayer }: PlayerPanelProps) {
  // Where the panel's right edge is while the pointer rests on it; the cards in play open beside it.
  const [tableauLeft, setTableauLeft] = useState<number | null>(null);
  const cube = getCubeImage(info.color);

  return (
    <section
      className={`play-panel relative p-3 ${isActive ? 'play-active' : ''}`}
      onMouseEnter={e => setTableauLeft(e.currentTarget.getBoundingClientRect().right)}
      onMouseLeave={() => setTableauLeft(null)}
      aria-label={`${info.name}'s board`}
    >
      <div className="flex items-center gap-2">
        {cube && <img src={cube} alt="" className="h-6 w-6" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight text-white">
            {info.name}
            {isFirstPlayer && <img src={startingPlayerImg} alt="First player" title="First player this generation" className="ml-1.5 inline h-4 w-4" />}
          </p>
          <p className="truncate text-xs text-slate-400">{info.corporation} · {player.played.length} cards in play</p>
        </div>
        <span className="flex items-center gap-1 text-sm font-bold text-white" title="Terraform rating">
          <img src={trImg} alt="TR" className="h-5 w-5" />{player.tr}
        </span>
        <span className="flex items-center gap-1 text-sm font-bold text-white" title="Victory points if the game ended now">
          <img src={vpImg} alt="VP" className="h-5 w-5" />{player.vp?.total ?? '–'}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {RESOURCES.map(resource => (
          <div
            key={resource.key}
            className="play-tile flex items-center gap-1.5 px-1.5 py-0.5"
            title={`${resource.name}: ${player.resources[resource.key]} in stock, production ${player.production[resource.key]}`}
          >
            <img src={getIcon(resourceIcons, resource.icon)} alt={resource.name} className="h-8 w-8 flex-shrink-0 object-contain" />
            <span className="flex flex-col items-start leading-none">
              <b className="text-lg text-white">{player.resources[resource.key]}</b>
              <span
                className={`mt-0.5 rounded border px-1.5 py-px text-[13px] font-bold ${player.production[resource.key] < 0 ? 'border-red-400/40 bg-red-950/70 text-red-200' : 'border-amber-400/40 bg-amber-950/80 text-amber-100'}`}
                title={`${resource.name} production`}
              >
                {player.production[resource.key] >= 0 ? '+' : ''}{player.production[resource.key]}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
        {TAGS.map(tag => (
          <span
            key={tag.key}
            className={`flex items-center gap-1 text-sm font-semibold ${player.tags[tag.key] > 0 ? 'text-slate-200' : 'text-slate-600'}`}
            title={tag.title}
          >
            <img src={getIcon(tagIcons, tag.icon)} alt={tag.title} className={`h-6 w-6 ${player.tags[tag.key] > 0 ? '' : 'opacity-30'}`} />
            {player.tags[tag.key]}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-4 text-sm font-semibold text-slate-300">
        <span className="flex items-center gap-1" title="Cards in hand">
          <img src={getCardPlaceholderImage()} alt="Cards in hand" className="h-7 w-auto rounded-[2px]" />{player.handCount ?? 0}
        </span>
        <span className="flex items-center gap-1" title="Cities">
          <img src={getIcon(tileIcons, 'city tile')} alt="Cities" className="h-7 w-7 object-contain" />{player.tileCounts.cities}
        </span>
        <span className="flex items-center gap-1" title="Greeneries">
          <img src={getIcon(tileIcons, 'greenery tile')} alt="Greeneries" className="h-7 w-7 object-contain" />{player.tileCounts.greeneries}
        </span>
        <span className={`ml-auto font-semibold ${isActive ? 'text-amber-300' : 'text-slate-500'}`}>{isActive && '● '}{status}</span>
      </div>

      {tableauLeft != null && <Tableau info={info} player={player} left={tableauLeft} />}
    </section>
  );
}

const SECTIONS = [
  { title: 'Actions', color: '#60a5fa', categories: ['action'] },
  { title: 'Effects', color: '#60a5fa', categories: ['effect'] },
  { title: 'Automated', color: '#4ade80', categories: ['automated', 'unknown'] },
  { title: 'Events', color: '#f87171', categories: ['event'] },
];

/** The cards a player has in play, grouped the way they are laid out on a table. */
function Tableau({ info, player, left }: { info: PlayerInfoVM; player: PlayerSnapshotVM; left: number }) {
  const groups = [
    { title: 'Corporation and preludes', color: info.color, cards: player.headquarters },
    ...SECTIONS.map(s => ({ ...s, cards: player.played.filter(card => s.categories.includes(getCardCategory(card))) })),
  ].filter(group => group.cards.length > 0);

  // In the page body, since a panel clips and offsets anything fixed inside it. The padding keeps the
  // pointer over the tableau on its way across from the panel.
  return createPortal(
    <div className="fixed bottom-3 top-[60px] z-[55] pl-2" style={{ left }}>
      <div className="play-panel max-h-full w-[min(1000px,calc(100vw-340px))] overflow-y-auto scrollbar-subtle p-3">
        <p className="mb-2 text-sm font-bold text-white">{info.name}'s cards in play</p>
        {groups.map(group => (
          <div key={group.title} className="mb-3">
            <p className="play-heading mb-1" style={{ color: group.color }}>{group.title} · {group.cards.length}</p>
            <div className="grid grid-cols-5 gap-2">
              {group.cards.map((card, i) => {
                const resources = player.cardResources[card];
                const used = player.usedActions.includes(card);
                return (
                  <div key={`${card}-${i}`} className="relative" title={card}>
                    <img src={cardImage(card)} alt={card} className={`w-full rounded ${used ? 'opacity-45' : ''}`} />
                    {resources != null && resources > 0 && (
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/85 px-2 py-0.5 text-sm font-bold text-amber-300">{resources}</span>
                    )}
                    {used && <span className="absolute left-2 top-2 rounded bg-black/85 px-1.5 text-xs font-bold text-slate-300">USED</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
