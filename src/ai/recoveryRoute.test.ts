import { expect, it } from 'vitest';
import { applyGameCommand, createScenarioInitialState, endTurn, type GameState, type PlayerId } from '../game';
import { force, operation, valueOf } from '../game/operations.fixture';
import { chooseCpuAction } from './rules';
import { supplyRendezvous } from './supplyRendezvous';
import { isDeployedUnit } from '../game/types';
import { defensiveRepairRoute, defensiveServiceWait } from './recovery';

function fixture(player: PlayerId = 'red'): GameState {
  const foe = player === 'red' ? 'blue' : 'red';
  const state = createScenarioInitialState(
    operation({ board: { width: 20, height: 4, cells: [] }, victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }] }),
  );
  state.activePlayer = player;
  state.recon = { remaining: { red: 0, blue: 0 }, centers: [] };
  state.units = [force('hurt', 'artillery', 10, 1, { owner: player, hp: 30 }), force('enemy', 'tank', 19, 3, { owner: foe })];
  state.players[player] = { ...state.players[player], gold: 5000, income: 0 };
  state.board.terrain[1]![0] = { kind: 'city', owner: player };
  state.board.terrain[1]![19] = { kind: 'capital', owner: foe };
  return state;
}

it.each(['red', 'blue'] as const)('routes a supplied, badly hurt %s defender over several turns to actual paid repair', (player) => {
  let state = fixture(player);
  for (let step = 0; step < 4; step++) {
    const before = structuredClone(state);
    const action = chooseCpuAction(state, 'normal', player, 'defensive');
    expect(action).toMatchObject({ type: 'move', unitId: 'hurt' });
    if (action.type !== 'move') throw Error('Expected a repair approach');
    const previous = state.units.find((unit) => unit.id === 'hurt')!;
    expect(action.destination.x).toBeLessThan(previous.position!.x);
    expect(chooseCpuAction(structuredClone(state), 'normal', player, 'defensive')).toEqual(action);
    expect(state).toEqual(before);
    state = valueOf(applyGameCommand(state, action));
    state = endTurn(endTurn(state));
    const repaired = state.units.find((unit) => unit.id === 'hurt')!;
    if (repaired.hp > 30) {
      expect(repaired.position).toEqual({ x: 0, y: 1 });
      expect(repaired.hp).toBe(50);
      return;
    }
  }
  throw Error('Defender did not reach repair');
});

it('keeps healthy, unaffordable, incompatible and disconnected repair approaches on their mission', () => {
  const cases = [fixture(), fixture(), fixture(), fixture()];
  cases[0]!.units[0]!.hp = 70;
  cases[1]!.players.red.gold = 0;
  cases[2]!.board.terrain[1]![0] = { kind: 'airport', owner: 'red' };
  for (const row of cases[3]!.board.terrain) row[5] = { kind: 'sea' };
  for (const state of cases) {
    const action = chooseCpuAction(state, 'normal', 'red', 'defensive');
    expect(action).toMatchObject({ type: 'move', unitId: 'hurt' });
    if (action.type !== 'move') throw Error('Expected mission approach');
    expect(action.destination.x).toBeGreaterThan(10);
  }
});

it('uses useful delivered stock to rank safe berths and restores both recipients next turn', () => {
  let state = fixture();
  state.units = [
    force('truck', 'apc', 0, 1),
    force('a', 'infantry', 1, 1, { fuel: 0 }),
    force('b', 'artillery', 3, 1, { ammo: 0 }),
    force('enemy', 'tank', 19, 3, { owner: 'blue' }),
  ];
  const own = state.units.filter((unit) => unit.owner === 'red' && isDeployedUnit(unit)).filter(isDeployedUnit);
  const before = structuredClone(state);
  const action = supplyRendezvous(state, 'red', own, () => 0);
  expect(action).toEqual({ type: 'move', unitId: 'truck', destination: { x: 2, y: 1 } });
  expect(state).toEqual(before);
  state = valueOf(applyGameCommand(state, action!));
  state = endTurn(endTurn(state));
  expect(state.units.find((unit) => unit.id === 'a')!.fuel).toBeGreaterThan(0);
  expect(state.units.find((unit) => unit.id === 'b')!.ammo).toBeGreaterThan(0);
});

it('caches public reachable routes without mutating the state or reading hidden enemy placement', () => {
  const state = fixture();
  const before = structuredClone(state);
  const route = defensiveRepairRoute(state, 'red', state.units[0]! as ReturnType<typeof force>);
  expect(route?.get('10,1')).toBe(10);
  expect(route?.get('0,1')).toBe(0);
  expect(defensiveRepairRoute(state, 'red', state.units[0]! as ReturnType<typeof force>)).toBe(route);
  expect(state).toEqual(before);
  const hidden = structuredClone(state);
  hidden.units[1]!.position = { x: 0, y: 1 };
  hidden.units[1]!.hp = 1;
  hidden.units[1]!.ammo = 0;
  expect(defensiveRepairRoute(hidden, 'red', hidden.units[0]! as ReturnType<typeof force>)).toEqual(route);
  const parked = fixture();
  parked.units[0]!.position = { x: 0, y: 1 };
  expect(defensiveRepairRoute(parked, 'red', parked.units[0]! as ReturnType<typeof force>)?.get('0,1')).toBe(0);
});

