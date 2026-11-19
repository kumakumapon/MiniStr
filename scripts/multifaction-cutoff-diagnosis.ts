import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createFourArmyMap32 } from '../src/game/fourArmyMap32';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyCommand, type FourArmyState } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand, type FourArmyCpuSettings } from '../src/ai/fourArmyCpu';
import { isFourArmyCpuVersion } from '../src/ai/fourArmyCpuVersion';
import { unitStats } from '../src/game/units';
import { isPropertyTerrainKind } from '../src/game/facilities';
import type { FourArmyId } from '../src/game/fourArmyFoundation';
import type { GameResult } from '../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const [version = 'four-army-cpu-v6', shardText = '0', shardsText = '1', output = '/tmp/ministr1525-cutoffs', roundsText = '400'] = process.argv.slice(2);
const shard = Number(shardText),
  shards = Number(shardsText),
  maxRound = Number(roundsText);
if (
  !isFourArmyCpuVersion(version) ||
  !Number.isSafeInteger(shard) ||
  !Number.isSafeInteger(shards) ||
  shards < 1 ||
  shard < 0 ||
  shard >= shards ||
  !Number.isSafeInteger(maxRound) ||
  maxRound < 1 ||
  maxRound > 500
)
  throw Error('version shard shards directory maxRound');
interface Reference {
  id: string;
  outcome: { type: string };
  traceSha256: string;
  stateSha256: string;
  spec: { seed: number; order: FourArmyId[]; settings: FourArmyCpuSettings };
}
const references = (JSON.parse(readFileSync('docs/reviews/v1.5.22/legacy-comparison.json', 'utf8')) as { rows: Reference[] }).rows.filter((r) => r.outcome.type === 'ongoing');
if (references.length !== 6) throw Error('Expected exactly six published cutoffs');
mkdirSync(output, { recursive: true });
const report = {
  protocol: 'multifaction-cutoff-diagnosis-v1525-v1',
  version,
  shard,
  shards,
  maxRound,
  sourceHashes: Object.fromEntries(
    [
      'src/game/fourArmyEngine.ts',
      'src/game/smallBattle.ts',
      'src/game/expandedBattleMap.ts',
      'src/ai/fourArmyCpu.ts',
      'src/ai/fourArmyCpuRecovery.ts',
      'src/ai/fourArmyCpuVersion.ts',
      'src/ai/fourArmyCpuOrder.ts',
      'src/ai/fourArmyObservation.ts',
    ].map((p) => [p, hash(readFileSync(p, 'utf8'))]),
  ),
  rows: [] as unknown[],
};
for (const [index, ref] of references.entries()) {
  if (index % shards !== shard) continue;
  const map = value(createFourArmyMap32(ref.spec.seed, ref.spec.order, 1));
  let state = value(createFourArmyState(map)),
    fallbacks = 0;
  const commands: FourArmyCommand[] = [],
    errors: unknown[] = [],
    oscillations: Record<string, number> = {},
    movements = new Map<string, string[]>(),
    actions: Record<string, number> = {},
    trace = createHash('sha256'),
    started = performance.now();
  const snapshots: unknown[] = [];
  let lastRound = 0;
  while (state.outcome.type === 'ongoing' && state.round.round <= maxRound && commands.length < 65536) {
    const actor = state.round.order[state.round.index]!,
      observed = value(observeFourArmy(state, actor));
    let command: FourArmyCommand = state.paused ? { actor, type: 'resume' } : chooseFourArmyCpuCommand(observed, ref.spec.settings[actor], version)!;
    let next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      if (errors.length < 24) errors.push({ round: state.round.round, command, error: next.error });
      const id = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = id ? { actor, type: 'wait', unitId: id } : { actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
      fallbacks++;
    }
    state = value(next);
    if (command.type === 'move') {
      const u = state.units.find((u) => u.id === command.unitId),
        key = `${u?.position?.x},${u?.position?.y}`,
        last = movements.get(command.unitId) ?? [];
      if (last.length >= 2 && last.at(-2) === key) oscillations[command.unitId] = (oscillations[command.unitId] ?? 0) + 1;
      movements.set(command.unitId, [...last.slice(-3), key]);
    }
    commands.push(command);
    trace.update(JSON.stringify(command) + '\n');
    actions[command.type] = (actions[command.type] ?? 0) + 1;
    if (state.round.round !== lastRound && state.round.round % 50 === 0) {
      lastRound = state.round.round;
      snapshots.push({ round: lastRound, alive: state.alive, units: summary(state) });
      console.log(JSON.stringify({ id: ref.id, version, round: lastRound, count: commands.length, elapsed: (performance.now() - started) / 1000 }));
    }
  }
  const traceSha256 = trace.digest('hex'),
    stateSha256 = hash(JSON.stringify(state));
  if (version === 'four-army-cpu-v6' && maxRound === 400 && (traceSha256 !== ref.traceSha256 || stateSha256 !== ref.stateSha256))
    throw Error(`Published baseline drift: ${ref.id}`);
  const row = {
    id: ref.id,
    seed: ref.spec.seed,
    order: ref.spec.order,
    settings: ref.spec.settings,
    version,
    commands: commands.length,
    round: state.round.round,
    outcome: state.outcome,
    alive: state.alive,
    fallbacks,
    errors,
    actions,
    oscillations,
    units: summary(state),
    traceSha256,
    stateSha256,
    seconds: (performance.now() - started) / 1000,
    snapshots,
  };
  report.rows.push(row);
  writeFileSync(join(output, `${ref.id}.state.json`), JSON.stringify(state));
  writeFileSync(join(output, `${ref.id}.history.json`), JSON.stringify({ map, commands, state }));
  writeFileSync(join(output, `report-${shard}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ id: ref.id, version, count: commands.length, round: state.round.round, outcome: state.outcome, seconds: row.seconds }));
}
function summary(s: FourArmyState) {
  return s.units.map((u) => {
    const tile = u.position && s.board.terrain[u.position.y]?.[u.position.x];
    return {
      id: u.id,
      owner: u.owner,
      kind: u.kind,
      position: u.position,
      embarkedIn: u.embarkedIn,
      hp: u.hp,
      fuel: u.fuel,
      ammo: u.ammo,
      secondaryAmmo: u.secondaryAmmo,
      ...(tile && isPropertyTerrainKind(tile.kind) ? { facility: { kind: tile.kind, owner: tile.owner, capturable: unitStats[u.kind].capturePower > 0 } } : {}),
    };
  });
}
