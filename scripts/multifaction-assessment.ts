import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createFourArmyMap32 } from '../src/game/fourArmyMap32';
import { createExpandedBattleMap } from '../src/game/expandedBattleMap';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyMap, type FourArmyCommand } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings } from '../src/ai/fourArmyCpu';
import { fourArmyOrders } from './fourArmyAssessment';
import { FOUR_ARMY_IDS, type FourArmyId } from '../src/game/fourArmyFoundation';
import { fourArmyPlanningView } from '../src/ai/fourArmyObservation';
import { crossingDistances } from '../src/ai/crossing';
import { isServiceTile, canServiceUnitAt } from '../src/game/logistics';
import { unitStats } from '../src/game/units';
import { isPropertyTerrainKind } from '../src/game/facilities';
import { positionKey } from '../src/game/terrain';
import type { FourArmyCpuVersion } from '../src/ai/fourArmyCpuVersion';
import type { GameResult } from '../src/game/types';
const val = <T>(v: GameResult<T>): T => {
  if (!v.ok) throw Error(v.error);
  return v.value;
};
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const [mode = 'compact', shardText = '0', shardsText = '1', output = '/tmp/multifaction.json'] = process.argv.slice(2),
  shard = Number(shardText),
  shards = Number(shardsText);
if (!['compact', 'holdout', 'legacy', 'diagnosis', 'north', 'maps'].includes(mode) || !Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shard >= shards)
  throw Error('mode shard shards output');
