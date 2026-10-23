import { afterEach, expect, it } from 'vitest';
import {
  applyGameCommand,
  createReplay,
  createScenarioInitialState,
  deleteCustomScenario,
  loadCustomScenarios,
  MANUAL_SAVE_KEY,
  parseReplay,
  parseSavedGame,
  saveCustomScenario,
  saveGame,
  serializeReplay,
  supplyStock,
  type GameCommand,
  type GameState,
  type ScenarioData,
} from './index';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
afterEach(() => loadCustomScenarios(new MemoryStorage()));

it.each([9, 10] as const)('preserves rule v%s supplies through commands, deletion, portable saves and replays', (ruleVersion) => {
  const storage = new MemoryStorage();
  const source: ScenarioData = {
    id: `finite-save-${ruleVersion}`,
    name: '補給と削除',
    briefing: '',
    startingGold: 0,
    board: { width: 7, height: 3, cells: [] },
    initialUnits: [
      { kind: 'apc', owner: 'red', x: 1, y: 1 },
      { kind: 'tank', owner: 'red', x: 3, y: 1 },
      { kind: 'infantry', owner: 'blue', x: 6, y: 1 },
    ],
    victoryConditions: [{ type: 'survive', untilTurn: 2 }],
    defeatConditions: [{ type: 'eliminate' }],
  };
  const created = saveCustomScenario(storage, source);
  if (!created.ok) throw Error(created.error);
  const initialState: GameState = { ...createScenarioInitialState(created.value), ruleVersion };
  let gameState = initialState;
  const truck = initialState.units.find((unit) => unit.kind === 'apc')!;
  const tank = initialState.units.find((unit) => unit.kind === 'tank')!;
  const commands: GameCommand[] = [{ type: 'move', unitId: tank.id, destination: { x: 2, y: 1 } }, { type: 'endTurn' }, { type: 'endTurn' }];
  const checkpoints = [initialState];
  for (const command of commands) {
    const applied = applyGameCommand(gameState, command);
    if (!applied.ok) throw Error(applied.error);
    gameState = applied.value;
    checkpoints.push(gameState);
  }
  expect(supplyStock(checkpoints[0]!.units.find((unit) => unit.id === truck.id)!)).toBe(300);
  expect(supplyStock(gameState.units.find((unit) => unit.id === truck.id)!)).toBe(ruleVersion === 10 ? 299 : 300);
  expect(saveGame(storage, MANUAL_SAVE_KEY, { mapId: source.id, difficulty: 'normal', initialState, gameState, commands }).ok).toBe(true);
  const saved = storage.getItem(MANUAL_SAVE_KEY)!;
  const replay = createReplay({ mapId: source.id, difficulty: 'normal', initialState, commands });
  if (!replay.ok) throw Error(replay.error);
  const serialized = serializeReplay(replay.value);
  if (!serialized.ok) throw Error(serialized.error);
  expect(deleteCustomScenario(storage, source.id).ok).toBe(true);
  loadCustomScenarios(new MemoryStorage());
  const restored = parseSavedGame(saved);
  expect(restored.ok).toBe(true);
  if (restored.ok) expect(restored.value.gameState).toEqual(gameState);
  const replayed = parseReplay(serialized.value);
  expect(replayed.ok).toBe(true);
  if (replayed.ok) expect(replayed.value.finalState).toEqual(gameState);
  if (ruleVersion === 10) {
    const corrupt = JSON.parse(saved);
    for (const stock of [301, 298]) {
      corrupt.gameState.units.find((unit: { kind: string }) => unit.kind === 'apc').supplyStock = stock;
      expect(parseSavedGame(JSON.stringify(corrupt)).ok).toBe(false);
    }
  }
});
