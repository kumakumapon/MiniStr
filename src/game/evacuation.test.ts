import { describe, expect, it } from 'vitest';
import {
  applyGameCommand,
  canEvacuateUnit,
  countDestroyedDeployedUnits,
  createCampaignProgress,
  createReplay,
  createScenarioEditor,
  createScenarioInitialState,
  describeVictoryCondition,
  evacuateUnit,
  evacuationImpossible,
  evacuationObjectives,
  getConditionProgress,
  gradeCampaignBattle,
  isEvacuationTarget,
  isGameCommand,
  isGameState,
  loadScenarioDefinitions,
  mergeUnits,
  parseReplay,
  parseSavedGame,
  recordCampaignVeterans,
  recordCampaignVictory,
  replayCommands,
  saveGame,
  scenarioDefinitionToData,
  serializeReplay,
  victoryReason,
  withEvaluatedWinner,
  type GameCommand,
  type GameState,
  type StorageLike,
} from './index';
import { force, operation, operationData, valueOf } from './operations.fixture';
import { inspectEditorScenario } from './editorTools';

const commands: GameCommand[] = [
  { type: 'move', unitId: 'r1', destination: { x: 3, y: 1 } },
  { type: 'evacuate', unitId: 'r1' },
  { type: 'move', unitId: 'r2', destination: { x: 3, y: 1 } },
  { type: 'evacuate', unitId: 'r2' },
];
const ready = (): GameState => {
  const state = createScenarioInitialState(operation());
  return { ...state, units: state.units.map((unit) => (unit.id === 'r1' ? { ...unit, position: { x: 3, y: 1 } } : unit)) };
};

