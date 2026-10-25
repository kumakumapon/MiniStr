import { expect, it } from 'vitest';
import { airliftScenario } from '../game/airlift.fixture';
import { valueOf, force } from '../game/operations.fixture';
import { applyGameCommand, createScenarioInitialState, embarkUnit, endTurn, parseReplay, createReplay, serializeReplay, parseSavedGame, saveGame, type GameCommand } from '../game';
import { chooseCpuAction, createCpuPlanningContext, cpuDifficultyConfig } from './rules';
import { chooseAirliftAction } from './airlift';
import { cpuRole } from './coordination';

it('uses a helicopter to carry infantry across water and capture, then replays and restores exactly', () => {
  const initial = createScenarioInitialState(airliftScenario());
  let state = initial;
  const commands: GameCommand[] = [];
  for (let n = 0; n < 250 && !state.winner; n++) {
    const command = state.activePlayer === 'blue' ? { type: 'endTurn' as const } : chooseCpuAction(state, 'hard');
    state = valueOf(applyGameCommand(state, command));
    commands.push(command);
  }
  expect(state.winner).toBe('red');
  expect(state.turn).toBeLessThanOrEqual(20);
  expect(commands.some((c) => c.type === 'embark')).toBe(true);
  expect(commands.some((c) => c.type === 'disembark')).toBe(true);
  const replay = valueOf(createReplay({ mapId: initial.scenarioId!, difficulty: 'normal', initialState: initial, commands }));
  expect(valueOf(parseReplay(valueOf(serializeReplay(replay)))).finalState).toEqual(state);
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  expect(saveGame(storage, 'test', { mapId: initial.scenarioId!, difficulty: 'normal', initialState: initial, gameState: state, commands }).ok).toBe(true);
  expect(valueOf(parseSavedGame(data.get('test')!)).gameState).toEqual(state);
});
it('builds one airlift for stranded infantry only under v11', () => {
  for (const ruleVersion of [10, 11] as const) {
    let state = { ...createScenarioInitialState(airliftScenario(false)), ruleVersion };
    let produced = false;
    for (let n = 0; n < 12 && state.activePlayer === 'red'; n++) {
      const action = chooseCpuAction(state, 'hard');
      if (action.type === 'produce' && action.kind === 'transportHelicopter') produced = true;
      state = valueOf(applyGameCommand(state, action)) as typeof state;
    }
    expect(produced).toBe(ruleVersion === 11);
  }
});
it('ignores hidden anti-air units and considers confirmed threats on a loaded route', () => {
  let state = createScenarioInitialState(airliftScenario());
  state = endTurn(endTurn(valueOf(embarkUnit(state, 'r1', 'r2'))));
  const context = createCpuPlanningContext(state, 'red', cpuDifficultyConfig.hard);
  const action = chooseAirliftAction(state, 'red', context.targets, context.landComponents, []);
  expect(action?.type).toBe('move');
  const enemy = force('hidden', 'antiAir', 8, 2, { owner: 'blue' });
  const hidden = { ...state, units: [...state.units, enemy] };
  expect(chooseAirliftAction(hidden, 'red', context.targets, context.landComponents, [])).toEqual(action);
  const confirmed = chooseAirliftAction(hidden, 'red', context.targets, context.landComponents, [enemy]);
  expect(confirmed).not.toEqual(action);
  expect(cpuRole(state, 'red', 'r2')).toBe('transport');
});

it('waits for fuel, passengers or objectives and only approaches a ready passenger', () => {
  const initial = createScenarioInitialState(airliftScenario());
  const decide = (state: typeof initial, targets?: readonly { x: number; y: number }[]) => {
    const context = createCpuPlanningContext(state, 'red', cpuDifficultyConfig.hard);
    return chooseAirliftAction(state, 'red', targets ?? context.targets, context.landComponents, []);
  };
  expect(decide(initial, [])).toBeUndefined();
  expect(decide({ ...initial, units: initial.units.filter((u) => u.id !== 'r1') })).toBeUndefined();
  for (const patch of [{ fuel: 12 }, { hasMoved: true }, { hasActed: true }])
    expect(decide({ ...initial, units: initial.units.map((u) => (u.id === 'r2' ? { ...u, ...patch } : u)) })).toBeUndefined();
  const distant = { ...initial, units: initial.units.map((u) => (u.id === 'r2' ? { ...u, fuel: undefined, position: { x: 1, y: 0 } } : u)) };
  expect(decide(distant)).toMatchObject({ type: 'move', unitId: 'r2' });
  expect(decide({ ...distant, units: distant.units.map((u) => (u.id === 'r1' ? { ...u, hasActed: true } : u)) })).toBeUndefined();
  const loaded = endTurn(endTurn(valueOf(embarkUnit(initial, 'r1', 'r2'))));
  expect(decide(loaded, [])).toBeUndefined();
});

it('lands beside the objective only on a vacant traversable tile', () => {
  let state = createScenarioInitialState(airliftScenario());
  state = endTurn(endTurn(valueOf(embarkUnit(state, 'r1', 'r2'))));
  state = { ...state, units: state.units.map((u) => (u.id === 'r2' ? { ...u, position: { x: 11, y: 2 } } : u)) };
  const context = createCpuPlanningContext(state, 'red', cpuDifficultyConfig.hard);
  const decide = (s: typeof state) => chooseAirliftAction(s, 'red', [{ x: 11, y: 2 }], context.landComponents, []);
  expect(decide(state)).toMatchObject({ type: 'disembark', transportId: 'r2' });
  const neighbors = [
    { x: 10, y: 2 },
    { x: 12, y: 2 },
    { x: 11, y: 1 },
    { x: 11, y: 3 },
  ];
  expect(decide({ ...state, units: [...state.units, ...neighbors.map((p, n) => force(`block${n}`, 'infantry', p.x, p.y))] })).toBeUndefined();
});
