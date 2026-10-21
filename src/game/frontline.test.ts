import { describe, expect, it } from 'vitest';
import {
  applyGameCommand,
  applyModernUpkeep,
  canProduceUnit,
  captureProperty,
  collectIncome,
  createBoard,
  createGameState,
  createReplay,
  createScenarioInitialState,
  disembarkUnit,
  forecastCombat,
  fortificationError,
  fortifyUnit,
  incomePropertyCount,
  isGameCommand,
  isGameState,
  isUnitKindAvailable,
  loadScenarioDefinitions,
  matchesScenarioInitialState,
  moveUnit,
  parseReplay,
  parseSavedGame,
  productionKindsForRule,
  replayCommands,
  saveGame,
  scenarioById,
  scenarioDefinitionToData,
  serializeReplay,
  unitDefenseStars,
  unitStats,
  validFortifications,
  type GameState,
  type Unit,
} from './index';
import { ReplayTimeline } from './replayTimeline';
import { bluePlanningState } from '../ai/perspective';
import { valueOf } from './operations.fixture';

const unit = (id: string, kind: Unit['kind'], x: number, y: number, patch: Partial<Unit> = {}): Unit => ({
  id,
  kind,
  owner: 'red',
  position: { x, y },
  hp: 60,
  fuel: 2,
  ammo: 0,
  secondaryAmmo: 0,
  hasMoved: false,
  hasActed: false,
  ...patch,
});
function field(): GameState {
  return { ...createGameState(createBoard(8, 5)), ruleVersion: 8, players: { red: { gold: 5000, income: 0 }, blue: { gold: 0, income: 0 } }, units: [unit('e', 'engineer', 2, 2)] };
}

describe('frontline depots', () => {
  it('rearms both weapons on and adjacent to the depot without HP repairs or income', () => {
    const state = field();
    state.board.terrain[2]![2] = { kind: 'supplyDepot', owner: 'red' };
    state.units = [unit('t', 'tank', 2, 2), unit('a', 'artillery', 3, 2), unit('out', 'tank', 3, 3), unit('enemy', 'tank', 1, 2, { owner: 'blue' }), unit('air', 'fighter', 2, 1)];
    const next = applyModernUpkeep(collectIncome(state), 'red', false);
    for (const id of ['t', 'a']) {
      const result = next.units.find((candidate) => candidate.id === id)!;
      expect(result.ammo).toBe(unitStats[result.kind].ammo);
      expect(result.secondaryAmmo).toBe(6);
      expect(result.fuel).toBe(unitStats[result.kind].fuel);
      expect(result.hp).toBe(60);
    }
    for (const id of ['out', 'enemy', 'air']) expect(next.units.find((candidate) => candidate.id === id)!.ammo).toBe(0);
    expect(next.players.red).toEqual(state.players.red);
    expect(incomePropertyCount(state, 'red')).toBe(0);
    expect(canProduceUnit('supplyDepot', 'infantry', 'facility-v2', 8)).toBe(false);
    expect(state.units[0]!.ammo).toBe(0);
  });
  it('supplies APC cargo and switches service after legal capture, including caches', () => {
    let state = field();
    state.board.terrain[2]![2] = { kind: 'supplyDepot', owner: 'blue' };
    state.units[0]!.hp = 100;
    expect(applyModernUpkeep(state, 'red').units[0]!.ammo).toBe(0);
    state = valueOf(captureProperty(state, 'e'));
    state.units[0]!.hasActed = false;
    state = valueOf(captureProperty(state, 'e'));
    state.units.push(unit('apc', 'apc', 3, 2), unit('cargo', 'infantry', 0, 0, { position: undefined, embarkedIn: 'apc' }));
    const supplied = applyModernUpkeep(state, 'red');
    expect(supplied.units.find((candidate) => candidate.id === 'cargo')!.ammo).toBe(9);
    expect(supplied.board.terrain[2]![2]!.owner).toBe('red');
  });
  it.each([undefined, 2, 3, 4, 5, 6, 7] as const)('keeps new units and facilities out of rule %s', (version) => {
    const state = { ...field(), ruleVersion: version };
    expect(isUnitKindAvailable('engineer', version)).toBe(false);
    expect(productionKindsForRule('facility-v2', version).factory).not.toContain('engineer');
    expect(isGameState(state)).toBe(false);
    state.units = [unit('i', 'infantry', 2, 2, { secondaryAmmo: undefined })];
    state.board.terrain[2]![2] = { kind: 'supplyDepot', owner: 'red' };
    expect(isGameState(state)).toBe(false);
    expect(applyModernUpkeep(state, 'red').units[0]!.ammo).toBe(0);
  });
});