const old = JSON.parse(readFileSync('docs/reviews/v1.5.20/fairness.json', 'utf8')) as {
  rows: {
    spec: { id: string; seed: number; order: FourArmyId[]; settings: ReturnType<typeof defaultFourArmyCpuSettings>; maxRound: number; maxCommands: number };
    rules: string;
    cpuVersion: string;
    outcome: { type: string };
    traceSha256: string;
    finalStateSha256: string;
  }[];
};
interface Case {
  id: string;
  map: FourArmyMap;
  version: FourArmyCpuVersion;
  maxRound: number;
  settings: ReturnType<typeof defaultFourArmyCpuSettings>;
  baseline?: (typeof old.rows)[number];
}
const cases: Case[] = [];
if (mode === 'legacy' || mode === 'diagnosis') {
  const controls = old.rows.filter((r) => r.cpuVersion === 'four-army-cpu-v3' && r.rules === 'classic' && r.outcome.type === 'ongoing');
  if (controls.length !== 26) throw Error('Expected all 26 classic cutoffs');
  for (const r of mode === 'diagnosis' ? controls.slice(0, 1) : controls)
    cases.push({
      id: r.spec.id,
      map: val(createFourArmyMap32(r.spec.seed, r.spec.order, 1)),
      version: mode === 'diagnosis' ? 'four-army-cpu-v3' : 'four-army-cpu-v6',
      maxRound: r.spec.maxRound,
      settings: r.spec.settings,
      baseline: r,
    });
} else {
  const seeds = mode === 'holdout' ? [152204, 152205] : [152201];
  for (const n of mode === 'maps' ? [] : mode === 'north' ? [3] : [3, 4])
    for (const order of fourArmyOrders()
      .filter((a) => n === 4 || a[3] === 'army4')
      .map((a) => a.slice(0, n)))
      for (const seed of seeds)
        for (const tactics of [false, true]) {
          const participants = FOUR_ARMY_IDS.slice(0, n),
            map = val(createExpandedBattleMap({ participants, order, seed, rules: { version: 1, tactics } }));
          cases.push({
            id: `green-${n}-${seed}-${order.join('')}-${tactics}`,
            map,
            version: 'four-army-cpu-v6',
            maxRound: n === 3 ? 21 : 20,
            settings: defaultFourArmyCpuSettings(),
          });
        }
  if (mode === 'compact' || mode === 'maps')
    for (const sourceMapId of ['outpost', 'strait'] as const)
      for (const n of [2, 3, 4])
        for (const teams of [false, true]) {
          const participants = FOUR_ARMY_IDS.slice(4 - n);
          const map = val(
            createExpandedBattleMap({
              sourceMapId,
              participants,
              seed: 152202,
              rules: { version: 1, tactics: true },
              ...(teams && n > 2 ? { teams: { army1: 'army1', army2: 'army2', army3: 'army1', army4: 'army2' } as const } : {}),
            }),
          );
          cases.push({ id: `${sourceMapId}-${n}-${teams}`, map, version: 'four-army-cpu-v6', maxRound: n === 3 ? 21 : 20, settings: defaultFourArmyCpuSettings() });
        }
}
mkdirSync(output.substring(0, output.lastIndexOf('/')) || '.', { recursive: true });
const sources = [
  'src/game/expandedBattleMap.ts',
  'src/game/smallBattle.ts',
  'src/game/fourArmyEngine.ts',
  'src/game/fourArmyFoundation.ts',
  'src/ai/fourArmyCpu.ts',
  'src/ai/fourArmyObservation.ts',
  'src/ai/fourArmyCpuOrder.ts',
];
const report = {
  protocol: 'multifaction-v1522-v1',
  mode,
  shard,
  shards,
  seeds: mode === 'holdout' ? [152204, 152205] : [152201, 152202],
  sourceHashes: Object.fromEntries(sources.map((p) => [p, hash(readFileSync(p, 'utf8'))])),
  rows: [] as unknown[],
};
for (const [i, c] of cases.entries())
  if (i % shards === shard) {
    let state = val(createFourArmyState(c.map)),
      count = 0,
      fallbacks = 0,
      diagnosticReturns = 0;
    const fuelExamples: unknown[] = [],
      trace = createHash('sha256'),
      cpu: number[] = [];
    const start = performance.now();
    while (state.outcome.type === 'ongoing' && state.round.round <= c.maxRound && count < 65536) {
      const actor = state.round.order[state.round.index]!,
        o = val(observeFourArmy(state, actor)),
        before = performance.now();
      if (mode === 'diagnosis' && state.round.round >= 200) {
        const view = fourArmyPlanningView(o),
          properties = o.board.terrain.flatMap((row, y) => row.flatMap((t, x) => (isPropertyTerrainKind(t.kind) && t.owner !== actor ? [{ x, y }] : [])));
        for (const u of view.units.filter((u) => u.owner === 'red' && u.position && !u.hasActed && !u.hasMoved && unitStats[u.kind].capturePower > 0)) {
          const home = o.board.terrain.flatMap((row, y) => row.flatMap((_, x) => (isServiceTile(view, { x, y }, u.kind, 'red') ? [{ x, y }] : [])));
          const hd = crossingDistances(view, u.kind, home).get(positionKey(u.position!)) ?? Infinity;
          const targets = properties.filter((p) => canServiceUnitAt(view.board.terrain[p.y]![p.x]!.kind, u.kind)),
            td = crossingDistances(view, u.kind, targets).get(positionKey(u.position!)) ?? Infinity,
            fuel = u.fuel ?? unitStats[u.kind].fuel;
          if (Number.isFinite(hd) && hd > 0 && fuel <= hd + unitStats[u.kind].movement * 2 && td <= fuel) {
            diagnosticReturns++;
            if (fuelExamples.length < 16)
              fuelExamples.push({
                round: state.round.round,
                army: actor,
                id: u.id,
                kind: u.kind,
                position: u.position,
                fuel,
                homeDistance: hd,
                capturableServiceDistance: td,
                hp: u.hp,
              });
          }
        }
      }
      let command: FourArmyCommand = state.paused ? { actor, type: 'resume' } : chooseFourArmyCpuCommand(o, c.settings[actor], c.version)!;
      cpu.push(performance.now() - before);
      let next = applyFourArmyCommand(state, command);
      if (!next.ok) {
        const id = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
        command = id ? { actor, type: 'wait', unitId: id } : { actor, type: 'endTurn' };
        next = applyFourArmyCommand(state, command);
        fallbacks++;
      }
      state = val(next);
      trace.update(JSON.stringify(command) + '\n');
      count++;
    }
    cpu.sort((a, b) => a - b);
    const traceSha256 = trace.digest('hex'),
      stateSha256 = hash(JSON.stringify(state));
    if (mode === 'diagnosis' && (traceSha256 !== c.baseline!.traceSha256 || stateSha256 !== c.baseline!.finalStateSha256)) throw Error('Legacy baseline no longer reproduces');
    const row = {
      id: c.id,
      seed: c.map.seed,
      order: c.map.order,
      match: c.map.match,
      rules: c.map.rules,
      cpuVersion: c.version,
      count,
      round: state.round.round,
      outcome: state.outcome,
      alive: state.alive,
      eliminations: state.eliminations,
      fallbacks,
      traceSha256,
      stateSha256,
      seconds: (performance.now() - start) / 1000,
      cpuMs: { p95: cpu[Math.ceil(cpu.length * 0.95) - 1] ?? 0, max: cpu.at(-1) ?? 0 },
      ...(mode === 'diagnosis' ? { diagnosticReturns, fuelExamples } : {}),
      ...(c.baseline ? { baseline: { outcome: c.baseline.outcome, traceSha256: c.baseline.traceSha256, finalStateSha256: c.baseline.finalStateSha256 } } : {}),
    };
    if (mode === 'diagnosis') writeFileSync(output + '.state.json', JSON.stringify(state, null, 2) + '\n');
    report.rows.push(row);
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ id: c.id, count, round: state.round.round, outcome: state.outcome, seconds: row.seconds }));
  }
