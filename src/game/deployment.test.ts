import { describe, expect, it } from 'vitest';
import { createDeploymentScenario, deploymentBudget, deploymentSlots } from './deployment';
import { createScenarioInitialState, maps, operationScenarios, scenarioDefinitionToData } from './maps';
import { operation, valueOf } from './operations.fixture';
import { unitStats } from './units';
import type { UnitKind } from './types';

describe('pre-operation deployment', () => {
  it('accepts every default force without moving slots or mutating the source', () => {
    for (const scenario of [...maps, ...operationScenarios])
      for (const player of ['red', 'blue'] as const) {
        const before = structuredClone(scenario);
        const slots = deploymentSlots(scenario, player);
        const chosen = valueOf(
          createDeploymentScenario(
            scenario,
            slots.map((slot) => slot.kind),
            player,
          ),
        );
        expect(chosen.initialUnits, scenario.id).toEqual(scenario.initialUnits);
        expect(deploymentBudget(scenario, player)).toBe(slots.reduce((sum, slot) => sum + unitStats[slot.kind].cost, 0));
        expect(scenario).toEqual(before);
      }
  });

  it('keeps IDs and domains, terrain restrictions, escort targets and transports', () => {
    const scenario = operation({
      board: {
        width: 8,
        height: 4,
        cells: [
          [0, 1, 'mountain'],
          [3, 3, 'sea'],
          [4, 3, 'sea'],
        ],
      },
      initialUnits: [
        { kind: 'infantry', owner: 'red', x: 0, y: 1 },
        { kind: 'fighter', owner: 'red', x: 2, y: 1 },
        { kind: 'destroyer', owner: 'red', x: 3, y: 3 },
        { kind: 'landingShip', owner: 'red', x: 4, y: 3 },
        { kind: 'apc', owner: 'blue', x: 7, y: 1 },
      ],
      victoryConditions: [{ type: 'escort', unitIds: ['r2'], positions: [{ x: 3, y: 1 }], required: 1 }],
      defeatConditions: [{ type: 'escort', unitIds: ['b1'], positions: [{ x: 6, y: 1 }], required: 1 }],
    });
    const slots = deploymentSlots(scenario);
    expect(slots.map((slot) => slot.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(slots[0]!.choices).toEqual(['infantry', 'mech']);
    expect(slots[1]).toMatchObject({ fixed: true, choices: ['fighter'] });
    expect(slots[2]!.choices).toContain('battleship');
    expect(slots[2]!.choices).not.toContain('tank');
    expect(slots[3]).toMatchObject({ fixed: true, choices: ['landingShip'] });
    expect(deploymentSlots(scenario, 'blue')[0]).toMatchObject({ id: 'b1', fixed: true, choices: ['apc'] });
    expect(createDeploymentScenario(scenario, ['tank', 'fighter', 'destroyer', 'landingShip']).ok).toBe(false);
    expect(createDeploymentScenario(scenario, ['infantry', 'bomber', 'destroyer', 'landingShip']).ok).toBe(false);
    const air = operation({ initialUnits: [{ kind: 'bomber', owner: 'red', x: 0, y: 0 }], victoryConditions: [{ type: 'eliminate' }] });
    expect(deploymentSlots(air)[0]!.choices).toEqual(expect.arrayContaining(['fighter', 'bomber', 'helicopter']));
  });

  it('rejects missing, unknown and excessive choices and over-budget forces', () => {
    const base = operation();
    for (const choices of [null, [], ['infantry'], ['infantry', 'tank', 'apc', 'infantry'], ['unknown', 'tank', 'apc']]) {
      expect(createDeploymentScenario(base, choices as unknown as UnitKind[]).ok).toBe(false);
    }
    expect(createDeploymentScenario(base, ['heavyTank', 'heavyTank', 'heavyTank'])).toMatchObject({ ok: false, error: expect.stringContaining('予算') });
  });

  it('keeps the needed capturing force but permits non-capturing evacuation armies', () => {
    const base = operation({ victoryConditions: [{ type: 'captureCapital' }] });
    expect(createDeploymentScenario(base, ['recon', 'recon', 'recon'])).toMatchObject({ ok: false, error: expect.stringContaining('歩兵系') });
    expect(createDeploymentScenario(operation(), ['recon', 'recon', 'recon']).ok).toBe(true);
    const hold = operation({
      board: {
        width: 8,
        height: 4,
        cells: [
          [2, 0, 'city'],
          [3, 0, 'factory'],
        ],
      },
      initialUnits: [
        { kind: 'infantry', owner: 'red', x: 0, y: 0 },
        { kind: 'infantry', owner: 'red', x: 1, y: 0 },
        { kind: 'heavyTank', owner: 'red', x: 4, y: 0 },
      ],
      victoryConditions: [
        {
          type: 'hold',
          positions: [
            { x: 2, y: 0 },
            { x: 3, y: 0 },
          ],
          turns: 2,
          requireOwnership: true,
        },
      ],
    });
    expect(createDeploymentScenario(hold, ['infantry', 'recon', 'recon']).ok).toBe(false);
    expect(createDeploymentScenario(hold, ['infantry', 'infantry', 'recon']).ok).toBe(true);
  });

  it('credits unused budget once per side from the immutable base', () => {
    const base = operation({ firstPlayerBonus: 100, secondPlayerBonus: 200 });
    const choices: UnitKind[] = ['infantry', 'infantry', 'infantry'];
    const remaining = deploymentBudget(base) - 3 * unitStats.infantry.cost;
    const red = valueOf(createDeploymentScenario(base, choices));
    expect(red.firstPlayerBonus).toBe(100 + remaining);
    expect(createScenarioInitialState(red).players.red.gold).toBe(createScenarioInitialState(base).players.red.gold + remaining);
    expect(valueOf(createDeploymentScenario(base, choices))).toEqual(red);
    const both = valueOf(createDeploymentScenario(red, ['infantry', 'infantry'], 'blue'));
    expect(both.firstPlayerBonus).toBe(red.firstPlayerBonus);
    expect(both.secondPlayerBonus).toBe(200 + deploymentBudget(base, 'blue') - 2 * unitStats.infantry.cost);
    expect(base.firstPlayerBonus).toBe(100);
  });

  it('assigns veterans by selected kind, highest first and one-to-one', () => {
    const base = operation();
    const veterans = [
      { kind: 'infantry' as const, experience: 2 },
      { kind: 'tank' as const, experience: 8 },
      { kind: 'infantry' as const, experience: 6 },
    ];
    const original = structuredClone(veterans);
    const chosen = valueOf(createDeploymentScenario(base, ['infantry', 'infantry', 'infantry'], 'red', veterans));
    expect(chosen.initialUnits.filter((unit) => unit.owner === 'red').map((unit) => unit.experience)).toEqual([6, 2, undefined]);
    expect(veterans).toEqual(original);
    const inherited = operation({ initialUnits: [{ kind: 'infantry', owner: 'red', x: 0, y: 0, experience: 3 }], victoryConditions: [{ type: 'eliminate' }] });
    expect(valueOf(createDeploymentScenario(inherited, ['infantry'])).initialUnits[0]!.experience).toBe(3);
    expect(createDeploymentScenario(base, ['infantry', 'tank', 'apc'], 'red', [{ kind: 'infantry', experience: 1000 }]).ok).toBe(false);
  });

  it('supports a legacy custom army with more than 64 units on one side', () => {
    const base = operation({
      board: { width: 8, height: 9, cells: [] },
      initialUnits: Array.from({ length: 65 }, (_, index) => ({ kind: 'infantry', owner: 'red', x: index % 8, y: Math.floor(index / 8) })),
    });
    expect(
      createDeploymentScenario(
        base,
        deploymentSlots(base).map((slot) => slot.kind),
      ).ok,
    ).toBe(true);
    const empty = operation({ initialUnits: [], victoryConditions: [{ type: 'eliminate' }] });
    expect(valueOf(createDeploymentScenario(empty, [])).initialUnits).toEqual([]);
    expect(scenarioDefinitionToData(base).initialUnits).toHaveLength(65);
  });
});
