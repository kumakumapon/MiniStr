import { afterAll, describe, expect, it } from 'vitest';
import { loadCustomScenarios, loadScenarioDefinitions, saveCustomScenario, scenarioById, type ScenarioData } from '../game';
import { formatBalanceReport, parseBalanceArgs, runBalance, simulateMatch, summarizeMatches, type MatchResult } from './balance';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

// A tiny duel that the CPU decides quickly: red's tank faces a lone infantry.
const duelData: ScenarioData = {
  id: 'balance-duel', name: '計測用', briefing: '', startingGold: 0,
  board: { width: 4, height: 1, cells: [[0, 0, 'capital', 'red'], [3, 0, 'capital', 'blue']] },
  initialUnits: [{ kind: 'tank', owner: 'red', x: 1, y: 0 }, { kind: 'infantry', owner: 'blue', x: 2, y: 0 }],
  victoryConditions: [{ type: 'eliminate' }], defeatConditions: [{ type: 'eliminate' }],
};
const saved = saveCustomScenario(new MemoryStorage(), duelData);
if (!saved.ok) throw new Error(saved.error);
const duel = saved.value;
// Do not leak the registered custom scenario into other test files sharing this worker.
afterAll(() => { loadCustomScenarios(new MemoryStorage()); });

const result = (patch: Partial<MatchResult>): MatchResult => ({
  scenarioId: 'map', difficulty: 'normal', rules: 'modern', seed: 1, winner: 'red', turns: 10, maxUnits: 5, commands: 20,
  produced: { red: {}, blue: {} }, repairCost: { red: 0, blue: 0 }, ...patch,
});

describe('simulateMatch', () => {
  it('plays a CPU duel to a decision', () => {
    const match = simulateMatch(duel, 'normal', 'modern', 1, 30);
    expect(match).toMatchObject({ ok: true, value: { scenarioId: 'balance-duel', winner: 'red', rules: 'modern' } });
    expect(match.ok && match.value.commands).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed', () => {
    const skirmish = scenarioById('skirmish')!;
    expect(simulateMatch(skirmish, 'hard', 'modern', 7919, 6)).toEqual(simulateMatch(skirmish, 'hard', 'modern', 7919, 6));
  });

  it('stops at the round limit and reports an undecided match', () => {
    const skirmish = scenarioById('skirmish')!;
    const match = simulateMatch(skirmish, 'easy', 'classic', 1, 2);
    expect(match).toMatchObject({ ok: true, value: { winner: 'none', turns: 3, rules: 'classic' } });
  });

  it('records CPU production by side', () => {
    const skirmish = scenarioById('skirmish')!;
    const match = simulateMatch(skirmish, 'normal', 'modern', 1, 3);
    expect(match.ok).toBe(true);
    if (!match.ok) return;
    const producedCount = (side: 'red' | 'blue') => Object.values(match.value.produced[side]).reduce((total, count) => total + (count ?? 0), 0);
    expect(producedCount('red')).toBeGreaterThan(0);
    expect(producedCount('blue')).toBeGreaterThan(0);
  });

  it('rejects scenarios that are not registered, since victory would never be evaluated', () => {
    const loaded = loadScenarioDefinitions([{ ...duelData, id: 'balance-unregistered' }]);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(() => simulateMatch(loaded.value[0]!, 'normal', 'modern', 1, 5)).toThrow('not registered');
    expect(() => simulateMatch({ ...scenarioById('skirmish')! }, 'normal', 'modern', 1, 5)).toThrow('not registered');
  });

  it.each([[-1, 5], [2 ** 32, 5], [1.5, 5], [1, 0]])('rejects seed %d with round limit %d', (seed, rounds) => {
    expect(() => simulateMatch(duel, 'normal', 'modern', seed, rounds)).toThrow('Invalid');
  });

  it('records modern repair costs and none under classic rules', () => {
    const match = simulateMatch(scenarioById('outpost')!, 'hard', 'modern', 7919, 20);
    expect(match.ok && match.value.repairCost.red + match.value.repairCost.blue).toBeGreaterThan(0);
    const classic = simulateMatch(scenarioById('outpost')!, 'hard', 'classic', 7919, 20);
    expect(classic.ok && classic.value.repairCost).toEqual({ red: 0, blue: 0 });
  });

  it('refuses classic rules on maps whose initial forces need modern rules', () => {
    const match = simulateMatch(scenarioById('admiralty')!, 'normal', 'classic', 1, 5);
    expect(match.ok).toBe(false);
  });
});

describe('summarizeMatches and formatBalanceReport', () => {
  it('aggregates wins, decided turns, unit peaks, production, and repairs per group', () => {
    const [summary, ...rest] = summarizeMatches([
      result({ winner: 'red', turns: 10, maxUnits: 5, produced: { red: { tank: 2 }, blue: { infantry: 1 } }, repairCost: { red: 700, blue: 300 } }),
      result({ winner: 'blue', turns: 20, maxUnits: 9, produced: { red: { tank: 1 }, blue: {} } }),
      result({ winner: 'none', turns: 61, maxUnits: 7 }),
    ]);
    expect(rest).toEqual([]);
    expect(summary).toMatchObject({
      games: 3, wins: { red: 1, blue: 1, none: 1 }, averageDecidedTurns: 15, maxUnits: 9,
      produced: { tank: 3, infantry: 1 },
    });
    expect(summary!.averageRepairCost).toBeCloseTo(1000 / 3);
  });

  it('keeps separate rows per map, difficulty, and rule set', () => {
    const summaries = summarizeMatches([result({}), result({ rules: 'classic' }), result({ difficulty: 'easy' }), result({ scenarioId: 'other' })]);
    expect(summaries).toHaveLength(4);
  });

  it('formats a Markdown table and lists skipped combinations', () => {
    const report = formatBalanceReport(summarizeMatches([result({ winner: 'none' })]), [{ scenarioId: 'admiralty', rules: 'classic', reason: '理由' }]);
    expect(report).toContain('| map | normal | modern | 1 | 0% | 0% | 100% | — |');
    expect(report).toContain('- admiralty（classic）: 理由');
  });
});

describe('parseBalanceArgs and runBalance', () => {
  it('defaults to every built-in map, difficulty, and rule set', () => {
    const parsed = parseBalanceArgs([]);
    expect(parsed.ok && parsed.value).toMatchObject({ difficulties: ['easy', 'normal', 'hard'], rules: ['classic', 'modern'], maxRounds: 60 });
    expect(parsed.ok && parsed.value.scenarioIds).toContain('admiralty');
    expect(parsed.ok && parsed.value.seeds).toHaveLength(3);
  });

  it.each([
    [['--maps', 'nowhere']],
    [['--maps', ',']],
    [['--maps', 'skirmish,skirmish']],
    [['--difficulty', 'brutal']],
    [['--rules', 'future']],
    [['--seeds', '0']],
    [['--rounds', '2.5']],
    [['--rounds']],
    [['--unknown', '1']],
  ])('rejects %j', (args) => {
    expect(parseBalanceArgs(args).ok).toBe(false);
  });

  it('runs requested combinations and records skipped ones once', () => {
    const parsed = parseBalanceArgs(['--maps', 'outpost,admiralty', '--difficulty', 'hard', '--rules', 'classic', '--seeds', '2', '--rounds', '2']);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { results, skipped } = runBalance(parsed.value);
    expect(results.map(match => `${match.scenarioId}/${match.seed}`)).toEqual(['outpost/7919', 'outpost/15838']);
    expect(skipped).toEqual([expect.objectContaining({ scenarioId: 'admiralty', rules: 'classic' })]);
  });
});