it('does not create recovery orders for legacy rules, other players, occupied berths or loaded transports', () => {
  const legacy = fixture();
  delete legacy.ruleVersion;
  const occupied = fixture();
  occupied.units.push(force('ally', 'infantry', 0, 1));
  const loaded = fixture();
  loaded.units[0] = force('hurt', 'apc', 10, 1, { hp: 30 });
  loaded.units.push({ ...force('cargo', 'infantry', 10, 1), position: undefined, embarkedIn: 'hurt' });
  for (const state of [legacy, occupied, loaded]) {
    const unit = state.units[0]! as ReturnType<typeof force>;
    expect(defensiveRepairRoute(state, 'red', unit)).toBeUndefined();
    expect(defensiveRepairRoute(state, 'red', unit)).toBeUndefined();
  }
  const state = fixture();
  expect(defensiveRepairRoute(state, 'blue', state.units[0]! as ReturnType<typeof force>)).toBeUndefined();
});

it('preserves an evacuation target mission even when it is badly hurt', () => {
  const state = createScenarioInitialState(operation());
  state.units[0]!.hp = 30;
  state.players.red.gold = 5000;
  state.board.terrain[0]![0] = { kind: 'city', owner: 'red' };
  const unit = state.units[0]!;
  expect(unit.id).toBe('r1');
  if (!isDeployedUnit(unit)) throw Error('Expected deployed evacuee');
  expect(defensiveRepairRoute(state, 'red', unit)).toBeUndefined();
});

it('rejects fuel-starved and too-late relief commitments without discarding general recovery orders', () => {
  const dry = fixture();
  dry.units[0]!.fuel = 9;
  const late = fixture();
  late.scenarioSnapshot!.decisionRound = 6;
  const survive = fixture();
  survive.scenarioSnapshot!.defeatConditions = [{ type: 'survive', untilTurn: 6 }];
  for (const state of [dry, late, survive]) {
    const unit = state.units[0]!;
    if (!isDeployedUnit(unit)) throw Error('Expected defender');
    expect(defensiveRepairRoute(state, 'red', unit, 'relief')).toBeUndefined();
    expect(defensiveRepairRoute(state, 'red', unit)).toBeDefined();
    expect(defensiveRepairRoute(state, 'red', unit, 'relief')).toBeUndefined();
  }
});

it('finishes affordable repair but releases healthy, spent, loaded, legacy, evacuation and threatened units', () => {
  const state = fixture();
  state.units[0]!.position = { x: 0, y: 1 };
  state.units[0]!.hp = 41;
  expect(defensiveServiceWait(state, 'red', [])).toEqual({ type: 'wait', unitId: 'hurt' });
  for (const patch of [
    (s: GameState) => {
      s.units[0]!.hp = 50;
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
      s.board.terrain[1]![0] = { kind: 'plain' };
    },
    (s: GameState) => {
      s.units.push({ ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'hurt' });
    },
    (s: GameState) => {
      s.units[0]!.id = 'r1';
      s.scenarioSnapshot!.victoryConditions = [{ type: 'withdraw', unitIds: ['r1'], positions: [{ x: 19, y: 1 }], required: 1 }];
    },
    (s: GameState) => {
      delete s.ruleVersion;
    },
  ]) {
    const next = structuredClone(state);
    patch(next);
    expect(defensiveServiceWait(next, 'red', [])).toBeUndefined();
  }
  const threatened = structuredClone(state);
  threatened.units[0]!.hp = 1;
  threatened.units[1] = force('enemy', 'rocket', 3, 1, { owner: 'blue' });
  expect(defensiveServiceWait(threatened, 'red', [threatened.units[1]!, { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'enemy' }])).toBeUndefined();
});

it.each(['red', 'blue'] as const)('finishes %s recovery in movement order while keeping useful attacks available', (player) => {
  let state = fixture(player);
  state.units[0] = force('hurt', 'recon', 0, 1, { owner: player, hp: 41 });
  expect(chooseCpuAction(state, 'normal', player, 'defensive')).toEqual({ type: 'wait', unitId: 'hurt' });
  state = endTurn(endTurn(valueOf(applyGameCommand(state, { type: 'wait', unitId: 'hurt' }))));
  expect(state.units[0]!.hp).toBe(61);
  const returned = chooseCpuAction(state, 'normal', player, 'defensive');
  expect(returned).toMatchObject({ type: 'move', unitId: 'hurt' });
  if (returned.type !== 'move') throw Error('Expected repaired return');
  expect(returned.destination.x).toBeGreaterThan(0);
  const shooting = fixture(player);
  shooting.units[0] = force('hurt', 'recon', 0, 1, { owner: player, hp: 41 });
  shooting.units[1] = force('enemy', 'infantry', 1, 1, { owner: player === 'red' ? 'blue' : 'red', hp: 1 });
  expect(chooseCpuAction(shooting, 'normal', player, 'defensive')).toEqual({ type: 'attack', unitId: 'hurt', targetId: 'enemy' });
});
