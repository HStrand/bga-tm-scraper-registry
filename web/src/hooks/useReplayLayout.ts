import { useCallback, useEffect, useState } from 'react';
import { usePersistentState } from './usePersistentState';

export const REPLAY_LAYOUT_KEY = 'replay:layout:v1';

export const DEFAULT_MAP_SCALE = 0.8;
const MIN_MAP_SCALE = 0.5;
const MAX_MAP_SCALE = 1;

// Floating panels are dragged by a handle along their top edge. Keep this much of one on screen so
// a panel stored on a larger window can still be grabbed.
const VISIBLE_X = 80;
const VISIBLE_Y = 40;
const LOG_WIDTH = 380;

type Offset = { x: number; y: number };
type LogPosition = { top: number; left: number };

export type ReplayLayout = {
  mapScale: number;
  mapOffset: Offset;
  controlsUnlinked: boolean;
  controlsOffset: Offset;
  /** Viewport position of the move log, or null while it sits in the right column. */
  logPosition: LogPosition | null;
};

const DEFAULT_LAYOUT: ReplayLayout = {
  mapScale: DEFAULT_MAP_SCALE,
  mapOffset: { x: 0, y: 0 },
  controlsUnlinked: false,
  controlsOffset: { x: 0, y: 0 },
  logPosition: null,
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Pulls a floating panel stored on a larger window back on screen: its top edge (where the drag
 * handle is) stays inside the viewport and enough of its width is visible to grab.
 */
function withinReach(top: number, left: number, width: number): { top: number; left: number } {
  if (typeof window === 'undefined') return { top, left };
  return {
    top: clamp(top, 0, window.innerHeight - VISIBLE_Y),
    left: clamp(left, VISIBLE_X - width, window.innerWidth - VISIBLE_X),
  };
}

/** Re-renders on window resize, so floating panels are pulled back within reach when it shrinks. */
function useViewportSize() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onResize = () => setTick(t => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
}

function readOffset(v: unknown): Offset | null {
  const o = v as Partial<Offset> | null;
  return o && isNum(o.x) && isNum(o.y) ? { x: o.x, y: o.y } : null;
}

/** Fills in anything missing or malformed in a stored layout, and pulls the move log back on screen. */
function sanitize(stored: unknown): ReplayLayout {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof ReplayLayout, unknown>>;
  const log = s.logPosition as Partial<LogPosition> | null | undefined;
  const logPosition = log && isNum(log.top) && isNum(log.left) ? withinReach(log.top, log.left, LOG_WIDTH) : null;
  return {
    mapScale: isNum(s.mapScale) ? clamp(s.mapScale, MIN_MAP_SCALE, MAX_MAP_SCALE) : DEFAULT_LAYOUT.mapScale,
    mapOffset: readOffset(s.mapOffset) ?? DEFAULT_LAYOUT.mapOffset,
    controlsUnlinked: typeof s.controlsUnlinked === 'boolean' ? s.controlsUnlinked : DEFAULT_LAYOUT.controlsUnlinked,
    controlsOffset: readOffset(s.controlsOffset) ?? DEFAULT_LAYOUT.controlsOffset,
    logPosition,
  };
}

/**
 * Where the replay viewer's movable pieces are — map zoom and pan, the playback controls and the
 * move log — kept in localStorage so a replay opens the way the last one was left.
 */
export function useReplayLayout() {
  const [stored, setStored] = usePersistentState<ReplayLayout>(REPLAY_LAYOUT_KEY, DEFAULT_LAYOUT);

  useViewportSize();

  const layout = sanitize(stored);
  const setter = <K extends keyof ReplayLayout>(key: K) =>
    (value: ReplayLayout[K]) => setStored(prev => ({ ...sanitize(prev), [key]: value }));

  return {
    ...layout,
    setMapScale: setter('mapScale'),
    setMapOffset: setter('mapOffset'),
    setControlsUnlinked: setter('controlsUnlinked'),
    setControlsOffset: setter('controlsOffset'),
    setLogPosition: setter('logPosition'),
  };
}

// --- Player areas ---

export const playerAreaKey = (slot: number) => `replay:player-area:v1:${slot}`;

export type CardViewMode = 'grid' | 'stack' | 'synthetic' | 'hidden';
const CARD_VIEW_MODES: readonly CardViewMode[] = ['grid', 'stack', 'synthetic', 'hidden'];
export const MIN_CARD_SIZE = 60;
export const MAX_CARD_SIZE = 180;

/** How one card section (Hand, Effects, ...) of a player area is shown. Unset fields use the section's defaults. */
export type CardSectionView = { viewMode?: CardViewMode; cardSize?: number };

export type TrackerView = { showResources: boolean; resourcesZoom: number; showTags: boolean; tagsZoom: number };
export const DEFAULT_TRACKER_VIEW: TrackerView = { showResources: true, resourcesZoom: 1, showTags: true, tagsZoom: 1 };
export const MIN_TRACKER_ZOOM = 0.6;
export const MAX_TRACKER_ZOOM = 1.4;

// Smallest an expanded player area can be resized to, and its width before it is resized.
export const MIN_AREA_WIDTH = 320;
export const MIN_AREA_HEIGHT = 200;
const COMPACT_AREA_WIDTH = 320;

export type PlayerAreaLayout = {
  /** Viewport position once dragged out of the left column, or null while it sits there. */
  position: { x: number; y: number } | null;
  /** Size of the expanded area once resized, or null for the default size. */
  size: { w: number; h: number } | null;
  pinned: boolean;
  trackers: TrackerView;
  /** Keyed by section title. */
  sections: Record<string, CardSectionView>;
};

const DEFAULT_PLAYER_AREA: PlayerAreaLayout = {
  position: null,
  size: null,
  pinned: false,
  trackers: DEFAULT_TRACKER_VIEW,
  sections: {},
};

function sanitizePlayerArea(stored: unknown): PlayerAreaLayout {
  const s = isObj(stored) ? stored : {};
  const size = isObj(s.size) && isNum(s.size.w) && isNum(s.size.h)
    ? { w: Math.max(MIN_AREA_WIDTH, s.size.w), h: Math.max(MIN_AREA_HEIGHT, s.size.h) }
    : null;
  let position: PlayerAreaLayout['position'] = null;
  if (isObj(s.position) && isNum(s.position.x) && isNum(s.position.y)) {
    const { top, left } = withinReach(s.position.y, s.position.x, size?.w ?? COMPACT_AREA_WIDTH);
    position = { x: left, y: top };
  }
  const t = isObj(s.trackers) ? s.trackers : {};
  const zoom = (v: unknown, fallback: number) => isNum(v) ? clamp(v, MIN_TRACKER_ZOOM, MAX_TRACKER_ZOOM) : fallback;
  const sections: Record<string, CardSectionView> = {};
  for (const [title, v] of Object.entries(isObj(s.sections) ? s.sections : {})) {
    if (!isObj(v)) continue;
    const view: CardSectionView = {};
    if (CARD_VIEW_MODES.includes(v.viewMode as CardViewMode)) view.viewMode = v.viewMode as CardViewMode;
    if (isNum(v.cardSize)) view.cardSize = clamp(v.cardSize, MIN_CARD_SIZE, MAX_CARD_SIZE);
    sections[title] = view;
  }
  return {
    position,
    size,
    pinned: typeof s.pinned === 'boolean' ? s.pinned : false,
    trackers: {
      showResources: typeof t.showResources === 'boolean' ? t.showResources : DEFAULT_TRACKER_VIEW.showResources,
      resourcesZoom: zoom(t.resourcesZoom, DEFAULT_TRACKER_VIEW.resourcesZoom),
      showTags: typeof t.showTags === 'boolean' ? t.showTags : DEFAULT_TRACKER_VIEW.showTags,
      tagsZoom: zoom(t.tagsZoom, DEFAULT_TRACKER_VIEW.tagsZoom),
    },
    sections,
  };
}

/**
 * Where a player area is and how it is shown, kept in localStorage per slot: the first player area
 * in the column is slot 0 in every replay, whoever sits there.
 */
export function usePlayerAreaLayout(slot: number) {
  const [stored, setStored] = usePersistentState<PlayerAreaLayout>(playerAreaKey(slot), DEFAULT_PLAYER_AREA);
  useViewportSize();

  const update = useCallback(
    (change: Partial<PlayerAreaLayout> | ((prev: PlayerAreaLayout) => Partial<PlayerAreaLayout>)) =>
      setStored(prev => {
        const current = sanitizePlayerArea(prev);
        return { ...current, ...(typeof change === 'function' ? change(current) : change) };
      }),
    [setStored],
  );

  return [sanitizePlayerArea(stored), update] as const;
}
