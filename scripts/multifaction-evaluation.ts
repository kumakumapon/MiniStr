import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createExpandedBattleMap, latestExpandedBattleLayout } from '../src/game/expandedBattleMap';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyMap, type FourArmyCommand } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings } from '../src/ai/fourArmyCpu';
import { isFourArmyCpuVersion } from '../src/ai/fourArmyCpuVersion';
import { fourArmyOrders } from './fourArmyAssessment';
import { FOUR_ARMY_IDS } from '../src/game/fourArmyFoundation';
import type { GameResult } from '../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const [mode = 'training', version = 'four-army-cpu-v6', shardText = '0', shardsText = '1', output = '/tmp/ministr1525-training.json', layoutText = 'auto'] = process.argv.slice(2),
  shard = Number(shardText),
  shards = Number(shardsText);
if (
  !['training', 'validation', 'teams'].includes(mode) ||
  !isFourArmyCpuVersion(version) ||
  !Number.isSafeInteger(shard) ||
  !Number.isSafeInteger(shards) ||
  shards < 1 ||
  shard < 0 ||
  shard >= shards
)
  throw Error('mode version shard shards output');
const settings = defaultFourArmyCpuSettings(),
  cases: { id: string; map: FourArmyMap }[] = [];
const protocol = JSON.parse(readFileSync('docs/reviews/v1.5.25/protocol.json', 'utf8')) as { trainingSeeds: number[]; validationSeeds: number[] };
if (mode !== 'teams') {
  for (const n of mode === 'training' ? [3] : [3, 4])
    for (const seed of mode === 'training' ? protocol.trainingSeeds : protocol.validationSeeds.slice(0, n === 3 ? 3 : 2))
      for (const order of fourArmyOrders()
        .filter((a) => n === 4 || a[3] === 'army4')
        .map((a) => a.slice(0, n)))
        for (const tactics of [false, true]) {
          const map = value(
            createExpandedBattleMap({
              participants: FOUR_ARMY_IDS.slice(0, n),
              order,
              seed,
              layoutVersion: layoutText === 'auto' ? (version === 'four-army-cpu-v7' ? latestExpandedBattleLayout('skirmish', n) : 2) : (Number(layoutText) as 2 | 3),
              rules: { version: 1, tactics },
            }),
          );
          cases.push({ id: `green-${n}-${seed}-${order.join('')}-${tactics}`, map });
        }
} else {
  for (const sourceMapId of ['skirmish', 'strait'] as const)
    for (const n of [2, 3, 4])
      for (const seed of protocol.validationSeeds.slice(0, 2))
        for (const teams of [false, true]) {
          const participants = FOUR_ARMY_IDS.slice(0, n),
            map = value(
              createExpandedBattleMap({
                sourceMapId,
                layoutVersion: version === 'four-army-cpu-v7' ? latestExpandedBattleLayout(sourceMapId, n) : 2,
                participants,
                seed,
                rules: { version: 1, tactics: true },
                ...(teams && n > 2 ? { teams: { army1: 'army1', army2: 'army2', army3: 'army1', army4: 'army2' } as const } : {}),
              }),
            );
          cases.push({ id: `${sourceMapId}-${n}-${seed}-${teams}`, map });
        }
}
mkdirSync(output.slice(0, output.lastIndexOf('/')) || '.', { recursive: true });
const report = {
  protocol: 'multifaction-v1525-v1',
  mode,
  version,
  shard,
  shards,
  totalCases: cases.length,
  sourceHashes: Object.fromEntries(
    ['src/game/expandedBattleMap.ts', 'src/game/fourArmyEngine.ts', 'src/ai/fourArmyCpu.ts', 'src/ai/fourArmyCpuRecovery.ts', 'src/ai/fourArmyCpuOrder.ts'].map((p) => [
      p,
      hash(readFileSync(p, 'utf8')),
    ]),
  ),
  rows: [] as unknown[],
};
for (const [index, c] of cases.entries()) {
  if (index % shards !== shard) continue;
  let state = value(createFourArmyState(c.map)),
    count = 0,
    fallbacks = 0;
  const trace = createHash('sha256'),
    actions: Record<string, number> = {},
    timing: number[] = [],
    started = performance.now();
  while (state.outcome.type === 'ongoing' && count < 65536 && state.round.round <= 21) {
    const actor = state.round.order[state.round.index]!,
      o = value(observeFourArmy(state, actor)),
      begin = performance.now();
    let command: FourArmyCommand = state.paused ? { actor, type: 'resume' } : chooseFourArmyCpuCommand(o, settings[actor], version)!;
    timing.push(performance.now() - begin);
    let next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      const id = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = id ? { actor, type: 'wait', unitId: id } : { actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
      fallbacks++;
    }
    state = value(next);
    trace.update(JSON.stringify(command) + '\n');
    actions[command.type] = (actions[command.type] ?? 0) + 1;
    count++;
  }
  timing.sort((a, b) => a - b);
  const row = {
    id: c.id,
    seed: c.map.seed,
    participants: c.map.match!.participants,
    order: c.map.order,
    teams: c.map.match!.version === 2 ? c.map.match!.teams : undefined,
    layoutVersion: c.map.match!.layoutVersion,
    tactics: c.map.rules?.tactics,
    count,
    round: state.round.round,
    outcome: state.outcome,
    alive: state.alive,
    fallbacks,
    actions,
    traceSha256: trace.digest('hex'),
    stateSha256: hash(JSON.stringify(state)),
    cpuMs: { p95: timing[Math.ceil(timing.length * 0.95) - 1] ?? 0, max: timing.at(-1) ?? 0 },
    seconds: (performance.now() - started) / 1000,
  };
  report.rows.push(row);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ id: c.id, version, outcome: row.outcome, count, seconds: row.seconds }));
}
