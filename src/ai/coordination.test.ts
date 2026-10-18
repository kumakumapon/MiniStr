import { describe, expect, it } from 'vitest';
import { coordinatedOrder, coordinationValue, cpuRole, isPriorityTarget, transportSafeAt } from './coordination';
import { bluePlanningState } from './perspective';
import { chooseCpuAction, cpuDifficultyConfig, createCpuPlanningContext, explainCpuAction } from './rules';
import { applyGameCommand, createScenarioInitialState, type DeployedUnit, type GameState } from '../game';
import { force, operation, valueOf } from '../game/operations.fixture';

const army = (units: GameState['units']): GameState => ({
  ...createScenarioInitialState(operation({ victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 7, y: 0 }], required: 1 }] })),
  units,
});

describe('CPU coordination', () => {
  it('assigns roles by mission, weapon and mobility and retains naval slots when ordering support', () => {
    const units = [
      force('gun', 'artillery', 0, 0),
      force('ship', 'landingShip', 0, 3),
      force('front', 'tank', 5, 1),
      force('supply', 'apc', 1, 1),
      force('air', 'fighter', 2, 0),
      force('aa', 'antiAir', 1, 0),
      force('r1', 'infantry', 0, 1),
    ];
    const state = army(units);
    expect(units.map((unit) => cpuRole(state, 'red', unit.id))).toEqual(['fireSupport', 'transport', 'frontline', 'supply', 'airDefence', 'airDefence', 'mission']);
    expect(cpuRole(state, 'red', 'missing')).toBeUndefined();
    expect(coordinatedOrder(state, 'red', units).map((unit) => unit.id)).toEqual(['front', 'ship', 'gun', 'air', 'aa', 'supply', 'r1']);
    expect(coordinatedOrder({ ...state, ruleVersion: 5 }, 'red', units)).toEqual(units);
    expect(units[0]!.id).toBe('gun');
    expect(cpuRole({ ...state, ruleVersion: 5 }, 'red', 'r1')).toBe('frontline');
  });

  it('keeps support behind a compatible front without dragging the front away from its goal', () => {
    const front = force('front', 'tank', 5, 1),
      supply = force('supply', 'apc', 1, 1);
    const state = army([front, supply]);
    const goal = [{ x: 7, y: 1 }];
    const score = (x: number) => coordinationValue(state, 'red', supply, { x, y: 1 }, goal);
    expect(score(3)).toBeGreaterThan(score(6));
    expect(score(3)).toBeGreaterThan(score(0));
    expect(coordinationValue(state, 'red', front, front.position, goal)).toBe(0);
    expect(coordinationValue(state, 'red', supply, supply.position, [])).toBe(0);
    expect(coordinationValue({ ...state, ruleVersion: 5 }, 'red', supply, { x: 3, y: 1 }, goal)).toBe(0);
    const alone = army([supply]);
    expect(coordinationValue(alone, 'red', supply, supply.position, goal)).toBe(0);
    expect(coordinationValue(alone, 'red', supply, { x: 2, y: 1 }, goal)).toBe(0);
    const incompatible = army([supply, force('naval', 'destroyer', 4, 3), force('helicopter', 'helicopter', 5, 0)]);
    expect(coordinationValue(incompatible, 'red', supply, supply.position, goal)).toBe(0);
    const sea = force('naval', 'battleship', 0, 3);
    expect(coordinationValue(army([sea]), 'red', sea, sea.position, goal)).toBe(0);
  });

  it('reserves shared exits for all designated targets and refreshes plans after immutable movement', () => {
    const scenario = operation({
      victoryConditions: [
        { type: 'escort', unitIds: ['r1'], positions: [{ x: 3, y: 1 }], required: 1 },
        { type: 'withdraw', unitIds: ['r2'], positions: [{ x: 3, y: 1 }], required: 1 },
      ],
    });
    const state = createScenarioInitialState(scenario),
      goals = [{ x: 3, y: 1 }];
    expect(coordinationValue(state, 'red', state.units[0] as DeployedUnit, goals[0]!, goals)).toBe(0);
    expect(coordinationValue(state, 'red', state.units[1] as DeployedUnit, goals[0]!, goals)).toBe(0);
    expect(coordinationValue(state, 'red', state.units[2] as DeployedUnit, goals[0]!, goals)).toBe(-150);
    const front = force('front', 'tank', 5, 1),
      gun = force('gun', 'artillery', 0, 0);
    const first = army([front, gun]);
    const prior = coordinationValue(first, 'red', gun, { x: 2, y: 1 }, [{ x: 7, y: 1 }]);
    const second = { ...first, units: [{ ...front, position: { x: 6, y: 1 } }, gun] };
    expect(coordinationValue(second, 'red', gun, { x: 2, y: 1 }, [{ x: 7, y: 1 }])).not.toBe(prior);
  });

  it('prioritizes public mission defenders and confirmed opposing evacuees for either side', () => {
    const scenario = operation({
      victoryConditions: [{ type: 'hold', positions: [{ x: 4, y: 1 }], turns: 2 }],
      defeatConditions: [{ type: 'withdraw', unitIds: ['b1'], positions: [{ x: 6, y: 1 }], required: 1 }],
    });
    const state = createScenarioInitialState(scenario);
    expect(isPriorityTarget(state, 'red', force('defender', 'tank', 4, 1, { owner: 'blue' }))).toBe(true);
    expect(isPriorityTarget(state, 'red', force('b1', 'tank', 7, 2, { owner: 'blue' }))).toBe(true);
    expect(isPriorityTarget(state, 'red', force('ordinary', 'tank', 7, 2, { owner: 'blue' }))).toBe(false);
    expect(isPriorityTarget(state, 'red', state.units[0]!)).toBe(false);
    expect(isPriorityTarget({ ...state, ruleVersion: 5 }, 'red', state.units[3]!)).toBe(false);
    const cargo = { ...force('b1', 'infantry', 0, 0, { owner: 'blue' }), position: undefined, embarkedIn: 'b2' };
    expect(isPriorityTarget(state, 'red', cargo)).toBe(false);
    expect(cpuRole(state, 'blue', 'b1')).toBe('mission');
    expect(cpuRole(state, 'blue', 'b1')).toBe('mission');
    const anonymous = { ...state, scenarioId: undefined, scenarioSnapshot: undefined };
    expect(isPriorityTarget(anonymous, 'red', state.units[3]!)).toBe(false);
    expect(cpuRole(anonymous, 'red', 'r1')).toBe('frontline');
  });

  it('holds protected transports for a credible visible threat and accepts a healthy escort', () => {
    const convoy = force('r1', 'apc', 0, 1),
      enemy = force('b', 'tank', 4, 1, { owner: 'blue' });
    const state = army([convoy, enemy]),
      destination = { x: 3, y: 1 };
    const before = structuredClone(state);
    expect(transportSafeAt(state, convoy, destination, [enemy])).toBe(false);
    expect(transportSafeAt(state, convoy, destination, [])).toBe(true);
    expect(transportSafeAt(state, convoy, destination, [{ ...enemy, hp: 1 }])).toBe(true);
    expect(transportSafeAt(state, convoy, destination, [{ ...enemy, position: { x: 7, y: 3 } }])).toBe(true);
    expect(transportSafeAt(state, convoy, destination, [force('b', 'infantry', 4, 1, { owner: 'blue' })])).toBe(true);
    expect(transportSafeAt(state, convoy, destination, [{ ...enemy, position: undefined, embarkedIn: 'b2' }])).toBe(true);
    expect(transportSafeAt({ ...state, ruleVersion: 5 }, convoy, destination, [enemy])).toBe(true);
    expect(transportSafeAt(army([force('ordinary', 'apc', 0, 1)]), force('ordinary', 'apc', 0, 1), destination, [enemy])).toBe(true);
    for (const [escort, safe] of [
      [force('guard', 'tank', 2, 1), true],
      [force('guard', 'tank', 2, 1, { hp: 39 }), false],
      [force('guard', 'destroyer', 2, 1), false],
      [force('guard', 'fighter', 2, 1), true],
      [force('guard', 'tank', 0, 3), false],
    ] as const) {
      expect(transportSafeAt({ ...state, units: [...state.units, escort] }, convoy, destination, [enemy])).toBe(safe);
    }
    expect(transportSafeAt(state, convoy, destination, [{ ...enemy, ammo: 0, fuel: 0 }])).toBe(transportSafeAt(state, convoy, destination, [{ ...enemy, ammo: 6, fuel: 99 }]));
    expect(state).toEqual(before);
  });

  it('keeps loaded sea transports with naval or air escorts including indirect cover', () => {
    const ship = force('ship', 'landingShip', 0, 3),
      enemy = force('b', 'bomber', 4, 3, { owner: 'blue' });
    const cargo = { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: ship.id };
    const state = army([ship, cargo, enemy]);
    expect(transportSafeAt(state, ship, { x: 3, y: 3 }, [enemy])).toBe(false);
    expect(transportSafeAt({ ...state, units: [...state.units, force('guard', 'tank', 3, 2)] }, ship, { x: 3, y: 3 }, [enemy])).toBe(false);
    expect(transportSafeAt({ ...state, units: [...state.units, force('guard', 'battleship', 0, 0)] }, ship, { x: 3, y: 3 }, [enemy])).toBe(true);
    expect(transportSafeAt({ ...state, units: [...state.units, force('guard', 'fighter', 2, 3)] }, ship, { x: 3, y: 3 }, [enemy])).toBe(true);
  });

  it.each(['red', 'blue'] as const)('moves and evacuates the %s target with legal recorded commands', (player) => {
    const id = player === 'red' ? 'r1' : 'b1';
    const condition = { type: 'withdraw' as const, unitIds: [id], positions: [{ x: player === 'red' ? 3 : 5, y: player === 'red' ? 1 : 2 }], required: 1 };
    const scenario = operation(player === 'red' ? { victoryConditions: [condition] } : { defeatConditions: [condition] });
    let state = { ...createScenarioInitialState(scenario), activePlayer: player };
    const move = chooseCpuAction(state, 'hard');
    expect(move).toMatchObject({ type: 'move', unitId: id });
    state = valueOf(applyGameCommand(state, move));
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'evacuate', unitId: id });
    expect(explainCpuAction(state, 'hard')).toMatchObject({ role: 'mission', action: { type: 'evacuate', unitId: id } });
    state = valueOf(applyGameCommand(state, chooseCpuAction(state, 'hard')));
    expect(state.winner).toBe(player);
  });

  it('does not issue another evacuation move to moved or acted targets', () => {
    const initial = createScenarioInitialState(operation());
    const state = { ...initial, units: initial.units.map((unit) => (unit.id === 'r1' ? { ...unit, hasMoved: true } : unit.id === 'r2' ? { ...unit, hasActed: true } : unit)) };
    const action = chooseCpuAction(state, 'hard');
    expect(action).not.toMatchObject({ type: 'move', unitId: 'r1' });
    expect(action).not.toMatchObject({ type: 'move', unitId: 'r2' });
    expect(applyGameCommand(state, action).ok).toBe(true);
  });

  it('keeps a protected target behind its escort requirement during move-and-attack planning too', () => {
    const state = createScenarioInitialState(
      operation({
        board: { width: 5, height: 1, cells: [] },
        initialUnits: [
          { kind: 'tank', owner: 'red', x: 0, y: 0 },
          { kind: 'heavyTank', owner: 'blue', x: 2, y: 0 },
        ],
        victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 4, y: 0 }], required: 1 }],
      }),
    );
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'endTurn' });
  });

  it('keeps a convoy with its available guards even before any enemy is observed', () => {
    const target = force('r1', 'apc', 0, 1),
      guard = force('guard', 'tank', 0, 0);
    const state = army([target, guard]);
    expect(transportSafeAt(state, target, { x: 6, y: 1 }, [])).toBe(false);
    expect(transportSafeAt(state, target, { x: 1, y: 1 }, [])).toBe(true);
    expect(transportSafeAt(army([target]), target, { x: 6, y: 1 }, [])).toBe(true);
    const enemy = force('enemy', 'tank', 4, 1, { owner: 'blue' });
    expect(transportSafeAt(army([{ ...target, hp: 10 }, guard, enemy]), { ...target, hp: 10 }, { x: 3, y: 1 }, [enemy])).toBe(false);
  });

  it('takes an unoccupied exit and evacuates before a nearby enemy can respond', () => {
    let state = createScenarioInitialState(
      operation({
        board: { width: 3, height: 1, cells: [] },
        initialUnits: [
          { kind: 'tank', owner: 'red', x: 0, y: 0 },
          { kind: 'heavyTank', owner: 'blue', x: 2, y: 0 },
        ],
        victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 1, y: 0 }], required: 1 }],
      }),
    );
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'move', unitId: 'r1', destination: { x: 1, y: 0 } });
    state = valueOf(applyGameCommand(state, chooseCpuAction(state, 'hard')));
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'evacuate', unitId: 'r1' });
    expect(valueOf(applyGameCommand(state, chooseCpuAction(state, 'hard'))).winner).toBe('red');
  });

  it.each(['escort', 'withdraw'] as const)('sails an empty mission transport out of its port for %s', (type) => {
    let state = createScenarioInitialState(
      operation({
        board: { width: 8, height: 1, cells: [[0, 0, 'port', 'red'], ...Array.from({ length: 7 }, (_, index) => [index + 1, 0, 'sea'] as const)] },
        initialUnits: [
          { kind: 'landingShip', owner: 'red', x: 0, y: 0 },
          { kind: 'fighter', owner: 'blue', x: 7, y: 0 },
        ],
        victoryConditions: [{ type, unitIds: ['r1'], positions: [{ x: 4, y: 0 }], required: 1 }],
      }),
    );
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'move', unitId: 'r1', destination: { x: 4, y: 0 } });
    state = valueOf(applyGameCommand(state, chooseCpuAction(state, 'hard')));
    expect(chooseCpuAction(state, 'hard')).toEqual({ type: 'evacuate', unitId: 'r1' });
    expect(valueOf(applyGameCommand(state, chooseCpuAction(state, 'hard'))).winner).toBe('red');
  });

  it('uses visible opposing targets or their public exits and rotates evacuated snapshots', () => {
    const state = createScenarioInitialState(operation({ defeatConditions: [{ type: 'eliminate' }] }));
    expect(createCpuPlanningContext(state, 'blue', cpuDifficultyConfig.hard).targets).toEqual([{ x: 3, y: 1 }]);
    const seen = { ...state, units: state.units.map((unit) => (unit.id === 'r1' ? { ...unit, position: { x: 5, y: 2 } } : unit)) };
    expect(createCpuPlanningContext(seen, 'blue', cpuDifficultyConfig.hard).targets).toContainEqual({ x: 5, y: 2 });
    const escaped = { ...state, evacuatedUnits: [{ ...force('r1', 'infantry', 3, 1), hasMoved: true, hasActed: true }] };
    const rotated = bluePlanningState(escaped);
    expect(rotated.evacuatedUnits?.[0]?.position).toEqual({ x: 4, y: 2 });
    expect(bluePlanningState(rotated).evacuatedUnits).toEqual(escaped.evacuatedUnits);
    const embarked = { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'ship' };
    expect(bluePlanningState({ ...state, evacuatedUnits: [embarked] }).evacuatedUnits?.[0]).toEqual(embarked);
  });
});
