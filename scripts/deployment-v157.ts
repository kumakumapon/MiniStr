import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { chooseCpuAction } from '../src/ai/rules';
import { createPositionedDeploymentScenario, defaultDeploymentPlacements, supportsDeploymentPositions } from '../src/game/deploymentPositions';
import { deploymentSlots } from '../src/game/deployment';
import { createScenarioInitialState, maps, operationScenarios, type ScenarioDefinition } from '../src/game/maps';
import { createReplay, parseReplay } from '../src/game/replay';
import { applyGameCommand, type GameCommand } from '../src/game/session';
import { tacticalScenario } from '../src/game/tacticalMaps';
import { isGameOver, type GameState } from '../src/game/types';
import { victoryReason } from '../src/game/victory';
import { evaluationScenario } from './tacticsV151Scenario';
import { TacticalMetrics } from './tacticalMetrics';

const [phase, output] = process.argv.slice(2);
if (!['catalog', 'layouts'].includes(phase ?? '') || !output) throw Error('Usage: catalog|layouts output.jsonl');
mkdirSync(dirname(output), { recursive: true });
const source = createHash('sha256');
for (const folder of ['src/game', 'src/ai'])
  for (const name of readdirSync(folder)
    .filter((name) => name.endsWith('.ts') && !name.includes('.test.') && !name.includes('.fixture.'))
    .sort())
    source.update(folder + '/' + name + '\n').update(readFileSync(folder + '/' + name));
writeFileSync(
  output,
  JSON.stringify({
    format: 'deployment-v157-v1',
    phase,
    sourceSha256: source.digest('hex'),
    harnessSha256: createHash('sha256')
      .update(readFileSync(new URL(import.meta.url)))
      .digest('hex'),
    node: process.version,
    rounds: 120,
    commandLimit: 15000,
    secondsPerGame: 120,
    note: 'Authored defaults compared with v1.5.6. Layouts fixed before seeds15711/15712, normal:normal, paired army/configuration rotation. Correlated cases, not an independent win-rate estimate. Opening grants remain tied to first/second turn order.',
  }) + '\n',
);
const value = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw Error(result.error);
  return result.value;
};
let count = 0;
function play(map: ScenarioDefinition, profile: 'off' | 'default', layout: string, seed?: number, swap = false) {
  const scenario = evaluationScenario(map, 'off', seed, swap);
  const initial: GameState = { ...createScenarioInitialState(scenario), ruleVersion: 14 };
  let state = initial;
  const metrics = new TacticalMetrics(initial),
    digest = createHash('sha256'),
    began = performance.now();
  const commands: GameCommand[] = [];
  while (!isGameOver(state) && state.turn <= 120 && commands.length < 15000 && performance.now() - began < 120000) {
    const command = chooseCpuAction(state, phase === 'catalog' ? (state.activePlayer === 'red' ? 'hard' : 'easy') : 'normal');
    const next = value(applyGameCommand(state, command));
    metrics.observe(state, next, command);
    digest.update(JSON.stringify(command) + '\n');
    commands.push(command);
    state = next;
  }
  let replayVerified = false;
  if (phase === 'layouts' && layout === 'front-both' && seed === 15711 && !swap && isGameOver(state)) {
    const file = value(createReplay({ mapId: scenario.id, difficulty: 'normal', initialState: initial, commands }));
    value(parseReplay(JSON.stringify(file)));
    replayVerified = true;
  }
  const key = phase === 'catalog' ? `${map.id}/${profile}/hard:easy/authored/outbound` : `${map.id}/${profile}/${layout}/${seed}/${swap ? 'return' : 'outbound'}`;
  appendFileSync(
    output!,
    JSON.stringify({
      key,
      profile,
      layout,
      seed: seed ?? 'authored',
      swap,
      winner: state.winner ?? (state.draw ? 'draw' : 'undecided'),
      reason: state.winner ? victoryReason(state, scenario) : state.draw ? 'draw' : 'evaluation-limit',
      turns: state.turn,
      commands: commands.length,
      commandSha256: digest.digest('hex'),
      initialStateSha256: createHash('sha256').update(JSON.stringify(initial)).digest('hex'),
      milliseconds: performance.now() - began,
      replayVerified,
      metrics: metrics.summary(),
    }) + '\n',
  );
  console.log(`${phase}: ${++count} ${key} ${state.winner ?? (state.draw ? 'draw' : 'undecided')} T${state.turn}`);
}

for (const sourceMap of phase === 'catalog' ? [...maps, ...operationScenarios] : [maps.find((map) => map.id === 'canyon')!])
  for (const profile of ['off', 'default'] as const) {
    const base = profile === 'off' ? sourceMap : tacticalScenario(sourceMap);
    const choices = { red: deploymentSlots(base).map((slot) => slot.kind), blue: deploymentSlots(base, 'blue').map((slot) => slot.kind) };
    for (const layout of phase === 'catalog' ? ['default'] : ['default', 'front-both', 'rear-both', 'spread-both', 'front-red', 'front-blue']) {
      const positions = defaultDeploymentPlacements(base);
      for (const player of ['red', 'blue'] as const) {
        if (layout === 'default' || (layout === 'front-red' && player === 'blue') || (layout === 'front-blue' && player === 'red')) continue;
        const red =
          layout === 'rear-both'
            ? [1, 2, 3, 4].map((y) => ({ x: 0, y }))
            : layout === 'spread-both'
              ? [
                  { x: 3, y: 4 },
                  { x: 0, y: 1 },
                  { x: 3, y: 2 },
                  { x: 0, y: 4 },
                ]
              : [1, 2, 3, 4].map((y) => ({ x: 3, y }));
        positions[player] = [...red.map((p) => (player === 'red' ? p : { x: base.board.width - 1 - p.x, y: base.board.height - 1 - p.y })), positions[player][4]!];
      }
      const prepared = supportsDeploymentPositions(base) ? value(createPositionedDeploymentScenario(base, choices, positions, ['red', 'blue'])) : base;
      if (phase === 'catalog') play(prepared, profile, layout);
      else for (const seed of [15711, 15712]) for (const swap of [false, true]) play(prepared, profile, layout, seed, swap);
    }
  }
