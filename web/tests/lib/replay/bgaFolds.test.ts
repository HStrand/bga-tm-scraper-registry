import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { assignPlayerColors } from '@/lib/gameLog';
import { parseMilestonesAndAwards } from '@/lib/replayUtils';
import {
  foldPlacedTiles, countPlayerTiles, computeGenerationBoundaries, collectPlayerPreludeNames, foldPlayerTableaux,
  buildStartingHandData, buildDraftData, foldActivatedCards, foldDiscardPile, detectMissingFeatures, resolveReplayStep,
} from '@/lib/replay/bga/folds';
import { TEST_LOGS, GOLDEN_DIR, testdataAvailable, loadTestLog, sampledSteps, goldenJson } from './testLogs';

// Goldens for the derivations the replay page shows at a given step. They were recorded from the code as it
// was lifted out of GameReplayPage, so any change here is a change in what the replay viewer displays.
describe.skipIf(!testdataAvailable)('BGA replay folds', () => {
  for (const { name, file } of TEST_LOGS) {
    it(`match the recorded goldens for ${name}`, async () => {
      const log = loadTestLog(file);
      const playerColors = assignPlayerColors(Object.keys(log.players), log.players);
      const generationBoundaries = computeGenerationBoundaries(log);
      const playerPreludeNames = collectPlayerPreludeNames(log);

      const steps = sampledSteps(log).map(step => {
        const placedTiles = foldPlacedTiles(log, step);
        return {
          step,
          placedTiles,
          playerTileCounts: countPlayerTiles(placedTiles),
          milestonesAndAwards: parseMilestonesAndAwards(log.moves, step),
          playerTableaux: foldPlayerTableaux(log, step, playerPreludeNames),
          startingHandData: buildStartingHandData(log, step, playerColors),
          draftData: buildDraftData(log, step, playerColors),
          activatedCards: foldActivatedCards(log, step, generationBoundaries),
          discardPile: foldDiscardPile(log, step),
        };
      });

      const golden = {
        playerColors,
        generationBoundaries,
        playerPreludeNames,
        missingFeatures: detectMissingFeatures(log),
        steps,
      };

      await expect(goldenJson(golden)).toMatchFileSnapshot(path.join(GOLDEN_DIR, `${name}.folds.json`));
    });
  }

  it('resolveReplayStep skips game_state_change moves in the direction of travel', () => {
    const log = loadTestLog(TEST_LOGS[1].file);
    const index = log.moves.findIndex((m, i) => i > 0 && m.action_type === 'game_state_change'
      && log.moves[i - 1].action_type !== 'game_state_change' && log.moves[i + 1]?.action_type !== 'game_state_change');
    expect(index).toBeGreaterThan(0);

    expect(resolveReplayStep(log, index, 'forward')).toBe(index + 1);
    expect(resolveReplayStep(log, index, 'backward')).toBe(index - 1);
    expect(resolveReplayStep(log, index)).toBe(index - 1);
    expect(resolveReplayStep(log, index - 1, 'forward')).toBe(index - 1);
    expect(resolveReplayStep(log, -5)).toBe(0);
    expect(resolveReplayStep(log, log.moves.length + 5)).toBeLessThan(log.moves.length);
  });
});
