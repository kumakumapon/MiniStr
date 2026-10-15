import { beforeAll, describe, expect, it } from 'vitest';
import { playCampaignStage } from '../../scripts/campaignHarness';
import {
  campaignStages,
  createCampaignProgress,
  isCampaignProgress,
  isDeployedUnit,
  movementCost,
  parseReplay,
  scenarioById,
  scenarioForState,
  type CampaignProgress,
} from './index';

const initialProgress = createCampaignProgress('2026-10-15T00:00:00.000Z');
const runs: { before: CampaignProgress; result: ReturnType<typeof playCampaignStage> }[] = [];
const originalMaps = campaignStages.map((stage) => structuredClone(scenarioById(stage.scenarioId)!));
beforeAll(() => {
  let progress = structuredClone(initialProgress);
  for (const stage of campaignStages) {
    const before = structuredClone(progress);
    const result = playCampaignStage(progress, stage, 'normal');
    expect(progress).toEqual(before);
    runs.push({ before, result });
    progress = result.progress;
  }
}, 60_000);

describe('campaign reference playthrough', () => {
  it('also clears the easy campaign with its own earned grades and survivors', () => {
    let progress = structuredClone(initialProgress);
    for (const stage of campaignStages) {
      const result = playCampaignStage(progress, stage, 'easy');
      expect(result.summary.winner, stage.scenarioId).toBe('red');
      expect(result.progress.bestGrades[stage.scenarioId]).toBe(result.summary.grade);
      expect(isCampaignProgress(result.progress)).toBe(true);
      progress = result.progress;
    }
    expect(Object.keys(progress.bestGrades)).toHaveLength(10);
  }, 60_000);

  it('wins all ten normal operations in order with real grades and veteran carryover', () => {
    let progress: CampaignProgress = structuredClone(initialProgress);
    for (const [index, stage] of campaignStages.entries()) {
      const { before, result } = runs[index]!;
      expect(progress).toEqual(before);
      expect(result.summary.winner, stage.scenarioId).toBe('red');
      expect(result.summary.blueMoves, stage.scenarioId).toBeGreaterThan(0);
      expect(result.summary.blueAttacks, stage.scenarioId).toBeGreaterThan(0);
      expect(result.summary.turns, stage.scenarioId).toBeLessThanOrEqual(result.initialState.scenarioSnapshot?.turnLimit ?? 21);
      expect(parseReplay(result.replay).ok, `${stage.scenarioId} replay`).toBe(true);
      expect(result.progress.bestGrades[stage.scenarioId]).toBe(result.summary.grade);
      expect(result.progress.veteransByScenario?.[stage.scenarioId]?.length).toBeGreaterThan(0);
      expect(isCampaignProgress(result.progress)).toBe(true);
      expect(progress).toEqual(before);
      if (stage.scenarioId !== 'skirmish') {
        expect(result.summary.support).toBeGreaterThan(0);
        expect(result.summary.deployedVeterans).toBeGreaterThan(0);
      }
      progress = result.progress;
    }
    expect(Object.keys(progress.bestGrades)).toHaveLength(10);
    expect(progress.unlockedScenarioIds).toEqual(campaignStages.map((stage) => stage.scenarioId));
  }, 60_000);

  it('authors legal unique deployments and ground objectives without mutating skirmish maps', () => {
    for (const [index, stage] of campaignStages.entries()) {
      const base = scenarioById(stage.scenarioId)!;
      const operation = scenarioForState(runs[index]!.result.initialState)!;
      const positions = operation.initialUnits.map((unit) => `${unit.x},${unit.y}`);
      expect(new Set(positions).size).toBe(positions.length);
      for (const unit of operation.initialUnits) expect(Number.isFinite(movementCost(operation.board, unit, unit.kind))).toBe(true);
      for (const condition of operation.victoryConditions) if (condition.type === 'hold') expect(condition.groundOnly).toBe(true);
      expect(base).toEqual(originalMaps[index]);
    }
  }, 60_000);

  it('places landing ports on the coast and retains enemy ground and air reinforcement sites', () => {
    const { result } = runs[7]!;
    const board = result.initialState.board;
    for (const [x, y] of [
      [4, 3],
      [13, 4],
    ]) {
      expect(board.terrain[y!]![x!]!.kind).toBe('port');
      expect(
        [
          [x! - 1, y!],
          [x! + 1, y!],
          [x!, y! - 1],
          [x!, y! + 1],
        ].some(([nx, ny]) => board.terrain[ny!]?.[nx!]?.kind === 'sea'),
      ).toBe(true);
    }
    expect(board.terrain[7]![17]).toMatchObject({ kind: 'factory', owner: 'blue' });
    expect(board.terrain[8]![15]).toMatchObject({ kind: 'airport', owner: 'blue' });
    expect(result.commands.some((command) => command.type === 'embark')).toBe(true);
    expect(result.commands.some((command) => command.type === 'disembark')).toBe(true);
    expect(result.finalState.units.some((unit) => unit.owner === 'red' && isDeployedUnit(unit) && unit.position.x >= 13)).toBe(true);
  }, 60_000);
});
