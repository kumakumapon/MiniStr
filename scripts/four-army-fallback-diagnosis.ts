import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createFourArmyMap32 } from '../src/game/fourArmyMap32';
import { createFourArmyState, observeFourArmy, applyFourArmyCommand, type FourArmyCommand } from '../src/game/fourArmyEngine';
import { chooseFourArmyCpuCommand, isObservedFourArmyCommand } from '../src/ai/fourArmyCpu';
import type { FairnessCase } from './fourArmyFairness';
import type { GameResult } from '../src/game/types';

const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
interface Measured extends FairnessCase {
  count: number;
  traceSha256: string;
  finalStateSha256: string;
  fallbacks: number;
}
const inputs = process.argv.slice(2, -1),
  output = process.argv.at(-1);
if (inputs.length !== 2 || !output) throw Error('Usage: fallback-diagnosis classic-v3.json expanded-v4.json output.json');
const reports = inputs.map((p) => JSON.parse(readFileSync(p, 'utf8')) as { rows: Measured[]; frozenSources: Record<string, string> });
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
for (const report of reports)
  for (const [path, digest] of Object.entries(report.frozenSources)) if (hash(readFileSync(path, 'utf8')) !== digest) throw Error('Game source changed: ' + path);
const results = reports.map((report, i) => {
  const c = report.rows.find((r) => r.spec.id === 'orders-152001-0' && r.rules === (i ? 'expanded' : 'classic') && r.cpuVersion === (i ? 'four-army-cpu-v4' : 'four-army-cpu-v3'));
  if (!c) throw Error('Missing the preselected first fresh-order control');
  const map = value(createFourArmyMap32(c.spec.seed, c.spec.order, 1, c.rules === 'expanded' ? { version: 1, tactics: true } : undefined));
  let state = value(createFourArmyState(map)),
    count = 0,
    fallbacks = 0;
  const trace = createHash('sha256'),
    reasons = new Map<string, number>();
  const examples: { at: number; command: FourArmyCommand; reason: string; observationAllowed: boolean; knownOccupant: boolean; actualOccupied: boolean }[] = [];
  while (state.outcome.type === 'ongoing' && state.round.round <= c.spec.maxRound && count < c.spec.maxCommands) {
    const actor = state.round.order[state.round.index]!,
      observed = value(observeFourArmy(state, actor));
    let command: FourArmyCommand = state.paused ? { actor, type: 'resume' } : chooseFourArmyCpuCommand(observed, c.spec.settings[actor], c.cpuVersion)!;
    if (!command) throw Error('No command');
    let next = applyFourArmyCommand(state, command);
    if (!next.ok) {
      const point = command.type === 'move' ? command.destination : command.type === 'produce' ? command.factory : command.type === 'disembark' ? command.destination : undefined;
      const occupies = (u: { position?: { x: number; y: number } }) => !!point && u.position?.x === point.x && u.position?.y === point.y;
      const observationAllowed = isObservedFourArmyCommand(observed, command);
      const reason = command.type + ': ' + next.error;
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      if (examples.length < 12)
        examples.push({ at: count + 1, command, reason, observationAllowed, knownOccupant: observed.units.some(occupies), actualOccupied: state.units.some(occupies) });
      // Diagnosis may inspect the rejected state, but planning and the fallback remain unchanged.
      const unitId = 'unitId' in command ? command.unitId : 'transportId' in command ? command.transportId : undefined;
      command = unitId ? { actor, type: 'wait', unitId } : { actor, type: 'endTurn' };
      next = applyFourArmyCommand(state, command);
      fallbacks++;
    }
    state = value(next);
    count++;
    trace.update(JSON.stringify(command) + '\n');
  }
  const traceSha256 = trace.digest('hex'),
    finalStateSha256 = hash(JSON.stringify(state));
  if (count !== c.count || traceSha256 !== c.traceSha256 || finalStateSha256 !== c.finalStateSha256 || fallbacks !== c.fallbacks)
    throw Error('Diagnostic run differs from the primary comparison');
  return {
    id: c.spec.id,
    rules: c.rules,
    cpuVersion: c.cpuVersion,
    count,
    fallbacks,
    traceSha256,
    finalStateSha256,
    outcome: state.outcome,
    reasons: Object.fromEntries(reasons),
    examples,
  };
});
writeFileSync(output, JSON.stringify({ protocol: 'four-army-fallback-diagnosis-v1', frozenSources: reports[0]!.frozenSources, results }, null, 2) + '\n');
console.log('Matched primary traces; wrote ' + output);
