import { expect, it } from 'vitest';
import { playCampaignStage } from '../../scripts/campaignHarness';
import { campaignStages, createCampaignProgress, parseCampaignProgress } from './campaign';

const routes = [
  ['skirmish', 'islands', 'siege', 'river', 'tundra', 'outpost', 'industrial', 'marsh'],
  ['skirmish', 'canyon', 'siege', 'river', 'tundra', 'landing', 'industrial', 'marsh'],
  ['skirmish', 'islands', 'siege', 'river', 'tundra', 'landing', 'industrial', 'marsh'],
  ['skirmish', 'canyon', 'siege', 'river', 'tundra', 'outpost', 'industrial', 'marsh'],
];

it.each(routes.map((route) => [route.join('/'), route] as const))(
  'clears branching route %s with earned survivors and support',
  (_name, route) => {
    let progress = createCampaignProgress();
    for (const id of route) {
      const before = structuredClone(progress);
      const result = playCampaignStage(
        progress,
        campaignStages.find((stage) => stage.scenarioId === id)!,
        'normal',
      );
      expect(progress).toEqual(before);
      expect(result.finalState.winner, id).toBe('red');
      expect(result.finalState.turn, id).toBeLessThanOrEqual(80);
      progress = result.progress;
      expect(parseCampaignProgress(JSON.stringify(progress)).ok, id).toBe(true);
      expect(progress.veteransByScenario?.[id]?.every((unit) => typeof unit.callsign === 'string')).toBe(true);
    }
    expect(progress.bestGrades.marsh).toBeDefined();
  },
  120_000,
);