describe('escort and withdrawal commands', () => {
  it('moves, evacuates and reuses an exit without counting friendly casualties', () => {
    const initial = createScenarioInitialState(operation());
    const before = structuredClone(initial);
    const partial = valueOf(replayCommands(initial, commands.slice(0, 2)));
    expect(getConditionProgress(partial, operation().victoryConditions[0]!, 'red')).toEqual({ current: 1, target: 2, complete: false });
    expect(partial.winner).toBeUndefined();
    expect(countDestroyedDeployedUnits(initial, partial)).toEqual({ red: 0, blue: 0 });
    const final = valueOf(replayCommands(initial, commands));
    expect(final.winner).toBe('red');
    expect(victoryReason(final)).toBe('withdraw');
    expect(final.evacuatedUnits?.map((unit) => unit.id)).toEqual(['r1', 'r2']);
    expect(isGameState(final)).toBe(true);
    expect(initial).toEqual(before);
    expect(canEvacuateUnit(final, 'r1')).toBe(false);
  });

  it('preserves surviving HP, experience and ammunition and restores abandoned capture progress', () => {
    const state = ready();
    state.board.terrain[1]![3] = { kind: 'city', owner: 'blue', capturePoints: 7 };
    state.units = state.units.map((unit) => (unit.id === 'r1' ? { ...unit, hp: 51, experience: 4, ammo: 2, hasMoved: true } : unit));
    const final = valueOf(evacuateUnit(state, 'r1'));
    expect(final.evacuatedUnits?.[0]).toMatchObject({ hp: 51, experience: 4, ammo: 2, hasMoved: true, hasActed: true, position: { x: 3, y: 1 } });
    expect(final.board.terrain[1]![3]!.capturePoints).toBe(20);
    expect(state.board.terrain[1]![3]!.capturePoints).toBe(7);
    expect(evacuateUnit(final, 'r1').ok).toBe(false);
  });

  it('rejects unavailable, acted, opposing, embarked, non-mission and loaded units', () => {
    const state = ready();
    expect(canEvacuateUnit(state, 'r1')).toBe(true);
    expect(canEvacuateUnit(state, 'missing')).toBe(false);
    for (const patch of [{ hasActed: true }, { owner: 'blue' as const }, { position: { x: 2, y: 1 } }, { position: undefined, embarkedIn: 'r3' }]) {
      const changed = { ...state, units: state.units.map((unit) => (unit.id === 'r1' ? { ...unit, ...patch } : unit)) };
      expect(evacuateUnit(changed, 'r1').ok).toBe(false);
    }
    expect(evacuateUnit({ ...state, winner: 'blue' }, 'r1').ok).toBe(false);
    expect(evacuateUnit({ ...state, units: [force('r3', 'apc', 3, 1)] }, 'r3').ok).toBe(false);
    const cargo = { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'r1' };
    expect(evacuateUnit({ ...state, units: [...state.units, cargo] }, 'r1').ok).toBe(false);
    expect(evacuationObjectives({ ...state, ruleVersion: 5 }, 'red')).toEqual([]);
    expect(evacuateUnit({ ...state, ruleVersion: 5 }, 'r1').ok).toBe(false);
    expect(evacuationObjectives({ ...state, scenarioId: undefined, scenarioSnapshot: undefined }, 'blue')).toEqual([]);
  });

  it('loses immediately when too few targets survive, including embarked and evacuated survivors', () => {
    const state = ready();
    expect(evacuationImpossible(state, 'red')).toBe(false);
    expect(isEvacuationTarget(state, 'r1', 'red')).toBe(true);
    expect(isEvacuationTarget(state, 'r3', 'red')).toBe(false);
    const embarked = { ...state, units: state.units.map((unit) => (unit.id === 'r1' ? { ...unit, position: undefined, embarkedIn: 'r3' } : unit)) };
    expect(evacuationImpossible(embarked, 'red')).toBe(false);
    const partial = valueOf(evacuateUnit(state, 'r1'));
    expect(evacuationImpossible(partial, 'red')).toBe(false);
    const lost = withEvaluatedWinner({ ...partial, units: partial.units.filter((unit) => unit.id !== 'r2') });
    expect(lost.winner).toBe('blue');
    expect(victoryReason(lost)).toBe('objectiveLost');
    expect(evacuationImpossible(state, 'blue')).toBe(false);
  });

  it('supports blue missions, objective-loss ties and escort descriptions', () => {
    const scenario = operation({ defeatConditions: [{ type: 'escort', unitIds: ['b1'], positions: [{ x: 7, y: 2 }], required: 1 }] });
    const state = { ...createScenarioInitialState(scenario), activePlayer: 'blue' as const };
    const escaped = valueOf(evacuateUnit(state, 'b1'));
    expect(escaped.winner).toBe('blue');
    expect(victoryReason(escaped)).toBe('escort');
    expect(describeVictoryCondition(scenario.defeatConditions[0]!)).toContain('b1');
    expect(describeVictoryCondition(scenario.victoryConditions[0]!)).toContain('r1');
    expect(withEvaluatedWinner({ ...state, units: [] }).winner).toBe('blue');
    expect(withEvaluatedWinner({ ...state, units: state.units.filter((unit) => unit.owner === 'red') }).winner).toBe('red');
  });

  it('protects a mission donor ID while allowing a normal donor to reinforce it', () => {
    const state = ready();
    state.units = state.units.map((unit) => (unit.id === 'r1' ? { ...unit, hp: 40 } : unit));
    state.units.push(force('donor', 'infantry', 2, 1, { hp: 20 }));
    expect(mergeUnits(state, 'r1', 'donor')).toMatchObject({ ok: false, error: expect.stringContaining('Mission targets') });
    const merged = valueOf(mergeUnits(state, 'donor', 'r1'));
    expect(merged.units.find((unit) => unit.id === 'r1')?.hp).toBe(60);
    expect(evacuationImpossible(merged, 'red')).toBe(false);
  });

  it('round-trips evacuation saves and replays with no kills and rejects forged histories', () => {
    const initial = createScenarioInitialState(operation());
    const final = valueOf(replayCommands(initial, commands));
    const data = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
    const saved = valueOf(saveGame(storage, 'fixture', { mapId: initial.scenarioId!, initialState: initial, gameState: final, commands, difficulty: 'normal' }));
    expect(valueOf(parseSavedGame(JSON.stringify(saved))).gameState).toEqual(final);
    const replay = valueOf(createReplay({ mapId: initial.scenarioId!, initialState: initial, commands, difficulty: 'normal' }));
    expect(replay.summary.kills).toEqual({ red: 0, blue: 0 });
    expect(valueOf(parseReplay(valueOf(serializeReplay(replay)))).finalState).toEqual(final);
    expect(parseSavedGame(JSON.stringify({ ...saved, commands: commands.slice(0, 2) })).ok).toBe(false);
    expect(isGameCommand({ type: 'evacuate', unitId: 'r1' })).toBe(true);
    expect(isGameCommand({ type: 'evacuate', unitId: 1 })).toBe(false);
    expect(applyGameCommand(initial, { type: 'evacuate', unitId: 'r1' }).ok).toBe(false);
  });

  it('rejects forged evacuated states and cargo links into evacuated transports', () => {
    const final = valueOf(replayCommands(createScenarioInitialState(operation()), commands));
    for (const patch of [{ id: 'missing' }, { owner: 'blue' }, { position: { x: 0, y: 0 } }, { hasActed: false }, { hasMoved: false }, { position: undefined, embarkedIn: 'r3' }]) {
      expect(isGameState({ ...final, evacuatedUnits: [{ ...final.evacuatedUnits![0], ...patch }, final.evacuatedUnits![1]] })).toBe(false);
    }
    expect(isGameState({ ...final, units: [...final.units, final.evacuatedUnits![0]!] })).toBe(false);
    expect(isGameState({ ...final, ruleVersion: 5 })).toBe(false);
    expect(isGameState({ ...final, evacuatedUnits: {} })).toBe(false);
    const cargo = { ...force('cargo', 'infantry', 0, 0), position: undefined, embarkedIn: 'r1' };
    expect(isGameState({ ...final, units: [...final.units, cargo] })).toBe(false);
    expect(isGameState({ ...ready(), ruleVersion: 5 })).toBe(false);
  });

  it.each([undefined, 2, 3, 4, 5] as const)('retains old rule %s saves without new objectives', (ruleVersion) => {
    const initial = { ...createScenarioInitialState(operation({ victoryConditions: [{ type: 'eliminate' }] })), ruleVersion };
    const data = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
    const saved = valueOf(saveGame(storage, 'old', { mapId: initial.scenarioId!, difficulty: 'normal', initialState: initial, gameState: initial, commands: [] }));
    expect(valueOf(parseSavedGame(JSON.stringify(saved))).gameState.ruleVersion).toBe(ruleVersion);
  });

  it('includes evacuated survivors in campaign grading and veteran recording', () => {
    const initial = createScenarioInitialState(operation({ id: 'skirmish' }));
    const final = valueOf(replayCommands(initial, commands));
    const grade = valueOf(gradeCampaignBattle({ initialState: initial, finalState: final, losses: 0, recommendedTurns: 10 }));
    expect(grade.survivingUnits).toBe(3);
    const progress = valueOf(recordCampaignVictory(createCampaignProgress(), 'skirmish', grade.grade));
    expect(valueOf(recordCampaignVeterans(progress, final)).veteransByScenario?.skirmish).toHaveLength(3);
  });
});

