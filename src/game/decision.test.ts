import { afterAll, describe, expect, it } from 'vitest';
import {
  createBoard, createGameState, createReplay, createScenarioInitialState, CURRENT_RULE_VERSION, DECISION_ROUND, decisionRound,
  endTurn, isDecisionScenario, loadCustomScenarios, MODERN_RULE_VERSION, parseReplay, parseSavedGame, produceUnit,
  replayCommands, saveCustomScenario, saveGame, scenarioById, serializeReplay, summarizeReplay, unitLimit, victoryReason,
  type GameCommand, type GameState, type ScenarioData, type Unit,
} from './index';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const register = (data: ScenarioData) => {
  const saved = saveCustomScenario(new MemoryStorage(), data);
  if (!saved.ok) throw new Error(saved.error);
  return saved.value;
};

// Red holds two properties to blue's one; neither side can reach the other.
const decisionData: ScenarioData = {
  id: 'decision-test', name: '判定試験', briefing: '', startingGold: 0,
  board: { width: 5, height: 1, cells: [[0, 0, 'capital', 'red'], [1, 0, 'city', 'red'], [2, 0, 'mountain'], [4, 0, 'capital', 'blue']] },
  initialUnits: [{ kind: 'infantry', owner: 'red', x: 1, y: 0 }, { kind: 'infantry', owner: 'blue', x: 3, y: 0 }],
  victoryConditions: [{ type: 'eliminate' }, { type: 'captureCapital' }], defeatConditions: [{ type: 'eliminate' }, { type: 'captureCapital' }],
};
const decisionScenario = register(decisionData);
const timedScenario = register({ ...decisionData, id: 'decision-timed', turnLimit: 50 });
afterAll(() => { loadCustomScenarios(new MemoryStorage()); });

const unit = (patch: Partial<Unit> & Pick<Unit, 'id' | 'kind' | 'owner'>): Unit => ({
  position: { x: 0, y: 0 }, hp: 100, hasMoved: true, hasActed: true, ...patch,
});

/** Blue is about to end round `turn` in the decision scenario. */
function blueEnding(turn: number, patch: Partial<GameState> = {}): GameState {
  return { ...createScenarioInitialState(decisionScenario), activePlayer: 'blue', turn, ...patch };
}

describe('decision victory (#119)', () => {
  it('applies only to rule-version-3 scenarios decided by elimination or capital capture', () => {
    expect(isDecisionScenario(decisionScenario)).toBe(true);
    // A turn limit becomes blue's survive condition, which is its own ending.
    expect(isDecisionScenario(timedScenario)).toBe(false);
    expect(decisionRound(blueEnding(1))).toBe(DECISION_ROUND);
    expect(decisionRound(blueEnding(1, { ruleVersion: MODERN_RULE_VERSION }))).toBeUndefined();
    expect(decisionRound(blueEnding(1, { ruleVersion: undefined }))).toBeUndefined();
    expect(decisionRound({ ...createScenarioInitialState(timedScenario), turn: 1 })).toBeUndefined();
  });

  it('awards the side with more properties when blue closes the decision round', () => {
    expect(endTurn(blueEnding(DECISION_ROUND - 1)).winner).toBeUndefined();
    const decided = endTurn(blueEnding(DECISION_ROUND));
    expect(decided.winner).toBe('red');
    expect(decided.turn).toBe(DECISION_ROUND + 1);
    expect(victoryReason(decided)).toBe('decision');
  });

  it('does not decide when red ends its half of the decision round', () => {
    expect(endTurn({ ...blueEnding(DECISION_ROUND), activePlayer: 'red' }).winner).toBeUndefined();
  });

  it('falls back to unit value on equal properties, and decides nothing on a full tie', () => {
    const board = createScenarioInitialState(decisionScenario).board;
    const evenBoard = { ...board, terrain: board.terrain.map(row => row.map(tile => tile.kind === 'city' ? { ...tile, owner: undefined } : tile)) };
    const units = (redHp: number) => [
      unit({ id: 'r1', kind: 'infantry', owner: 'red', position: { x: 1, y: 0 }, hp: redHp }),
      unit({ id: 'b1', kind: 'infantry', owner: 'blue', position: { x: 3, y: 0 } }),
    ];
    expect(endTurn(blueEnding(DECISION_ROUND, { board: evenBoard, units: units(60) })).winner).toBe('blue');
    const tied = endTurn(blueEnding(DECISION_ROUND, { board: evenBoard, units: units(100) }));
    expect(tied.winner).toBeUndefined();
    // Sudden death: the next round-end decides again. Both sides keep units on the
    // board so no elimination can pre-empt the decision.
    const nextRoundEnd = endTurn({ ...tied, activePlayer: 'blue', units: units(90) });
    expect(nextRoundEnd.winner).toBe('blue');
    expect(nextRoundEnd.turn).toBe(DECISION_ROUND + 2);
    expect(victoryReason(nextRoundEnd)).toBe('decision');
  });

  it('judges before red’s start-of-turn repairs so the first player gains nothing from them', () => {
    // Equal properties and equal damaged forces; red's unit sits on its own city and
    // would be repaired at the start of red's turn. The decision must still be a tie.
    const board = createScenarioInitialState(decisionScenario).board;
    const evenBoard = { ...board, terrain: board.terrain.map((row) => row.map((tile, x) => x === 3 ? { ...tile, kind: 'city' as const, owner: 'blue' as const, capturePoints: 20 } : tile)) };
    const state = blueEnding(DECISION_ROUND, {
      board: evenBoard,
      players: { red: { gold: 50_000, income: 0 }, blue: { gold: 50_000, income: 0 } },
      units: [
        unit({ id: 'r1', kind: 'infantry', owner: 'red', position: { x: 1, y: 0 }, hp: 50 }),
        unit({ id: 'b1', kind: 'infantry', owner: 'blue', position: { x: 3, y: 0 }, hp: 50 }),
      ],
    });
    const next = endTurn(state);
    expect(next.units.find(candidate => candidate.id === 'r1')!.hp).toBe(70);
    expect(next.winner).toBeUndefined();
  });

  it('never decides v2 or classic matches, even past the decision round', () => {
    expect(endTurn(blueEnding(DECISION_ROUND + 5, { ruleVersion: MODERN_RULE_VERSION })).winner).toBeUndefined();
    expect(endTurn(blueEnding(DECISION_ROUND + 5, { ruleVersion: undefined })).winner).toBeUndefined();
  });
});

