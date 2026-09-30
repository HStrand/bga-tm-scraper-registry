import fs from 'node:fs';
import path from 'node:path';
import type { GameLog } from '@/types/gamelog';

// Real scraped game logs. The testdata folder is not checked in, so suites that need it skip when it is absent.
const TESTDATA_DIR = path.resolve(__dirname, '../../../../testdata');

export const GOLDEN_DIR = path.resolve(__dirname, '__goldens__');

export const TEST_LOGS = [
  { name: 'vastitas-2p', file: 'game_829956648_86296239.json' },
  { name: 'elysium-2p', file: 'game_824655675_86296239_test_compact.json' },
  { name: 'tharsis-2p-old-format', file: '691299249.json' },
] as const;

export const testdataAvailable = TEST_LOGS.every(l => fs.existsSync(path.join(TESTDATA_DIR, l.file)));

const cache = new Map<string, GameLog>();

export function loadTestLog(file: string): GameLog {
  let log = cache.get(file);
  if (!log) {
    log = JSON.parse(fs.readFileSync(path.join(TESTDATA_DIR, file), 'utf-8')) as GameLog;
    cache.set(file, log);
  }
  return log;
}

/** First, last, and every 40th move. */
export function sampledSteps(log: GameLog): number[] {
  const last = log.moves.length - 1;
  const steps: number[] = [];
  for (let i = 0; i < last; i += 40) steps.push(i);
  steps.push(last);
  return steps;
}

/**
 * Maps and Sets as plain JSON. Entries keep their insertion order, which the viewer depends on
 * (tile draw order, player order), so the goldens pin it.
 */
export function toPlain(value: unknown): unknown {
  if (value instanceof Map) return { $map: Array.from(value.entries()).map(([k, v]) => [k, toPlain(v)]) };
  if (value instanceof Set) return { $set: Array.from(value.values()).map(toPlain) };
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

export function goldenJson(value: unknown): string {
  return JSON.stringify(toPlain(value), null, 1) + '\n';
}
