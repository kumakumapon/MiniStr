import { createExpandedBattleMap } from '../../../src/game/expandedBattleMap';
import { FOUR_ARMY_IDS, type FourArmyId } from '../../../src/game/fourArmyFoundation';
import { createFourArmyState, applyFourArmyCommand, observeFourArmy, type FourArmyCommand } from '../../../src/game/fourArmyEngine';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from '../../../src/game/fourArmyExperience';
import { fourArmyControllers } from '../../../src/game/fourArmyControl';
import { defaultFourArmyCpuSettings, chooseFourArmyCpuCommand } from '../../../src/ai/fourArmyCpu';
import { fourArmyPlanningView } from '../../../src/ai/fourArmyObservation';
import { reachablePositionsForPlayer } from '../../../src/game/commands';
import { encodeFourArmySpectatorSave, parseFourArmySpectatorSave, type FourArmySpectatorSave } from '../../../src/game/fourArmySpectatorSave';
import { fourArmyHumanChoices } from '../../../src/ui/fourArmyHuman';
import type { GameResult } from '../../../src/game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
/** Legal history on a canonical public map, immediately before a real CPU/human attack. */
export function fourArmyBattleFixture(actor: FourArmyId = 'army1', spectator = false) {
  const map = value(createExpandedBattleMap({ sourceMapId: 'skirmish', participants: [...FOUR_ARMY_IDS], seed: 42, ending: 'unlimited', rules: { version: 1, tactics: true } }));
  let state = value(createFourArmyState(map)),
    experience = initialFourArmyExperience(state, 0);
  const commands: FourArmyCommand[] = [],
    settings = defaultFourArmyCpuSettings();
  const apply = (command: FourArmyCommand) => {
    const before = state;
    state = value(applyFourArmyCommand(state, command));
    commands.push(command);
    experience = advanceFourArmyExperience(experience, before, command, state, commands.length);
  };
  for (let i = 0; i < 100; i++) {
    const current = state.round.order[state.round.index]!;
    if (current === actor) {
      const observed = value(observeFourArmy(state, actor)),
        next = chooseFourArmyCpuCommand(observed, settings[actor], 'four-army-cpu-v6');
      if (next?.type === 'attack') {
        const attacker = state.units.find((u) => u.id === next.unitId)!,
          defender = state.units.find((u) => u.id === next.targetId)!;
        if (
          !attacker.position ||
          !defender.position ||
          !fourArmyHumanChoices(observed, attacker.position).some((c) => c.command.type === 'attack' && c.command.targetId === next.targetId)
        )
          throw Error('Attack is not human-observable');
        const controllers = fourArmyControllers(spectator ? [] : [actor]);
        const save: FourArmySpectatorSave = {
          format: 'ministr-four-army-configurable',
          schemaVersion: 6,
          cpuVersion: 'four-army-cpu-v6',
          name: 'Battle scene ready',
          savedAt: '2026-11-18T00:00:00.000Z',
          settings,
          controllers,
          controlHistory: { initial: controllers, events: [] },
          experience: fourArmyExperienceManifest(experience),
          view: spectator ? 'all' : actor,
          speed: 4,
          archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, state, commands } },
        };
        const text = value(encodeFourArmySpectatorSave(save));
        value(parseFourArmySpectatorSave(text));
        return { text, before: state, command: next, after: value(applyFourArmyCommand(state, next)), attacker, defender, count: commands.length };
      }
      const mover = state.units.find((u) => u.owner === actor && u.kind === 'tank' && u.position)!;
      if (!mover) throw Error('Missing tank');
      const enemy = actor === 'army3' ? 'army4' : 'army2';
      const goal = map.units.find((u) => u.owner === enemy && u.kind === 'tank')!.position!;
      const distance = (p: { x: number; y: number }) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
      const destination = reachablePositionsForPlayer(fourArmyPlanningView(observed), mover.id, 'red')
        .filter((p) => distance(p) < distance(mover.position!))
        .sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x)[0];
      if (!destination) throw Error('No route to combat');
      apply({ actor, type: 'move', unitId: mover.id, destination });
    }
    apply({ actor: current, type: 'endTurn' });
  }
  throw Error('No combat after bounded public history');
}
