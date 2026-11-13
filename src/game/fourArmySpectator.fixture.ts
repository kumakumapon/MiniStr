import { createFourArmyMap32 } from './fourArmyMap32';
import { createFourArmyState, applyFourArmyCommand, type FourArmyCommand } from './fourArmyEngine';
import { defaultFourArmyCpuSettings } from '../ai/fourArmyCpu';
import type { FourArmySpectatorSave } from './fourArmySpectatorSave';
export function fourArmySpectatorFixture(turns = 0): FourArmySpectatorSave {
  const m = createFourArmyMap32();
  if (!m.ok) throw Error(m.error);
  const made = createFourArmyState(m.value);
  if (!made.ok) throw Error(made.error);
  let state = made.value;
  const commands: FourArmyCommand[] = [];
  for (let i = 0; i < turns; i++) {
    const c: FourArmyCommand = { actor: state.round.order[state.round.index]!, type: state.paused ? 'resume' : 'endTurn' },
      next = applyFourArmyCommand(state, c);
    if (!next.ok) throw Error(next.error);
    commands.push(c);
    state = next.value;
  }
  return {
    format: 'ministr-four-army-spectator',
    schemaVersion: 1,
    cpuVersion: 'four-army-cpu-v1',
    name: 'Four Fronts',
    savedAt: '2026-11-13T00:00:00.000Z',
    settings: defaultFourArmyCpuSettings(),
    view: 'all',
    speed: 1,
    archive: { format: 'ministr-four-army-save', schemaVersion: 2, ruleset: 'four-army-v2', payload: { map: m.value, commands, state } },
  };
}
