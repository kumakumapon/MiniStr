import { expect, it } from 'vitest';
import { applyGameCommand, createScenarioInitialState, endTurn, type GameState, type PlayerId } from '../game';
import { force, operation, valueOf } from '../game/operations.fixture';
import { isDeployedUnit } from '../game/types';
import { defensiveHoldRelief } from './holdRelief';
import { chooseCpuAction } from './rules';
import { visibleEnemies } from '../game/fog';

function fixture(player: PlayerId = 'red'): GameState {
  const hold = { type: 'hold' as const, positions: [{ x: 6, y: 2 }], turns: 30, groundOnly: true };
  const state = createScenarioInitialState(
    operation({
      board: { width: 12, height: 6, cells: [] },
      victoryConditions: player === 'red' ? [hold] : [{ type: 'eliminate' }],
      defeatConditions: player === 'blue' ? [hold] : [{ type: 'eliminate' }],
    }),
  );
  state.activePlayer = player;
  state.recon = { remaining: { red: 0, blue: 0 }, centers: [] };
  state.players[player] = { ...state.players[player], gold: 5000, income: 0 };
  state.board.terrain[2]![0] = { kind: 'city', owner: player };
  state.units = [
    force('hurt', 'artillery', 6, 2, { owner: player, hp: 30 }),
    force('relief', 'tank', 6, 4, { owner: player }),
    force('enemy', 'infantry', 11, 5, { owner: player === 'red' ? 'blue' : 'red' }),
  ];
  return state;
}
const order = (state: GameState) =>
  defensiveHoldRelief(
    state,
    state.activePlayer,
    state.units.filter((u) => u.owner !== state.activePlayer),
  );

it.each(['red', 'blue'] as const)('relieves a hurt %s holder, keeps the objective, repairs and returns to the front', (player) => {
  let state = fixture(player);
  const before = structuredClone(state);
  const action = chooseCpuAction(state, 'normal', player, 'defensive');
  expect(action).toMatchObject({ type: 'move', unitId: 'hurt' });
  expect(state).toEqual(before);
  expect(chooseCpuAction(structuredClone(state), 'normal', player, 'defensive')).toEqual(action);
  state = valueOf(applyGameCommand(state, action));
  const relief = chooseCpuAction(state, 'normal', player, 'defensive');
  expect(relief).toEqual({ type: 'move', unitId: 'relief', destination: { x: 6, y: 2 } });
  state = valueOf(applyGameCommand(state, relief));
  let repaired = false;
  for (let round = 0; round < 10; round++) {
    for (let step = 0; step < 10; step++) {
      const next = chooseCpuAction(state, 'normal', player, 'defensive');
      if (next.type === 'endTurn') break;
      state = valueOf(applyGameCommand(state, next));
    }
    state = endTurn(endTurn(state));
    const unit = state.units.find((u) => u.id === 'hurt')!;
    repaired ||= unit.hp >= 50;
    expect(state.units.find((u) => u.id === 'relief')!.position).toEqual({ x: 6, y: 2 });
    if (repaired && unit.position!.x > 0) {
      expect(unit.hp).toBeGreaterThanOrEqual(50);
      expect(state.objectiveHoldTurns?.[player]).toBeDefined();
      return;
    }
  }
  throw Error('No repaired return to the front');
});

it('does not vacate a post without a ready, healthy, compatible, reachable relief unit', () => {
  const patches = [
    (s: GameState) => {
      s.units.splice(1, 1);
    },
    (s: GameState) => {
      s.units[1]!.hp = 59;
    },
    (s: GameState) => {
      s.units[1]!.hasMoved = true;
    },
    (s: GameState) => {
      s.units[1]!.hasActed = true;
    },
    (s: GameState) => {
      s.units[1]!.kind = 'fighter';
    },
    (s: GameState) => {
      s.units.push({ ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'relief' });
    },
    (s: GameState) => {
      s.units[1]!.id = 'r1';
      s.scenarioSnapshot!.victoryConditions = [...s.scenarioSnapshot!.victoryConditions, { type: 'withdraw', unitIds: ['r1'], positions: [{ x: 11, y: 0 }], required: 1 }];
    },
    (s: GameState) => {
      s.units[1]!.position = { x: 11, y: 0 };
      s.units[1]!.fuel = 1;
    },
    (s: GameState) => {
      s.units[0]!.hp = 36;
    },
    (s: GameState) => {
      s.units[0]!.hasMoved = true;
    },
    (s: GameState) => {
      s.units[0]!.hasActed = true;
    },
    (s: GameState) => {
      s.players.red.gold = 0;
    },
    (s: GameState) => {
      s.units[0]!.fuel = 1;
    },
    (s: GameState) => {
      delete s.ruleVersion;
    },
    (s: GameState) => {
      s.scenarioSnapshot!.victoryConditions = [{ type: 'eliminate' }];
    },
  ];
  for (const patch of patches) {
    const state = fixture();
    patch(state);
    expect(order(state)).toBeUndefined();
  }
});

