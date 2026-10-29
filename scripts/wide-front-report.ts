import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { chooseCpuAction, type CpuDifficulty } from '../src/ai/rules';
import { createScenarioInitialState, scenarioById } from '../src/game/maps';
import { applyGameCommand } from '../src/game/session';
import { victoryReason } from '../src/game/victory';
import type { ArmyPolicy } from '../src/game/armyPolicy';
import { comparisonSourceDigest } from './generatedBalance';

const scenario = scenarioById('wide-front')!;
const matchups: [CpuDifficulty, CpuDifficulty, ArmyPolicy, ArmyPolicy][] = [
  ['normal', 'normal', 'balanced', 'balanced'],
  ['hard', 'easy', 'balanced', 'balanced'],
  ['easy', 'hard', 'balanced', 'balanced'],
  ['normal', 'normal', 'offensive', 'defensive'],
  ['normal', 'normal', 'defensive', 'offensive'],
];
const results = [];
for (const seed of [7, 73])
  for (const [red, blue, redPolicy, bluePolicy] of matchups) {
    let state = { ...createScenarioInitialState(scenario), rngSeed: seed };
    const digest = createHash('sha256');
    let commands = 0;
    while (!state.winner && state.turn <= 90 && commands < 20000) {
      const side = state.activePlayer;
      const command = chooseCpuAction(state, side === 'red' ? red : blue, side, side === 'red' ? redPolicy : bluePolicy);
      const result = applyGameCommand(state, command);
      if (!result.ok) throw Error(result.error);
      digest.update(JSON.stringify(command));
      commands++;
      state = result.value;
    }
    if (!state.winner) throw Error('Wide front did not finish within its documented limit');
    results.push({
      seed,
      red,
      blue,
      redPolicy,
      bluePolicy,
      winner: state.winner,
      reason: victoryReason(state, scenario),
      turns: state.turn,
      commands,
      digest: digest.digest('hex'),
    });
    process.stderr.write(`${seed} ${red}:${blue} ${redPolicy}:${bluePolicy}: ${state.winner} T${state.turn}\n`);
  }
writeFileSync(process.argv[2] ?? '/tmp/ministr-wide-front.json', JSON.stringify({ complete: true, simulationDigest: comparisonSourceDigest(), results }, null, 2));
