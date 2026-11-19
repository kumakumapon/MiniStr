import { createExpandedBattleMap } from '../../../src/game/expandedBattleMap';
import { FOUR_ARMY_IDS, type FourArmyId } from '../../../src/game/fourArmyFoundation';
import { applyFourArmyCommand, createFourArmyState, observeFourArmy, type FourArmyCommand } from '../../../src/game/fourArmyEngine';
import { initialFourArmyExperience, advanceFourArmyExperience, fourArmyExperienceManifest } from '../../../src/game/fourArmyExperience';
import { fourArmyControllers } from '../../../src/game/fourArmyControl';
import { defaultFourArmyCpuSettings, chooseFourArmyCpuCommand } from '../../../src/ai/fourArmyCpu';
import { encodeFourArmySpectatorSave, parseFourArmySpectatorSave, type FourArmySpectatorSave } from '../../../src/game/fourArmySpectatorSave';
import { fourArmyHumanChoices } from '../../../src/ui/fourArmyHuman';
import type { GameResult } from '../../../src/game/types';
const value = <T>(result: GameResult<T>): T => {
  if (!result.ok) throw Error(result.error);
  return result.value;
};

/** Canonical map and legal history only; no altered runtime state or hidden UI hooks. */
export function fourArmyActionFixture(kind: 'capture' | 'logistics', control: 'human' | 'spectator' | 'hotseat' = 'human', actor: FourArmyId = 'army3') {
  const map = value(createExpandedBattleMap({ sourceMapId: 'skirmish', participants: [...FOUR_ARMY_IDS], seed: 42, ending: 'unlimited', rules: { version: 1, tactics: true } }));
  let state = value(createFourArmyState(map)),
    experience = initialFourArmyExperience(state, 0),
    partial = false;
  const commands: FourArmyCommand[] = [],
    settings = defaultFourArmyCpuSettings();
  const apply = (command: FourArmyCommand) => {
    const before = state;
    state = value(applyFourArmyCommand(state, command));
    commands.push(command);
    experience = advanceFourArmyExperience(experience, before, command, state, commands.length);
  };
  const ready = (command: FourArmyCommand) => {
    const current = state.round.order[state.round.index]!;
    const controllers = fourArmyControllers(control === 'spectator' ? [] : control === 'hotseat' ? [...new Set([current, actor])] : [actor]);
    const save: FourArmySpectatorSave = {
      format: 'ministr-four-army-configurable',
      schemaVersion: 6,
      cpuVersion: 'four-army-cpu-v6',
      name: `${kind} scene ready`,
      savedAt: '2026-11-19T00:00:00.000Z',
      settings,
      controllers,
      controlHistory: { initial: controllers, events: [] },
      experience: fourArmyExperienceManifest(experience),
      view: control === 'spectator' ? 'all' : current,
      speed: 4,
      archive: { format: 'ministr-four-army-save', schemaVersion: 5, ruleset: 'four-army-v5', payload: { map, state, commands } },
    };
    if (control === 'human') save.view = actor;
    const text = value(encodeFourArmySpectatorSave(save));
    value(parseFourArmySpectatorSave(text));
    return { text, save, before: state, after: value(applyFourArmyCommand(state, command)), command, count: commands.length };
  };
  for (let i = 0; i < 120; i++) {
    const current = state.round.order[state.round.index]!;
    if (current !== actor) {
      apply({ actor: current, type: 'endTurn' });
      continue;
    }
    const unit = state.units.find((u) => u.owner === actor && u.kind === (kind === 'capture' ? 'infantry' : 'tank') && u.position)!;
    if (!unit?.position) throw Error('Missing fixture unit');
    const observed = value(observeFourArmy(state, actor));
    const choices = fourArmyHumanChoices(observed, unit.position);
    if (kind === 'capture') {
      const capture = choices.find((c) => c.command.type === 'capture');
      if (capture) {
        if (partial) return ready(capture.command);
        apply(capture.command);
        partial = true;
        apply({ actor, type: 'endTurn' });
        continue;
      }
      const targets = state.board.terrain.flatMap((row, y) =>
        row.flatMap((tile, x) => (['city', 'factory', 'capital'].includes(tile.kind) && tile.owner !== actor ? [{ x, y }] : [])),
      );
      const distance = (p: { x: number; y: number }) => Math.min(...targets.map((t) => Math.abs(p.x - t.x) + Math.abs(p.y - t.y)));
      const move = choices
        .filter((c) => c.command.type === 'move')
        .sort((a, b) => {
          if (a.command.type !== 'move' || b.command.type !== 'move') return 0;
          return (
            distance(a.command.destination) - distance(b.command.destination) ||
            a.command.destination.y - b.command.destination.y ||
            a.command.destination.x - b.command.destination.x
          );
        })[0];
      if (!move) throw Error('No capture route');
      apply(move.command);
      const next = value(observeFourArmy(state, actor));
      const captureAfterMove = fourArmyHumanChoices(next, state.units.find((u) => u.id === unit.id)!.position!).find((c) => c.command.type === 'capture');
      if (captureAfterMove) {
        apply(captureAfterMove.command);
        partial = true;
      }
      apply({ actor, type: 'endTurn' });
    } else {
      const capital = map.capitals[actor];
      const distance = (p: { x: number; y: number }) => Math.abs(p.x - capital.x) + Math.abs(p.y - capital.y);
      const move = choices
        .filter((c) => c.command.type === 'move')
        .sort((a, b) => (a.command.type === 'move' && b.command.type === 'move' ? distance(a.command.destination) - distance(b.command.destination) : 0))[0];
      if (!move || move.command.type !== 'move') throw Error('Capital is not reachable');
      apply(move.command);
      apply({ actor, type: 'endTurn' });
      if (distance(move.command.destination) !== 0) continue;
      for (let j = 0; j < 120; j++) {
        const owner = state.round.order[state.round.index]!;
        const observed = value(observeFourArmy(state, owner));
        const command = chooseFourArmyCpuCommand(observed, settings[owner], 'four-army-cpu-v6');
        if (!command) throw Error('No CPU fixture command');
        const after = value(applyFourArmyCommand(state, command));
        const beforeUnit = state.units.find((u) => u.id === unit.id),
          afterUnit = after.units.find((u) => u.id === unit.id);
        if (command.type === 'endTurn' && after.round.order[after.round.index] === actor && (afterUnit?.fuel ?? 0) > (beforeUnit?.fuel ?? 0)) return ready(command);
        apply(command);
      }
      throw Error('No real replenishment');
    }
  }
  throw Error('No bounded action fixture');
}