it('keeps another required post staffed and does not expose either unit to visible lethal fire', () => {
  const otherPost = fixture();
  const hold = otherPost.scenarioSnapshot!.victoryConditions[0]!;
  if (hold.type !== 'hold') throw Error('Expected hold');
  hold.positions.push({ x: 6, y: 4 });
  expect(order(otherPost)).toBeUndefined();
  for (const [x, y] of [
    [3, 2],
    [6, 5],
  ]) {
    const state = fixture();
    state.units[2] = force('enemy', 'rocket', x!, y!, { owner: 'blue' });
    state.units[0]!.hp = 1;
    state.units[1]!.hp = 60;
    expect(order(state)).toBeUndefined();
  }
});

it('fills vacant posts, respects ownership and never uses an embarked relief unit', () => {
  const state = fixture();
  state.units[0]!.position = { x: 1, y: 2 };
  expect(order(state)).toEqual({ type: 'move', unitId: 'relief', destination: { x: 6, y: 2 } });
  const hold = state.scenarioSnapshot!.victoryConditions[0]!;
  if (hold.type !== 'hold') throw Error('Expected hold');
  hold.requireOwnership = true;
  state.scenarioSnapshot!.board.cells = [...state.scenarioSnapshot!.board.cells, [6, 2, 'city', 'red']];
  expect(order(structuredClone(state))).toBeUndefined();
  state.board.terrain[2]![6] = { kind: 'city', owner: 'red' };
  expect(order(structuredClone(state))).toBeDefined();
  state.units[1] = { ...state.units[1]!, position: undefined, embarkedIn: 'hurt' };
  expect(order(state)).toBeUndefined();
});

it('ignores invisible enemy placement when planning a relief', () => {
  const state = fixture();
  const enemies = state.units.filter((u) => u.owner === 'blue');
  const before = structuredClone(state);
  const action = defensiveHoldRelief(state, 'red', []);
  const hidden = structuredClone(state);
  hidden.units = hidden.units.map((u) => (u.owner === 'blue' && isDeployedUnit(u) ? { ...u, position: { x: 11, y: 0 }, hp: 1 } : u));
  expect(defensiveHoldRelief(hidden, 'red', [])).toEqual(action);
  expect(chooseCpuAction(hidden, 'normal', 'red', 'defensive')).toEqual(chooseCpuAction(state, 'normal', 'red', 'defensive'));
  expect(before.units.filter((u) => u.owner === 'blue')).toEqual(enemies);
});

it('keeps a completed hold win ahead of optional relief and supports non-ground posts', () => {
  const state = fixture();
  const hold = state.scenarioSnapshot!.victoryConditions[0]!;
  if (hold.type !== 'hold') throw Error('Expected hold');
  hold.turns = 1;
  expect(chooseCpuAction(state, 'normal', 'red', 'defensive')).toEqual({ type: 'endTurn' });
  const any = fixture();
  const condition = any.scenarioSnapshot!.victoryConditions[0]!;
  if (condition.type !== 'hold') throw Error('Expected hold');
  condition.groundOnly = false;
  expect(order(any)).toMatchObject({ type: 'move', unitId: 'hurt' });
  delete any.scenarioSnapshot;
  expect(order(any)).toBeUndefined();
});

it('does not discover hidden contacts through a projected retreat position', () => {
  const base = fixture();
  const expected = defensiveHoldRelief(base, 'red', []);
  let checked = 0;
  for (let y = 0; y < base.board.height; y++)
    for (let x = 0; x < base.board.width; x++) {
      const state = structuredClone(base);
      state.units[2]!.position = { x, y };
      if (visibleEnemies(state, 'red').length) continue;
      expect(defensiveHoldRelief(state, 'red', [])).toEqual(expected);
      checked++;
    }
  expect(checked).toBeGreaterThan(10);
});