describe('evacuation scenario boundaries and editor reachability', () => {
  it.each([
    { unitIds: [] },
    { unitIds: ['r1', 'r1'] },
    { unitIds: ['b1'] },
    { unitIds: ['r99'] },
    { unitIds: ['bad'] },
    { unitIds: Array(65).fill('r1') },
    { unitIds: [1] },
    { required: 0 },
    { required: 3 },
    { required: 1.5 },
    { positions: [] },
    { positions: [{ x: -1, y: 1 }] },
    { positions: [{ x: 8, y: 1 }] },
    {
      positions: [
        { x: 3, y: 1 },
        { x: 3, y: 1 },
      ],
    },
  ])('rejects malformed mission fields %j', (patch) => {
    const source = operationData();
    expect(loadScenarioDefinitions([{ ...source, victoryConditions: [{ ...source.victoryConditions[0], ...patch }] }]).ok).toBe(false);
  });

  it('rejects wrong-side blue targets and accepts authored escort/withdraw types', () => {
    expect(loadScenarioDefinitions([operationData({ defeatConditions: [{ type: 'withdraw', unitIds: ['r1'], positions: [{ x: 0, y: 0 }], required: 1 }] })]).ok).toBe(false);
    for (const type of ['escort', 'withdraw'] as const)
      expect(loadScenarioDefinitions([operationData({ victoryConditions: [{ type, unitIds: ['r1'], positions: [{ x: 3, y: 1 }], required: 1 }] })]).ok).toBe(true);
  });

  it('requires reachable targets and recognizes embarkable infantry with sea transport', () => {
    const board = {
      width: 8,
      height: 4,
      cells: [
        [3, 0, 'sea'],
        [3, 1, 'sea'],
        [3, 2, 'sea'],
        [3, 3, 'sea'],
      ] as const,
    };
    const source = operationData({ board, victoryConditions: [{ type: 'withdraw', unitIds: ['r1'], positions: [{ x: 6, y: 1 }], required: 1 }] });
    const inspect = (data: typeof source) => inspectEditorScenario({ ...createScenarioEditor(), data }).filter((issue) => issue.message.includes('脱出地点'));
    expect(inspect(source)).toHaveLength(1);
    const transport = { kind: 'landingShip' as const, owner: 'red' as const, x: 3, y: 1 };
    expect(inspect({ ...source, initialUnits: [...source.initialUnits, transport] })).toEqual([]);
    expect(
      inspect({ ...source, initialUnits: source.initialUnits.map((unit) => (unit.owner === 'red' ? { ...unit, kind: 'tank' as const } : unit)).concat(transport) }),
    ).toHaveLength(1);
    expect(inspect(scenarioDefinitionToData(operation()))).toEqual([]);
  });
});
