import { afterAll, describe, expect, it } from 'vitest';
import { loadCustomScenarios, loadScenarioDefinitions, maps, saveCustomScenario, scenarioDefinitionToData, type ScenarioData, type VictoryCondition } from './index';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
afterAll(() => { loadCustomScenarios(new MemoryStorage()); });

const timed = (defeatConditions: VictoryCondition[]): ScenarioData => ({
  id: 'export-test', name: '書き出し試験', briefing: '', startingGold: 0, turnLimit: 10,
  board: { width: 2, height: 1, cells: [[0, 0, 'capital', 'red'], [1, 0, 'capital', 'blue']] }, initialUnits: [],
  victoryConditions: [{ type: 'captureCapital' }], defeatConditions,
});
const survives = (conditions: readonly VictoryCondition[]) => conditions.filter(condition => condition.type === 'survive');

/** Saves repeatedly, feeding each exported definition back in, as the editor and storage do. */
function resave(data: ScenarioData, times: number): VictoryCondition[][] {
  const storage = new MemoryStorage();
  const history: VictoryCondition[][] = [];
  let current = data;
  for (let round = 0; round < times; round += 1) {
    const saved = saveCustomScenario(storage, current);
    if (!saved.ok) throw new Error(saved.error);
    history.push([...saved.value.defeatConditions]);
    current = scenarioDefinitionToData(saved.value);
  }
  return history;
}

describe('scenario export keeps the turn limit single (#116 10.4)', () => {
  it('does not add another turn-limit condition on every save', () => {
    const history = resave(timed([{ type: 'captureCapital' }]), 3);
    expect(history.map(conditions => survives(conditions).length)).toEqual([1, 1, 1]);
    expect(history[2]).toEqual([{ type: 'captureCapital' }, { type: 'survive', untilTurn: 11 }]);
  });

  it('heals data saved with duplicated turn-limit conditions', () => {
    const duplicated = timed([{ type: 'captureCapital' }, { type: 'survive', untilTurn: 11 }, { type: 'survive', untilTurn: 11 }]);
    const history = resave(duplicated, 2);
    expect(survives(history[1]!)).toEqual([{ type: 'survive', untilTurn: 11 }]);
  });

  it('keeps an authored survive condition with a different round', () => {
    const history = resave(timed([{ type: 'captureCapital' }, { type: 'survive', untilTurn: 7 }]), 3);
    expect(survives(history[2]!)).toEqual([{ type: 'survive', untilTurn: 7 }, { type: 'survive', untilTurn: 11 }]);
  });

  it('keeps a lone turn-limit defeat condition so the list stays valid, and stops growing at two', () => {
    // Exporting keeps one copy (an empty defeat list is rejected) and loading adds the
    // normalized one again; both are the same condition, so the outcome is unchanged.
    const history = resave(timed([{ type: 'survive', untilTurn: 11 }]), 4);
    expect(history.map(conditions => conditions.length)).toEqual([2, 2, 2, 2]);
  });

  it('round-trips every built-in scenario to equivalent conditions', () => {
    for (const scenario of maps) {
      const reloaded = loadScenarioDefinitions([scenarioDefinitionToData(scenario)]);
      expect(reloaded.ok, scenario.id).toBe(true);
      if (!reloaded.ok) continue;
      expect(reloaded.value[0]!.victoryConditions).toEqual(scenario.victoryConditions);
      expect(reloaded.value[0]!.defeatConditions).toEqual(scenario.defeatConditions);
    }
  });
});
