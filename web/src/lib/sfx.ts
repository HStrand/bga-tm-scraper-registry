// Small synthesized sound effects for the replay viewer and the play view. Everything is generated with the
// Web Audio API, so there are no sound files to load; without an AudioContext (old browsers, tests) every call
// is a no-op. Whether sound is on and how loud is remembered in localStorage and shared by both views.

import { useSyncExternalStore } from 'react';

export type SoundName =
  | 'card'      // a card is played: a short swish
  | 'deal'      // cards are drawn: one swish per card
  | 'click'     // a small action: activating a card, picking a draft card
  | 'tile'      // a tile lands on the board
  | 'ocean'     // an ocean tile lands: thump plus a splash
  | 'chime'     // terraform rating goes up
  | 'claim'     // a milestone is claimed or an award funded
  | 'coin'      // money changes hands
  | 'turn'      // a new generation begins
  | 'bad'       // the engine refused a move
  | 'fanfare';  // the game is over

export interface SfxSettings {
  on: boolean;
  /** 0 to 1. */
  volume: number;
}

const STORAGE_KEY = 'tfmstats.sfx';
const DEFAULTS: SfxSettings = { on: true, volume: 0.6 };

let settings: SfxSettings = load();
const listeners = new Set<() => void>();

function load(): SfxSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SfxSettings>;
    return {
      on: typeof parsed.on === 'boolean' ? parsed.on : DEFAULTS.on,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULTS.volume,
    };
  } catch {
    return DEFAULTS;
  }
}

export function getSfxSettings(): SfxSettings {
  return settings;
}

export function setSfxSettings(next: Partial<SfxSettings>) {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or storage blocked: the choice lasts for this page only.
  }
  listeners.forEach(l => l());
}

/** The current sound settings, re-rendering when they change anywhere on the page. */
export function useSfxSettings(): SfxSettings {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSfxSettings,
    getSfxSettings,
  );
}

// --- synthesis ---

type Ctx = AudioContext;

let ctx: Ctx | null | undefined;
let master: GainNode | null = null;

function context(): Ctx | null {
  if (ctx !== undefined) return ctx;
  const Ctor = typeof window !== 'undefined'
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined;
  if (!Ctor) {
    ctx = null;
    return null;
  }
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.connect(ctx.destination);
    // Browsers start the context suspended until the page has been interacted with; any click or key wakes it.
    const unlock = () => { void ctx?.resume(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  } catch {
    ctx = null;
  }
  return ctx;
}

// --- clips ---

// A recorded clip at web/public/sfx/<name>.ogg or .mp3 replaces the synthesized sound of that name. Each is
// fetched the first time it is needed and kept decoded; a name with no file falls back to synthesis for good.
const CLIP_BASE = '/sfx/';
const CLIP_FORMATS = ['ogg', 'mp3'];
const clips = new Map<SoundName, Promise<AudioBuffer | null>>();

async function fetchClip(c: Ctx, name: SoundName): Promise<AudioBuffer | null> {
  for (const format of CLIP_FORMATS) {
    try {
      const res = await fetch(`${CLIP_BASE}${name}.${format}`);
      // The dev server answers a missing file with the app's HTML, so the type matters as much as the status.
      if (!res.ok || !/audio|ogg|mpeg|octet-stream/i.test(res.headers.get('content-type') ?? '')) continue;
      return await c.decodeAudioData(await res.arrayBuffer());
    } catch {
      // Try the next format, or fall back to synthesis.
    }
  }
  return null;
}

function clip(c: Ctx, name: SoundName): Promise<AudioBuffer | null> {
  let pending = clips.get(name);
  if (!pending) {
    pending = fetchClip(c, name);
    clips.set(name, pending);
  }
  return pending;
}

function playClip(c: Ctx, out: AudioNode, buffer: AudioBuffer, at: number) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  // Recorded clips are normalized, so they come in quieter than the synthesized sounds, which peak high.
  const level = c.createGain();
  level.gain.value = 1.6;
  src.connect(level).connect(out);
  src.start(at);
}

/** Play a sound now, or after a short delay so that several sounds in one move do not land on top of each other. */
export function playSound(name: SoundName, delayMs = 0) {
  if (!settings.on || settings.volume <= 0) return;
  const c = context();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume();
  // Loud enough to notice, quiet enough to leave on.
  master.gain.value = settings.volume * 0.45;
  const out = master;
  const at = c.currentTime + delayMs / 1000;
  void clip(c, name).then(buffer => {
    try {
      // The first play of a clip waits for its download; later ones are on time.
      if (buffer) playClip(c, out, buffer, Math.max(at, c.currentTime));
      else SOUNDS[name](c, out, Math.max(at, c.currentTime));
    } catch {
      // A sound that fails to schedule is not worth an error.
    }
  });
}