describe('victoryReason', () => {
  it('reports the satisfied condition before a decision', () => {
    const eliminated = { ...blueEnding(DECISION_ROUND + 1), winner: 'red' as const, units: [unit({ id: 'r1', kind: 'infantry', owner: 'red', position: { x: 1, y: 0 } })] };
    expect(victoryReason(eliminated)).toBe('eliminate');
  });

  it('is undefined when the ending cannot be explained', () => {
    expect(victoryReason(blueEnding(1))).toBeUndefined();
    expect(victoryReason({ ...createGameState(createBoard(1, 1)), winner: 'red' })).toBeUndefined();
    expect(victoryReason({ ...blueEnding(DECISION_ROUND + 1, { ruleVersion: MODERN_RULE_VERSION }), winner: 'red' })).toBeUndefined();
  });
});

describe('unit limit (#119, rule version 3)', () => {
  const factoryBoard = () => {
    const board = createBoard(6, 6);
    board.terrain[0]![0] = { kind: 'factory', owner: 'red', capturePoints: 20 };
    return board;
  };
  const withForce = (count: number, ruleVersion: GameState['ruleVersion'], embarked = 0): GameState => ({
    ...createGameState(factoryBoard()), ruleVersion,
    players: { red: { gold: 50_000, income: 0 }, blue: { gold: 0, income: 0 } },
    units: [
      ...Array.from({ length: count }, (_, index) => unit({ id: `r${index}`, kind: 'infantry', owner: 'red', position: { x: 1 + (index % 5), y: Math.floor(index / 5) } })),
      ...Array.from({ length: embarked }, (_, index) => unit({ id: `cargo${index}`, kind: 'infantry', owner: 'red', position: undefined, embarkedIn: `r${index}` })),
    ],
  });

  it('is a quarter of the board, at least ten', () => {
    expect(unitLimit(createBoard(6, 6))).toBe(10);
    expect(unitLimit(createBoard(10, 8))).toBe(20);
    expect(unitLimit(scenarioById('islands')!.board)).toBe(24);
  });

  it('blocks production at the limit, counting embarked cargo', () => {
    expect(produceUnit(withForce(9, CURRENT_RULE_VERSION), { x: 0, y: 0 }, 'infantry').ok).toBe(true);
    expect(produceUnit(withForce(10, CURRENT_RULE_VERSION), { x: 0, y: 0 }, 'infantry')).toEqual({ ok: false, error: 'Unit limit reached' });
    expect(produceUnit(withForce(8, CURRENT_RULE_VERSION, 2), { x: 0, y: 0 }, 'infantry')).toEqual({ ok: false, error: 'Unit limit reached' });
  });

  it('does not limit v2 or classic matches', () => {
    expect(produceUnit(withForce(12, MODERN_RULE_VERSION), { x: 0, y: 0 }, 'infantry').ok).toBe(true);
    expect(produceUnit(withForce(12, undefined), { x: 0, y: 0 }, 'infantry').ok).toBe(true);
  });
});

describe('rule version 2 and 3 persistence', () => {
  const idle: GameCommand[] = Array.from({ length: DECISION_ROUND * 2 }, () => ({ type: 'endTurn' }));
  const v3 = () => createScenarioInitialState(decisionScenario);
  const v2 = (): GameState => ({ ...v3(), ruleVersion: MODERN_RULE_VERSION });

  it('round-trips a decided v3 match through createReplay, parseReplay, and summarizeReplay', () => {
    const replay = createReplay({ mapId: decisionScenario.id, difficulty: 'normal', initialState: v3(), commands: idle });
    expect(replay.ok && replay.value.finalState.winner).toBe('red');
    const serialized = replay.ok ? serializeReplay(replay.value) : undefined;
    expect(serialized?.ok && parseReplay(serialized.value).ok).toBe(true);
    expect(summarizeReplay(v3(), idle, decisionScenario.id, 'normal')).toMatchObject({ ok: true, value: { winner: 'red', turns: DECISION_ROUND + 1 } });
  });

  it('keeps replaying a v2 save past round 40 without a decision', () => {
    const played = replayCommands(v2(), idle);
    expect(played.ok && played.value.winner).toBeUndefined();
    if (!played.ok) return;
    const storage = new MemoryStorage();
    const saved = saveGame(storage, 'save', { mapId: decisionScenario.id, difficulty: 'normal', initialState: v2(), commands: idle, gameState: played.value });
    expect(saved.ok).toBe(true);
    const parsed = parseSavedGame(storage.getItem('save')!);
    expect(parsed.ok && parsed.value.gameState.ruleVersion).toBe(MODERN_RULE_VERSION);
  });
});
