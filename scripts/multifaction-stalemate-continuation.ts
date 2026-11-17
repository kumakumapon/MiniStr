import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isFourArmyState, observeFourArmy, applyFourArmyCommand, type FourArmyCommand } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand, defaultFourArmyCpuSettings } from '../src/ai/fourArmyCpu';
import { isPropertyTerrainKind } from '../src/game/facilities';
import { unitStats } from '../src/game/units';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('checkpoint output');
const hash = (s: string) => createHash('sha256').update(s).digest('hex'),
  initial: unknown = JSON.parse(readFileSync(input, 'utf8'));
const reference = JSON.parse(readFileSync('docs/reviews/v1.5.20/fairness.json', 'utf8')).rows.find(
  (r: { spec: { id: string }; rules: string; cpuVersion: string }) => r.spec.id === 'orders-152001-0' && r.rules === 'classic' && r.cpuVersion === 'four-army-cpu-v3',
);
if (!isFourArmyState(initial) || hash(JSON.stringify(initial)) !== reference.finalStateSha256)
  throw Error('Checkpoint must match the published full-history baseline. This is a diagnosis, not a save importer.');
const sources = ['src/game/fourArmyEngine.ts', 'src/ai/fourArmyCpu.ts', 'src/ai/fourArmyObservation.ts'];
const report = {
  protocol: 'multifaction-stalemate-continuation-v1',
  inputStateSha256: reference.finalStateSha256,
  maxAdditionalRounds: 100,
  sourceHashes: Object.fromEntries(sources.map((p) => [p, hash(readFileSync(p, 'utf8'))])),
  initialBlockers: initial.units.filter((u) => {
    const t = u.position && initial.board.terrain[u.position.y]![u.position.x];
    return t && isPropertyTerrainKind(t.kind) && t.owner !== u.owner && unitStats[u.kind].capturePower === 0;
  }),
  rows: [] as unknown[],
};
for (const version of ['four-army-cpu-v3', 'four-army-cpu-v6'] as const) {
  let state = structuredClone(initial),
    count = 0;
  const trace = createHash('sha256');
  while (state.outcome.type === 'ongoing' && state.round.round <= 500 && count < 65536) {
    const actor = state.round.order[state.round.index]!,
      o = observeFourArmy(state, actor);
    if (!o.ok) throw Error(o.error);
    let command: FourArmyCommand = state.paused ? { actor, type: 'resume' } : chooseFourArmyCpuCommand(o.value, defaultFourArmyCpuSettings()[actor], version)!;
    let next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      const id = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = id ? { actor, type: 'wait', unitId: id } : { actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
    }
    if (!next.ok) throw Error(next.error);
    state = next.value;
    trace.update(JSON.stringify(command) + '\n');
    count++;
  }
  const row = { cpuVersion: version, count, round: state.round.round, outcome: state.outcome, traceSha256: trace.digest('hex'), finalStateSha256: hash(JSON.stringify(state)) };
  report.rows.push(row);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(row));
}
