import { describe, expect, it } from 'vitest';
import { chooseReconCenter } from './recon';
import { bluePlanningState } from './perspective';
import { chooseCpuAction } from './rules';
import { operation, force, valueOf } from '../game/operations.fixture';
import { createScenarioInitialState, scenarioById } from '../game/maps';
import { applyGameCommand } from '../game/session';
import { scanArea } from '../game/recon';
import { createBoard, createGameState, endTurn, isGameState } from '../game';

function state() {
  const scenario = operation({
    board: {
      width: 24,
      height: 16,
      cells: [
        [7, 2, 'city'],
        [20, 12, 'capital', 'blue'],
      ],
    },
    initialUnits: [
      { kind: 'infantry', owner: 'red', x: 1, y: 1 },
      { kind: 'tank', owner: 'blue', x: 22, y: 14 },
    ],
    victoryConditions: [{ type: 'hold', positions: [{ x: 7, y: 2 }], turns: 5 }],
    defeatConditions: [{ type: 'survive', untilTurn: 80 }],
  });
  return { ...createScenarioInitialState(scenario), turn: 2 };
}
describe('reconnaissance CPU observation boundary', () => {
  it('chooses public objectives without inspecting hidden enemy positions, ammo or funds', () => {
    const initial = state(),
      chosen = chooseReconCenter(initial, 'red');
    expect(chosen).toEqual({ x: 7, y: 2 });
    const hidden = {
      ...initial,
      players: { ...initial.players, blue: { gold: 999999, income: 99000 } },
      units: initial.units.map((unit) => (unit.owner === 'blue' ? { ...unit, position: { x: 21, y: 13 }, hp: 2, ammo: 0, fuel: 0 } : unit)),
    };
    expect(chooseReconCenter(hidden, 'red')).toEqual(chosen);
    expect(chooseCpuAction(initial)).toEqual({ type: 'recon', center: chosen });
    const scanned = valueOf(scanArea(initial, chosen!));
    expect(chooseReconCenter(scanned, 'red')).toBeUndefined();
    expect(isGameState(scanned)).toBe(true);
  });
  it('respects the turn, rule, army budget, public candidate distance and map boundaries', () => {
    const initial = state();
    for (const variant of [
      { ...initial, turn: 1 },
      { ...initial, winner: 'red' as const },
      { ...initial, ruleVersion: 6 as const },
      { ...initial, recon: { remaining: { red: 0, blue: 2 }, centers: [] } },
      { ...initial, units: [] },
      { ...initial, units: [force('r1', 'infantry', 0, 15)] },
    ])
      expect(chooseReconCenter(variant, 'red')).toBeUndefined();
    expect(chooseReconCenter(initial, 'blue')).toBeUndefined();
    expect(chooseReconCenter({ ...createGameState(createBoard(24, 16)), ruleVersion: 7, turn: 2 }, 'red')).toBeUndefined();
    const noCandidates = createScenarioInitialState(operation({ victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] }));
    expect(chooseReconCenter({ ...noCandidates, turn: 2 }, 'red')).toBeUndefined();
  });
  it('rotates blue centers and active scan areas consistently before and after planning', () => {
    const initial = state(),
      blue = { ...initial, activePlayer: 'blue' as const, units: initial.units.map((unit) => ({ ...unit, owner: unit.owner === 'red' ? ('blue' as const) : ('red' as const) })) };
    const command = chooseCpuAction(blue);
    expect(command.type).toBe('recon');
    if (command.type !== 'recon') throw Error('Missing scan');
    const scanned = valueOf(scanArea(blue, command.center)),
      rotated = bluePlanningState(scanned);
    expect(rotated.recon?.centers).toEqual([{ x: 23 - command.center.x, y: 15 - command.center.y }]);
    expect(endTurn(scanned).recon?.centers).toEqual([]);
    expect(blue.recon).toBeUndefined();
  });
  it('preserves the v6 withdrawal while v7 clears friendly traffic and keeps survivors moving toward exits', () => {
    const scenario = scenarioById('fighting-withdrawal')!;
    for (const ruleVersion of [6, 7] as const) {
      let current = { ...createScenarioInitialState(scenario), ruleVersion };
      let count = 0,
        scans = 0;
      while (!current.winner && current.turn <= 60 && count++ < 10000) {
        const command = chooseCpuAction(current, current.activePlayer === 'red' ? 'hard' : 'easy');
        if (command.type === 'recon') scans++;
        current = valueOf(applyGameCommand(current, command)) as typeof current;
      }
      expect(current.winner).toBe('red');
      expect(current.evacuatedUnits?.filter((unit) => unit.owner === 'red')).toHaveLength(3);
      expect(current.turn).toBe(ruleVersion === 6 ? 54 : 5);
      expect(scans).toBe(ruleVersion === 6 ? 0 : 2);
    }
  }, 30000);
});
