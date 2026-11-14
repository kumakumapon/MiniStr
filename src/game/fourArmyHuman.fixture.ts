import { fourArmyPlanningView } from '../ai/fourArmyObservation';
import { reachablePositionsForPlayer } from './commands';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyCommand } from './fourArmyEngine';
import { createFourArmyMap32 } from './fourArmyMap32';
import type { FourArmyId } from './fourArmyFoundation';
import type { FourArmySpectatorSave } from './fourArmySpectatorSave';
import type { GameResult } from './types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
/** Verified short scripted records for loss, post-loss spectator and victory UI, using production rules. */
export function fourArmyHumanFinishedFixture(humanArmy: FourArmyId = 'army1', finish = false): FourArmySpectatorSave {
  const map = value(createFourArmyMap32(42, undefined, 1));
  let state = value(createFourArmyState(map));
  const commands: FourArmyCommand[] = [];
  const apply = (c: FourArmyCommand) => {
    state = value(applyFourArmyCommand(state, c));
    commands.push(c);
  };
  for (let i = 0; i < 600 && state.outcome.type === 'ongoing' && (finish || state.alive.includes('army1')); i++) {
    const actor = state.round.order[state.round.index]!;
    if (state.paused) {
      apply({ actor, type: 'resume' });
      continue;
    }
    if (actor === 'army4') {
      const o = value(observeFourArmy(state, actor)),
        view = fourArmyPlanningView(o),
        unit = view.units.find((u) => u.id === 'u25')!;
      const enemy = (['army1', 'army2', 'army3'] as const).find((a) => state.alive.includes(a))!;
      const capital = map.capitals[enemy];
      if (!unit.hasActed && unit.position) {
        if (unit.position.x === capital.x && unit.position.y === capital.y) apply({ actor, type: 'capture', unitId: unit.id });
        else {
          const distance = (p: { x: number; y: number }) => Math.abs(p.x - capital.x) + Math.abs(p.y - capital.y);
          const destinations = reachablePositionsForPlayer(view, unit.id, 'red')
            .filter((p) => distance(p) < distance(unit.position!))
            .sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x);
          if (!destinations[0]) throw Error('Fixture route blocked');
          apply({ actor, type: 'move', unitId: unit.id, destination: destinations[0] });
        }
      }
    }
    if (state.outcome.type === 'ongoing') apply({ actor, type: 'endTurn' });
  }
  if (state.alive.includes('army1') || (finish && state.outcome.type !== 'victory')) throw Error('Fixture did not finish');
  return {
    format: 'ministr-four-army-match',
    schemaVersion: 2,
    cpuVersion: 'four-army-cpu-v3',
    humanArmy,
    name: 'Human result fixture',
    savedAt: '2026-11-14T00:00:00.000Z',
    settings: {
      army1: { difficulty: 'normal', policy: 'balanced' },
      army2: { difficulty: 'normal', policy: 'balanced' },
      army3: { difficulty: 'normal', policy: 'balanced' },
      army4: { difficulty: 'normal', policy: 'balanced' },
    },
    view: 'all',
    speed: 4,
    archive: { format: 'ministr-four-army-save', schemaVersion: 2, ruleset: 'four-army-v2', payload: { map, state, commands } },
  };
}
