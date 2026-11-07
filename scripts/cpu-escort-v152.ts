import { appendFileSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { chooseCpuAction, type CpuDifficulty } from '../src/ai/rules';
import { scenarioById, maps, operationScenarios, createScenarioInitialState, type ScenarioDefinition } from '../src/game/maps';
import { evaluationScenario, profiles, type Profile } from '../scripts/tacticsV151Scenario';
import { TacticalMetrics } from '../scripts/tacticalMetrics';
import { applyGameCommand, type GameCommand } from '../src/game/session';
import { isGameOver, type GameState } from '../src/game/types';
import { victoryReason } from '../src/game/victory';
const [stage, phase, output] = process.argv.slice(2);
if (!['before', 'after'].includes(stage ?? '') || !['tune', 'confirm', 'balance', 'catalog'].includes(phase ?? '') || !output)
  throw Error('Usage: before|after tune|confirm|balance|catalog output.jsonl');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, '');
const hash = createHash('sha256');
for (const folder of ['src/game', 'src/ai'])
  for (const name of readdirSync(folder)
    .filter((n) => n.endsWith('.ts') && !n.includes('.test.') && !n.includes('.fixture.'))
    .sort())
    hash.update(`${folder}/${name}\n`).update(readFileSync(`${folder}/${name}`));
const source = hash.digest('hex');
const script = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .update(readFileSync('scripts/tacticsV151Scenario.ts'))
  .update(readFileSync('scripts/tacticalMetrics.ts'))
  .digest('hex');
appendFileSync(
  output,
  JSON.stringify({
    format: 'cpu-escort-v152-v1',
    stage,
    phase,
    source,
    script,
    node: process.version,
    roundLimit: 120,
    commandLimit: 15000,
    secondsLimit: 120,
    seedPolicy: 'tune=authored/15201; confirmation=15211/15212; balance=known15101/confirmation15221. Freeze the candidate before opening confirmation results.',
    note: 'Mission games are asymmetric red objectives, not first/second win-rate samples. Balance return legs exchange armies/goals and are correlated; no independent win-rate claim.',
  }) + '\n',
);
const histories: Record<string, GameCommand[]> = {};
let count = 0;
function play(sourceMap: ScenarioDefinition, profile: Profile, red: CpuDifficulty, blue: CpuDifficulty, seed?: number, swap = false) {
  const map = evaluationScenario(sourceMap, profile, seed, swap);
  const initial: GameState = { ...createScenarioInitialState(map), ruleVersion: 14 };
  let state = initial;
  const metrics = new TacticalMetrics(initial),
    commands: GameCommand[] = [],
    digest = createHash('sha256'),
    began = performance.now();
  const targetIds = [...new Set(map.victoryConditions.flatMap((c) => ('unitIds' in c ? c.unitIds : [])))];
  const lost: { id: string; turn: number; command: number }[] = [];
  while (!isGameOver(state) && state.turn <= 120 && commands.length < 15000 && performance.now() - began < 120000) {
    const c = chooseCpuAction(state, state.activePlayer === 'red' ? red : blue);
    const r = applyGameCommand(state, c);
    if (!r.ok) throw Error(`${map.id}/${c.type}: ${r.error}`);
    for (const id of targetIds)
      if (state.units.some((u) => u.id === id) && !r.value.units.some((u) => u.id === id) && !r.value.evacuatedUnits?.some((u) => u.id === id))
        lost.push({ id, turn: state.turn, command: commands.length });
    metrics.observe(state, r.value, c);
    digest.update(JSON.stringify(c) + '\n');
    commands.push(c);
    state = r.value;
  }
  const key = `${map.id}/${profile}/${red}:${blue}/${seed ?? 'authored'}/${swap ? 'return' : 'outbound'}`;
  histories[key] = commands;
  appendFileSync(
    output!,
    JSON.stringify({
      key,
      id: map.id,
      profile,
      red,
      blue,
      seed: initial.rngSeed,
      seedLabel: seed ?? 'authored',
      weatherSeed: initial.tactics?.weatherSeed,
      swap,
      winner: state.winner ?? (state.draw ? 'draw' : 'undecided'),
      reason: state.winner ? victoryReason(state, map) : state.draw ? 'draw' : 'evaluation-limit',
      turns: state.turn,
      commands: commands.length,
      digest: digest.digest('hex'),
      milliseconds: performance.now() - began,
      mission: {
        targetIds,
        lost,
        evacuated: state.evacuatedUnits?.filter((u) => u.owner === 'red').map((u) => u.id) ?? [],
        survivors: state.units.filter((u) => targetIds.includes(u.id)).map((u) => ({ id: u.id, hp: u.hp, position: u.position })),
      },
      metrics: metrics.summary(),
    }) + '\n',
  );
  console.log(`${stage}/${phase}: ${++count} finished`);
}
if (phase === 'tune' || phase === 'confirm')
  for (const id of ['convoy-escort', 'river-withdrawal', 'fighting-withdrawal', 'encirclement-breakout'])
    for (const seed of phase === 'tune' ? [undefined, 15201] : [15211, 15212])
      for (const [red, blue] of [
        ['normal', 'easy'],
        ['hard', 'easy'],
        ['normal', 'normal'],
        ['hard', 'normal'],
      ] as const)
        play(scenarioById(id)!, 'default', red, blue, seed);
if (phase === 'balance')
  for (const id of ['skirmish', 'river', 'admiralty'])
    for (const seed of [15101, 15221]) for (const profile of profiles) for (const swap of [false, true]) play(scenarioById(id)!, profile, 'normal', 'normal', seed, swap);
if (phase === 'catalog') for (const map of [...maps, ...operationScenarios]) for (const profile of ['off', 'default'] as const) play(map, profile, 'hard', 'easy');
writeFileSync(output + '.commands.json.gz', gzipSync(JSON.stringify(histories)));
