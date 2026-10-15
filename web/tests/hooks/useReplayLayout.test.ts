import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useReplayLayout, usePlayerAreaLayout, REPLAY_LAYOUT_KEY, DEFAULT_MAP_SCALE, DEFAULT_TRACKER_VIEW, playerAreaKey,
} from '@/hooks/useReplayLayout';

const stored = () => JSON.parse(localStorage.getItem(REPLAY_LAYOUT_KEY) ?? 'null');

describe('useReplayLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('starts from the default layout when nothing is stored', () => {
    const { result } = renderHook(() => useReplayLayout());

    expect(result.current.mapScale).toBe(DEFAULT_MAP_SCALE);
    expect(result.current.mapOffset).toEqual({ x: 0, y: 0 });
    expect(result.current.controlsUnlinked).toBe(false);
    expect(result.current.controlsOffset).toEqual({ x: 0, y: 0 });
    expect(result.current.logPosition).toBeNull();
  });

  it('saves changes and restores them on the next visit', () => {
    const first = renderHook(() => useReplayLayout());
    act(() => {
      first.result.current.setMapScale(0.6);
      first.result.current.setMapOffset({ x: 30, y: -10 });
      first.result.current.setControlsUnlinked(true);
      first.result.current.setControlsOffset({ x: 5, y: 7 });
      first.result.current.setLogPosition({ top: 120, left: 400 });
    });
    act(() => { vi.runAllTimers(); });
    first.unmount();

    const { result } = renderHook(() => useReplayLayout());
    expect(result.current.mapScale).toBe(0.6);
    expect(result.current.mapOffset).toEqual({ x: 30, y: -10 });
    expect(result.current.controlsUnlinked).toBe(true);
    expect(result.current.controlsOffset).toEqual({ x: 5, y: 7 });
    expect(result.current.logPosition).toEqual({ top: 120, left: 400 });
  });

  it('forgets the move log position when it is put back in the column', () => {
    localStorage.setItem(REPLAY_LAYOUT_KEY, JSON.stringify({ logPosition: { top: 120, left: 400 } }));
    const { result } = renderHook(() => useReplayLayout());

    act(() => result.current.setLogPosition(null));
    act(() => { vi.runAllTimers(); });

    expect(stored().logPosition).toBeNull();
  });

  it('keeps a move log stored on a larger window within reach', () => {
    localStorage.setItem(REPLAY_LAYOUT_KEY, JSON.stringify({ logPosition: { top: 5000, left: -5000 } }));
    const { result } = renderHook(() => useReplayLayout());

    const { top, left } = result.current.logPosition!;
    expect(top).toBeLessThan(window.innerHeight);
    expect(left + 380).toBeGreaterThan(0);
  });

  it('falls back to defaults for malformed stored values', () => {
    localStorage.setItem(REPLAY_LAYOUT_KEY, JSON.stringify({
      mapScale: 'big', mapOffset: { x: 'a' }, controlsUnlinked: 1, logPosition: { top: 10 },
    }));
    const { result } = renderHook(() => useReplayLayout());

    expect(result.current.mapScale).toBe(DEFAULT_MAP_SCALE);
    expect(result.current.mapOffset).toEqual({ x: 0, y: 0 });
    expect(result.current.controlsUnlinked).toBe(false);
    expect(result.current.logPosition).toBeNull();
  });
});

describe('usePlayerAreaLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('remembers placement, size, pin and view settings per slot', () => {
    const first = renderHook(() => usePlayerAreaLayout(1));
    act(() => {
      const update = first.result.current[1];
      update({ position: { x: 200, y: 150 }, size: { w: 700, h: 500 } });
      update(prev => ({ pinned: !prev.pinned }));
      update({ trackers: { ...DEFAULT_TRACKER_VIEW, tagsZoom: 1.2, showResources: false } });
      update(prev => ({ sections: { ...prev.sections, Hand: { viewMode: 'stack', cardSize: 90 } } }));
    });
    act(() => { vi.runAllTimers(); });
    first.unmount();

    const [area] = renderHook(() => usePlayerAreaLayout(1)).result.current;
    expect(area.position).toEqual({ x: 200, y: 150 });
    expect(area.size).toEqual({ w: 700, h: 500 });
    expect(area.pinned).toBe(true);
    expect(area.trackers).toEqual({ ...DEFAULT_TRACKER_VIEW, tagsZoom: 1.2, showResources: false });
    expect(area.sections).toEqual({ Hand: { viewMode: 'stack', cardSize: 90 } });

    const [other] = renderHook(() => usePlayerAreaLayout(0)).result.current;
    expect(other.position).toBeNull();
    expect(other.pinned).toBe(false);
  });

  it('drops malformed stored values and keeps areas within reach', () => {
    localStorage.setItem(playerAreaKey(0), JSON.stringify({
      position: { x: 9000, y: -50 },
      size: { w: 10, h: 'tall' },
      pinned: 'yes',
      trackers: { resourcesZoom: 5, showTags: false },
      sections: { Hand: { viewMode: 'carousel', cardSize: 1000 }, Sold: 'hidden' },
    }));
    const [area] = renderHook(() => usePlayerAreaLayout(0)).result.current;

    expect(area.position!.x).toBeLessThan(window.innerWidth);
    expect(area.position!.y).toBe(0);
    expect(area.size).toBeNull();
    expect(area.pinned).toBe(false);
    expect(area.trackers).toEqual({ ...DEFAULT_TRACKER_VIEW, resourcesZoom: 1.4, showTags: false });
    expect(area.sections).toEqual({ Hand: { cardSize: 180 } });
  });

  it('keeps an area placed below the fold there, since the page scrolls down to it', () => {
    const below = window.innerHeight + 500;
    localStorage.setItem(playerAreaKey(0), JSON.stringify({ position: { x: 100, y: below } }));
    const [area] = renderHook(() => usePlayerAreaLayout(0)).result.current;

    expect(area.position).toEqual({ x: 100, y: below });
  });
});
