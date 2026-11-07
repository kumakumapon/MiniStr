import { appendFileSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { chooseCpuAction } from '../src/ai/rules';
import { maps, operationScenarios, createScenarioInitialState, type ScenarioDefinition } from '../src/game/maps';
import { evaluationScenario, profiles, type Profile } from './tacticsV151Scenario';
import { applyGameCommand, type GameCommand } from '../src/game/session';
import { isGameOver, type GameState } from '../src/game/types';
import { victoryReason } from '../src/game/victory';
import { TacticalMetrics } from './tacticalMetrics';

const phase = process.argv[2] ?? 'playthrough';
if (!['playthrough', 'balance'].includes(phase)) throw Error('Expected playthrough or balance');
const output = `docs/reviews/v1.5.1/${phase}.jsonl`;
writeFileSync(output, '');
const emit = (row: unknown) => {
  appendFileSync(output, JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
};
const all = [...maps, ...operationScenarios];
const histories: Record<string, GameCommand[]> = {};
const sourceHash = createHash('sha256');
for (const dir of ['src/game', 'src/ai'])
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.ts') && !n.includes('.test.') && !n.includes('.fixture.'))
    .sort())
    sourceHash.update(`${dir}/${name}\n`).update(readFileSync(`${dir}/${name}`));
const source = sourceHash.digest('hex');
emit({
  format: 'tactics-v151-v1',
  phase,
  source,
  runtime: process.version,
  scriptSHA256: createHash('sha256').update(readFileSync('scripts/tactics-v151.ts')).update(readFileSync('scripts/tacticsV151Scenario.ts')).digest('hex'),
  seedPolicy: '15101 exploratory, 15102 confirmation; no AI or map tuning based on either sample',
  catalog: all.map((m) => m.id),
  note: 'OFF uses v14 with the original layout. Rules-only enables combined tactics without revising terrain. Default enables combined tactics and Tactical v2 layout. Return legs exchange armies, goals and first-player roles; pairs are correlated, not independent win-rate samples. Per-game cap 120 rounds, 15000 commands and 120 seconds.',
});
function play(map: ScenarioDefinition, profile: Profile, difficulty: 'normal' | 'hard', opponent: 'easy' | 'normal', seed?: number, swap = false) {
  const definition = evaluationScenario(map, profile, seed, swap);
  let state: GameState = { ...createScenarioInitialState(definition), ruleVersion: 14 };
  const resolvedSeed = state.rngSeed;
  const metrics = new TacticalMetrics(state),
    digest = createHash('sha256'),
    began = performance.now();
  const commands: GameCommand[] = [];
  while (!isGameOver(state) && state.turn <= 120 && commands.length < 15000 && performance.now() - began < 120000) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? difficulty : opponent);
    const result = applyGameCommand(state, command);
    if (!result.ok) throw Error(`${map.id}/${profile}/${command.type}: ${result.error}`);
    metrics.observe(state, result.value, command);
    digest.update(JSON.stringify(command) + '\n');
    commands.push(command);
    state = result.value;
  }
  const key = `${map.id}/${profile}/${difficulty}:${opponent}/${seed ?? 'authored'}/${swap ? 'return' : 'outbound'}`;
  histories[key] = commands;
  emit({
    key,
    id: map.id,
    profile,
    difficulty,
    opponent,
    seed: resolvedSeed,
    weatherSeed: state.tactics?.weatherSeed,
    swap,
    width: state.board.width,
    height: state.board.height,
    winner: state.winner ?? (state.draw ? 'draw' : 'undecided'),
    reason: state.winner ? victoryReason(state, definition) : state.draw ? 'draw' : 'evaluation-limit',
    turns: state.turn,
    commands: commands.length,
    digest: digest.digest('hex'),
    milliseconds: performance.now() - began,
    metrics: metrics.summary(),
  });
}
if (phase === 'playthrough') for (const map of all) for (const profile of ['off', 'default'] as const) play(map, profile, 'hard', 'easy');
if (phase === 'balance')
  for (const id of ['skirmish', 'river', 'admiralty'])
    for (const seed of [15101, 15102])
      for (const profile of profiles)
        for (const swap of [false, true])
          play(
            all.find((m) => m.id === id)!,
            profile,
            'normal',
            'normal',
            seed,
            swap,
          );
writeFileSync(`docs/reviews/v1.5.1/${phase}.commands.json.gz`, gzipSync(JSON.stringify(histories)));
