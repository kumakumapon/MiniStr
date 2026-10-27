import { writeFileSync } from 'node:fs';
import { createCampaignProgress, campaignStages, createScenarioInitialState, scenarioById, applyGameCommand, victoryReason } from '../src/game';
import { playCampaignStage } from './campaignHarness';
import { chooseCpuAction } from '../src/ai/rules';
import type { ArmyPolicy } from '../src/game/armyPolicy';

const campaigns = [];
for (const route of [
  ['skirmish', 'islands', 'siege', 'river', 'tundra', 'outpost', 'industrial', 'marsh'],
  ['skirmish', 'canyon', 'siege', 'river', 'tundra', 'landing', 'industrial', 'marsh'],
  ['skirmish', 'islands', 'siege', 'river', 'tundra', 'landing', 'industrial', 'marsh'],
  ['skirmish', 'canyon', 'siege', 'river', 'tundra', 'outpost', 'industrial', 'marsh'],
]) {
  let progress = createCampaignProgress();
  for (const id of route) {
    const stage = campaignStages.find((stage) => stage.scenarioId === id)!;
    const result = playCampaignStage(progress, stage, 'normal');
    if (result.finalState.winner !== 'red') throw new Error(`Route failed: ${route.join('/')} at ${id}`);
    campaigns.push({ route: route.join('/'), ...result.summary });
    progress = result.progress;
    console.log(JSON.stringify(campaigns.at(-1)));
  }
}
const policies = [];
for (const id of ['skirmish', 'islands', 'river'])
  for (const seed of [7919, 15838])
    for (const policy of ['offensive', 'defensive'] as const)
      for (const side of ['red', 'blue'] as const) {
        let state = { ...createScenarioInitialState(scenarioById(id)!), rngSeed: seed };
        let commands = 0;
        while (!state.winner && state.turn <= 60 && commands < 10000) {
          const current: ArmyPolicy = state.activePlayer === side ? policy : 'balanced';
          const command = chooseCpuAction(state, 'normal', state.activePlayer, current);
          const next = applyGameCommand(state, command);
          if (!next.ok) throw new Error(next.error);
          state = next.value;
          commands++;
        }
        policies.push({ scenario: id, seed, policy, side, winner: state.winner ?? 'none', turn: state.turn, reason: victoryReason(state), commands });
        console.log(JSON.stringify(policies.at(-1)));
      }
writeFileSync(
  process.argv[2] ?? '/tmp/v110-strategy-evaluation.json',
  JSON.stringify({ baseline: '971ea082651e8c4e0ad1fe818238bc7cba2d0bbd', maxRounds: 60, campaignMaxRounds: 80, campaigns, policies }, null, 2) + '\n',
);