describe('engineer fortifications', () => {
  it('pays once, consumes the whole action, preserves terrain and input, and gives owned ground cover', () => {
    const before = field();
    const next = valueOf(fortifyUnit(before, 'e'));
    expect(next.players.red.gold).toBe(4500);
    expect(next.units[0]).toMatchObject({ hasMoved: true, hasActed: true });
    expect(next.board).toBe(before.board);
    expect(before.fortifications).toBeUndefined();
    expect(unitDefenseStars(next, next.units[0]!)).toBe(2);
    expect(unitDefenseStars({ ...next, ruleVersion: 7 }, next.units[0]!)).toBe(1);
    expect(unitDefenseStars(next, { ...next.units[0]!, owner: 'blue' })).toBe(1);
    expect(unitDefenseStars(next, { ...next.units[0]!, kind: 'fighter' })).toBe(1);
    expect(fortifyUnit(next, 'e').ok).toBe(false);
    expect(validFortifications(next)).toBe(true);
  });
  it.each(['moved', 'acted', 'poor', 'terrain', 'wrongArmy', 'cargo', 'kind', 'finished', 'old', 'occupied', 'limit'] as const)('rejects %s orders without mutation', (failure) => {
    const state = field();
    if (failure === 'moved') state.units[0]!.hasMoved = true;
    if (failure === 'acted') state.units[0]!.hasActed = true;
    if (failure === 'poor') state.players.red.gold = 499;
    if (failure === 'terrain') state.board.terrain[2]![2] = { kind: 'road' };
    if (failure === 'wrongArmy') state.activePlayer = 'blue';
    if (failure === 'cargo') state.units[0]!.position = undefined;
    if (failure === 'kind') state.units[0]!.kind = 'infantry';
    if (failure === 'finished') state.winner = 'red';
    if (failure === 'old') state.ruleVersion = 7;
    if (failure === 'occupied') state.fortifications = [{ owner: 'red', position: { x: 2, y: 2 } }];
    if (failure === 'limit') state.fortifications = Array.from({ length: 4 }, (_, x) => ({ owner: 'red', position: { x, y: 0 } }));
    const copy = structuredClone(state);
    expect(fortificationError(state, 'e')).toBeTruthy();
    expect(fortifyUnit(state, 'e').ok).toBe(false);
    expect(state).toEqual(copy);
  });
  it('applies HP scaled cover to forecast and counterattack', () => {
    const state = valueOf(fortifyUnit(field(), 'e'));
    state.units = [unit('r', 'tank', 2, 2, { hp: 100, ammo: 6 }), unit('b', 'tank', 3, 2, { hp: 100, ammo: 6, owner: 'blue' })];
    const covered = valueOf(forecastCombat(state, state.units[1]!, state.units[0]!));
    const plain = valueOf(forecastCombat({ ...state, fortifications: [] }, state.units[1]!, state.units[0]!));
    expect(covered.damageToDefender).toBeLessThan(plain.damageToDefender);
    expect(valueOf(forecastCombat(state, state.units[0]!, state.units[1]!)).damageToAttacker).toBeLessThan(
      valueOf(forecastCombat({ ...state, fortifications: [] }, state.units[0]!, state.units[1]!)).damageToAttacker,
    );
  });
  it('removes enemy sites along ground movement but keeps air overflights and friendly sites', () => {
    const state = field();
    state.units = [unit('m', 'tank', 0, 2, { fuel: 70 })];
    state.fortifications = [
      { owner: 'blue', position: { x: 1, y: 2 } },
      { owner: 'red', position: { x: 3, y: 2 } },
    ];
    const next = valueOf(moveUnit(state, 'm', { x: 3, y: 2 }));
    expect(next.fortifications).toEqual([state.fortifications[1]]);
    const air = valueOf(moveUnit({ ...state, units: [{ ...state.units[0]!, kind: 'fighter' }] }, 'm', { x: 3, y: 2 }));
    expect(air.fortifications).toEqual(state.fortifications);
  });
  it('stops at hidden first contact and leaves sites beyond that stop intact', () => {
    const state = { ...field(), board: createBoard(7, 1) };
    state.units = [unit('m', 'tank', 0, 0, { fuel: 70 }), unit('hidden', 'tank', 4, 0, { owner: 'blue' })];
    state.fortifications = [
      { owner: 'blue', position: { x: 1, y: 0 } },
      { owner: 'blue', position: { x: 5, y: 0 } },
    ];
    const next = valueOf(moveUnit(state, 'm', { x: 5, y: 0 }));
    expect(next.units[0]!.position).toEqual({ x: 3, y: 0 });
    expect(next.fortifications).toEqual([state.fortifications[1]]);
  });
  it.each([null, 42, {}, [null], [{}], [{ owner: 'red', position: [] }], Array(9).fill(null)])('rejects malformed site data %#', (raw) => {
    const state = field();
    Object.assign(state, { fortifications: raw });
    expect(validFortifications(state)).toBe(false);
    expect(fortifyUnit(field(), 'missing').ok).toBe(false);
  });
  it('removes sites at a disembarkation destination', () => {
    const state = field();
    state.units = [unit('apc', 'apc', 1, 2), unit('cargo', 'engineer', 0, 0, { position: undefined, embarkedIn: 'apc' })];
    state.fortifications = [{ owner: 'blue', position: { x: 2, y: 2 } }];
    expect(valueOf(disembarkUnit(state, 'apc', { x: 2, y: 2 })).fortifications).toEqual([]);
  });
  it.each(['duplicate', 'outside', 'terrain', 'owner', 'extra', 'enemy', 'old', 'limit'] as const)('rejects %s saved sites', (failure) => {
    const state = valueOf(fortifyUnit(field(), 'e'));
    if (failure === 'duplicate') state.fortifications!.push(state.fortifications![0]!);
    if (failure === 'outside') state.fortifications![0]!.position.x = -1;
    if (failure === 'terrain') state.board.terrain[2]![2] = { kind: 'city' };
    if (failure === 'owner') (state.fortifications![0] as unknown as { owner: string }).owner = 'green';
    if (failure === 'extra') Object.assign(state.fortifications![0]!, { value: 3 });
    if (failure === 'enemy') state.units[0]!.owner = 'blue';
    if (failure === 'old') state.ruleVersion = 7;
    if (failure === 'limit') state.fortifications = Array.from({ length: 5 }, (_, x) => ({ owner: 'red', position: { x, y: 0 } }));
    expect(validFortifications(state)).toBe(false);
  });
  it('round trips commands, saves, replay seeks and blue orientation while legacy initial states still match', () => {
    const dataSource = scenarioDefinitionToData(scenarioById('supply-contest')!);
    const scenario = valueOf(
      loadScenarioDefinitions([
        { ...dataSource, id: 'frontline-replay', victoryConditions: [{ type: 'hold', positions: [{ x: 6, y: 5 }], turns: 1 }], defeatConditions: [{ type: 'eliminate' }] },
      ]),
    )[0]!;
    const initial = createScenarioInitialState(scenario);
    const command = { type: 'fortify' as const, unitId: 'r3' };
    const next = valueOf(applyGameCommand(initial, command));
    expect(isGameCommand(command)).toBe(true);
    expect(isGameCommand({ ...command, extra: 1 })).toBe(false);
    expect(isGameState(next)).toBe(true);
    expect(bluePlanningState(next).fortifications![0]!.position).toEqual({ x: 11, y: 8 });
    const data = new Map<string, string>();
    valueOf(
      saveGame(
        {
          getItem: (key) => data.get(key) ?? null,
          setItem: (key, value) => {
            data.set(key, value);
          },
          removeItem: (key) => {
            data.delete(key);
          },
        },
        'save',
        { mapId: initial.scenarioId!, difficulty: 'normal', initialState: initial, commands: [command], gameState: next },
      ),
    );
    expect(valueOf(parseSavedGame(data.get('save')!)).gameState).toEqual(next);
    const file = valueOf(createReplay({ mapId: initial.scenarioId!, difficulty: 'normal', initialState: initial, commands: [command, { type: 'endTurn' }] }));
    expect(valueOf(parseReplay(valueOf(serializeReplay(file)))).finalState.fortifications).toEqual(next.fortifications);
    const timeline = new ReplayTimeline(file);
    expect(valueOf(timeline.seek(1))).toEqual(next);
    expect(valueOf(timeline.seek(0))).toEqual(initial);
    expect(timeline.event(0, 'blue')).toBe('未観測');
    expect(valueOf(replayCommands(initial, [command]))).toEqual(next);
    const legacy = { ...createScenarioInitialState(scenarioById('skirmish')!), ruleVersion: 7 as const };
    expect(matchesScenarioInitialState(legacy, scenarioById('skirmish')!)).toBe(true);
    expect(isGameState(legacy)).toBe(true);
    expect(loadScenarioDefinitions([initial.scenarioSnapshot!]).ok).toBe(true);
  });
});