/** Short, decaying tone. */
function tone(c: Ctx, out: AudioNode, at: number, opts: {
  type: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  gain: number;
  attack?: number;
}) {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, at);
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.to, at + opts.duration);
  const attack = opts.attack ?? 0.005;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(opts.gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + opts.duration);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + opts.duration + 0.02);
}

let noiseBuffer: AudioBuffer | null = null;

/** Filtered white noise burst. */
function noise(c: Ctx, out: AudioNode, at: number, opts: {
  duration: number;
  gain: number;
  filter: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
  attack?: number;
}) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = opts.filter;
  filter.Q.value = opts.q ?? 1;
  filter.frequency.setValueAtTime(opts.from, at);
  if (opts.to !== undefined) filter.frequency.exponentialRampToValueAtTime(opts.to, at + opts.duration);
  const env = c.createGain();
  const attack = opts.attack ?? 0.01;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(opts.gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + opts.duration);
  src.connect(filter).connect(env).connect(out);
  src.start(at);
  src.stop(at + opts.duration + 0.02);
}

/** A card sliding across the table: a swell of airy noise that falls in pitch as it fades. */
function swish(c: Ctx, out: AudioNode, at: number, gain = 1.4) {
  noise(c, out, at, { duration: 0.28, gain, filter: 'bandpass', from: 5500, to: 1400, q: 0.5, attack: 0.08 });
  noise(c, out, at + 0.02, { duration: 0.22, gain: gain * 0.5, filter: 'highpass', from: 6000, to: 2500, attack: 0.06 });
}

function thump(c: Ctx, out: AudioNode, at: number) {
  tone(c, out, at, { type: 'triangle', from: 150, to: 45, duration: 0.18, gain: 0.9 });
  noise(c, out, at, { duration: 0.05, gain: 0.35, filter: 'lowpass', from: 1500, to: 300 });
}

function arpeggio(c: Ctx, out: AudioNode, at: number, notes: number[], gap: number, duration: number, gain: number, type: OscillatorType = 'sine') {
  notes.forEach((f, i) => tone(c, out, at + i * gap, { type, from: f, duration, gain }));
}

const SOUNDS: Record<SoundName, (c: Ctx, out: AudioNode, at: number) => void> = {
  card: (c, out, at) => swish(c, out, at),
  deal: (c, out, at) => {
    swish(c, out, at, 1.1);
    swish(c, out, at + 0.12, 0.8);
  },
  click: (c, out, at) => {
    tone(c, out, at, { type: 'square', from: 1800, duration: 0.03, gain: 0.12 });
  },
  tile: (c, out, at) => thump(c, out, at),
  ocean: (c, out, at) => {
    thump(c, out, at);
    noise(c, out, at + 0.05, { duration: 0.45, gain: 0.3, filter: 'lowpass', from: 1400, to: 250, attack: 0.04 });
  },
  // One soft bell: a fundamental with a quiet fifth above it, no melody to tire of.
  chime: (c, out, at) => {
    tone(c, out, at, { type: 'sine', from: 1047, duration: 0.5, gain: 0.22, attack: 0.01 });
    tone(c, out, at, { type: 'sine', from: 1568, duration: 0.3, gain: 0.07, attack: 0.01 });
    tone(c, out, at, { type: 'triangle', from: 2093, duration: 0.12, gain: 0.04, attack: 0.005 });
  },
  claim: (c, out, at) => arpeggio(c, out, at, [523, 784], 0.1, 0.5, 0.3, 'triangle'),
  coin: (c, out, at) => {
    tone(c, out, at, { type: 'square', from: 1320, duration: 0.05, gain: 0.1 });
    tone(c, out, at + 0.06, { type: 'square', from: 1760, duration: 0.09, gain: 0.1 });
  },
  turn: (c, out, at) => {
    tone(c, out, at, { type: 'sine', from: 440, to: 660, duration: 0.22, gain: 0.3, attack: 0.03 });
  },
  bad: (c, out, at) => {
    tone(c, out, at, { type: 'sawtooth', from: 180, to: 120, duration: 0.2, gain: 0.18 });
  },
  fanfare: (c, out, at) => {
    arpeggio(c, out, at, [523, 659, 784], 0.13, 0.35, 0.3, 'triangle');
    tone(c, out, at + 0.39, { type: 'triangle', from: 1047, duration: 0.9, gain: 0.35, attack: 0.02 });
  },
};
