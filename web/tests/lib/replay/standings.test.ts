import { describe, it, expect } from 'vitest';
import { getMapOverlays, type MilestoneAwardOverlay } from '@/data/mapOverlays';
import { computeStandings } from '@/lib/replayUtils';
import { buildBgaTimeline } from '@/lib/replay/bga/bgaAdapter';
import { TEST_LOGS, testdataAvailable, loadTestLog, sampledSteps } from './testLogs';

// Milestone and award scores as the viewer computed them straight from BGA tracker names, before the
// scorers moved to the view model. The standings must not change for any of them.
type Trackers = Record<string, number>;
const tag = (name: string) => (t: Trackers) => Math.max(t[`${name} tag`] ?? 0, t[`Count of ${name} tags`] ?? 0);
const wild = (t: Trackers) => t['Wild tag'] ?? t['Count of Wild tags'] ?? 0;
const sum = (...keys: string[]) => (t: Trackers) => keys.reduce((total, k) => total + (t[k] ?? 0), 0);
const PRODUCTION = ['M€ Production', 'Steel Production', 'Titanium Production', 'Plant Production', 'Energy Production', 'Heat Production'];
const DIVERSIFIER_TAGS = ['Building', 'Space', 'Science', 'Earth', 'Jovian', 'City', 'Plant', 'Microbe', 'Animal'];

const SCORE_FROM_TRACKERS: Record<string, (t: Trackers) => number> = {
  Builder: t => tag('Building')(t) + wild(t),
  Banker: sum('M€ Production'),
  Scientist: tag('Science'),
  Thermalist: sum('Heat'),
  Miner: sum('Steel', 'Titanium'),
  Diversifier: t => Math.min(
    DIVERSIFIER_TAGS.filter(name => tag(name)(t) > 0).length
      + ((t['Energy tag'] ?? t['Count of Power tags'] ?? 0) > 0 ? 1 : 0)
      + wild(t),
    10,
  ),
  Energizer: sum('Energy Production'),
  'Rim Settler': t => tag('Jovian')(t) + wild(t),
  'Space Baron': tag('Space'),
  Contractor: tag('Building'),
  Eccentric: () => 0,
  Generalist: t => PRODUCTION.filter(k => (t[k] ?? 0) >= 1).length,
  Specialist: t => Math.max(...PRODUCTION.map(k => t[k] ?? 0)),
  Ecologist: t => tag('Plant')(t) + tag('Microbe')(t) + tag('Animal')(t) + wild(t),
  Industrialist: sum('Steel', 'Energy'),
  Agronomist: t => tag('Plant')(t) + wild(t),
  Engineer: sum('Heat Production', 'Energy Production'),
  Spacefarer: t => tag('Space')(t) + wild(t),
  Traveller: t => tag('Jovian')(t) + tag('Earth')(t) + wild(t),
  Blacksmith: sum('Steel Production', 'Titanium Production'),
};

const MAPS = ['Tharsis', 'Hellas', 'Elysium', 'Vastitas Borealis'];

describe.skipIf(!testdataAvailable)('computeStandings', () => {
  it('scores every tracker-based milestone and award as it did from BGA trackers', () => {
    const items: MilestoneAwardOverlay[] = MAPS.flatMap(map => {
      const overlays = getMapOverlays(map);
      return [...(overlays.milestones ?? []), ...(overlays.awards ?? [])];
    });
    const covered = items.filter(item => SCORE_FROM_TRACKERS[item.name]);
    expect(covered.map(i => i.name).sort()).toEqual(Object.keys(SCORE_FROM_TRACKERS).sort());

    for (const { file } of TEST_LOGS) {
      const log = loadTestLog(file);
      const timeline = buildBgaTimeline(log);
      for (const step of sampledSteps(log)) {
        const trackers = log.moves[step].game_state?.player_trackers;
        if (!trackers) continue;
        const ctx = { players: timeline.info.players, snapshot: timeline.snapshotAt(step) };

        for (const item of covered) {
          const expected = Object.fromEntries(
            timeline.info.players.map(p => [p.name, SCORE_FROM_TRACKERS[item.name](trackers[p.id])]),
          );
          const actual = Object.fromEntries(computeStandings(item, ctx).map(s => [s.name, s.score]));
          expect(actual, `${item.name} in ${file} at step ${step}`).toEqual(expected);
        }
      }
    }
  });

  it('scores rating, tile and hand based milestones from the snapshot', () => {
    const log = loadTestLog(TEST_LOGS[1].file);
    const timeline = buildBgaTimeline(log);
    const ctx = { players: timeline.info.players, snapshot: timeline.snapshotAt(200) };
    const tharsis = getMapOverlays('Tharsis');
    const score = (name: string) => {
      const item = [...tharsis.milestones!, ...tharsis.awards!].find(i => i.name === name)!;
      return Object.fromEntries(computeStandings(item, ctx).map(s => [s.name, s.score]));
    };

    expect(score('Terraformer')).toEqual({ StrandedKnight: 22, cdman234: 29 });
    expect(score('Mayor')).toEqual({ StrandedKnight: 2, cdman234: 1 });
    expect(score('Gardener')).toEqual({ StrandedKnight: 1, cdman234: 0 });
    expect(score('Landlord')).toEqual({ StrandedKnight: 4, cdman234: 4 });
    expect(score('Planner')).toEqual({ StrandedKnight: 14, cdman234: 10 });
  });

  it('orders standings by score, highest first', () => {
    const log = loadTestLog(TEST_LOGS[1].file);
    const timeline = buildBgaTimeline(log);
    const ctx = { players: timeline.info.players, snapshot: timeline.snapshotAt(200) };
    const terraformer = getMapOverlays('Tharsis').milestones!.find(m => m.name === 'Terraformer')!;

    expect(computeStandings(terraformer, ctx).map(s => s.name)).toEqual(['cdman234', 'StrandedKnight']);
  });
});
