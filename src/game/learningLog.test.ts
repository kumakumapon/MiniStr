import { expect, it } from 'vitest';
import { BattleHistory } from './battleHistory';
import { applyGameCommand, type GameCommand } from './session';
import { createScenarioInitialState } from './maps';
import { force, operation, valueOf } from './operations.fixture';
import type { GameState } from './types';
import { LearningLog } from './learningLog';

const play = (initial: GameState, commands: readonly GameCommand[]) => commands.reduce((state, command) => valueOf(applyGameCommand(state, command)), initial);

it('counts actual supplies and paid repair for the receiving side, not the side ending its turn', () => {
  const initial = createScenarioInitialState(operation({ victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] }));
  initial.units = [force('r1', 'tank', 0, 1, { hp: 30, ammo: 0, secondaryAmmo: 0, fuel: 0 }), force('b1', 'infantry', 7, 3, { owner: 'blue' })];
  initial.board.terrain[1]![0] = { kind: 'city', owner: 'red' };
  initial.players.red.gold = 5000;
  const commands: GameCommand[] = [{ type: 'endTurn' }, { type: 'endTurn' }];
  const final = play(initial, commands);
  expect(final.units[0]!.hp).toBe(50);
  expect(final.units[0]!.ammo).toBeGreaterThan(0);
  const history = new BattleHistory(initial, commands);
  expect(valueOf(history.learning(1, 'red')).repair).toBe(false);
  expect(valueOf(history.learning(2, 'red'))).toMatchObject({ resupply: true, repair: true });
  expect(valueOf(history.learning(2, 'blue'))).toMatchObject({ resupply: false, repair: false });
  expect(history.learning(-1, 'red').ok).toBe(false);
  expect(history.learning(3, 'red').ok).toBe(false);
});

it('tracks the mission target through its own load, unload and evacuation, including rewind', () => {
  const initial = createScenarioInitialState(operation());
  const commands: GameCommand[] = [
    { type: 'embark', unitId: 'r1', transportId: 'r3' },
    { type: 'endTurn' },
    { type: 'endTurn' },
    { type: 'disembark', transportId: 'r3', destination: { x: 0, y: 1 } },
    { type: 'endTurn' },
    { type: 'endTurn' },
    { type: 'move', unitId: 'r1', destination: { x: 3, y: 1 } },
    { type: 'evacuate', unitId: 'r1' },
  ];
  play(initial, commands);
  const history = new BattleHistory(initial, commands);
  expect(valueOf(history.learning(commands.length, 'red'))).toMatchObject({ missionEmbark: true, missionUnload: true, missionEvacuate: true });
  expect(valueOf(history.learning(commands.length, 'blue'))).toMatchObject({ missionEmbark: false, missionUnload: false, missionEvacuate: false });
  expect(valueOf(history.learning(0, 'red'))).toMatchObject({ missionEmbark: false, missionUnload: false, missionEvacuate: false });
});

it('releases a destroyed provider and does not invent an unloading action', () => {
  let state = createScenarioInitialState(operation({ victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] }));
  state.units = [force('r1', 'infantry', 0, 1), force('r3', 'apc', 0, 2, { hp: 1 }), force('b1', 'tank', 1, 2, { owner: 'blue' })];
  const log = new LearningLog();
  for (const command of [{ type: 'embark', unitId: 'r1', transportId: 'r3' }, { type: 'endTurn' }, { type: 'attack', unitId: 'b1', targetId: 'r3' }] as const) {
    const next = valueOf(applyGameCommand(state, command));
    log.observe(state, next, command);
    state = next;
  }
  expect(state.units.some((unit) => unit.id === 'r3')).toBe(false);
  expect(log.snapshot('red')).toMatchObject({ embark: true, disembark: false, missionUnload: false });
});
