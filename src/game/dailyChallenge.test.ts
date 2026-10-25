import { afterEach, describe, expect, it } from 'vitest';
import { chooseCpuAction } from '../ai/rules';
import {
  DAILY_RECORDS_KEY,
  DAILY_TABLE_D1,
  dailyConditions,
  dailyDateKey,
  dailyDateOfScenarioId,
  dailyMatchOf,
  dailyScenario,
  dailyVictory,
  deleteDailyRecord,
  isDailyDate,
  isStandardDailyDefinition,
  loadDailyRecords,
  MAX_DAILY_RECORDS,
  parseDailyRecords,
  resetDailyRecords,
  saveDailyVictory,
  type DailyRecord,
} from './dailyChallenge';
import { createDeploymentScenario, deploymentSlots } from './deployment';
import { inspectGeneratedMap } from './mapGenerator';
import {
  captureCustomScenarioCatalog,
  createScenarioInitialState,
  MAX_CUSTOM_SCENARIOS,
  restoreCustomScenarioCatalog,
  saveCustomScenario,
  scenarioById,
  scenarioDefinitionToData,
  scenarioForState,
  type ScenarioDefinition,
} from './maps';
import { operationData } from './operations.fixture';
import { canonicalOperationValue } from './operationRecords';
import { createReplay, parseReplay, serializeReplay } from './replay';
import { applyGameCommand, loadGame, MANUAL_SAVE_KEY, saveGame, type GameCommand, type StorageLike } from './session';
import { BRIDGE_RULE_VERSION, CURRENT_RULE_VERSION, type GameState } from './types';
import { unitStats } from './units';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
  };
}
const catalogAtStart = captureCustomScenarioCatalog();
afterEach(() => restoreCustomScenarioCatalog(catalogAtStart));

type Level = 'easy' | 'normal' | 'hard';
/** Plays the CPU on both sides until a winner appears; returns the legal command stream. */
function playOut(
  scenario: ScenarioDefinition,
  red: Level,
  blue: Level,
  ruleVersion = CURRENT_RULE_VERSION as GameState['ruleVersion'],
): { initial: GameState; commands: GameCommand[]; final: GameState } {
  const initial: GameState = { ...createScenarioInitialState(scenario), ruleVersion };
  let state = initial;
  const commands: GameCommand[] = [];
  while (!state.winner && state.turn <= 40) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? red : blue);
    const next = applyGameCommand(state, command);
    if (!next.ok) throw Error(next.error);
    commands.push(command);
    state = next.value;
  }
  return { initial, commands, final: state };
}
const must = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw Error(result.error);
  return result.value;
};
/** Dates whose red-hard versus blue-easy CPU match is won by red; found by running the CPU once. */
const FRONTLINE_WIN_DATE = '2026-02-03';
const STANDARD_WIN_DATE = '2026-02-17';
const winCache = new Map<string, ReturnType<typeof playOut>>();
function won(date: string) {
  let played = winCache.get(date);
  if (!played) {
    played = playOut(must(dailyScenario(date)), 'hard', 'easy');
    expect(played.final.winner).toBe('red');
    winCache.set(date, played);
  }
  return played;
}
const context = { difficulty: 'normal', matchMode: 'cpu' } as const;
const record = (date: string, patch: Partial<DailyRecord> = {}): DailyRecord => ({
  date,
  generation: 'd1',
  ruleVersion: CURRENT_RULE_VERSION,
  bestTurns: 12,
  bestLosses: 1,
  updatedAt: '2026-02-03T10:00:00.000Z',
  ...patch,
});
const dateAt = (index: number) => new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString().slice(0, 10);
const fnv = (text: string) => {
  let hash = 2166136261;
  for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
};

describe('#230 precondition: an unsaved definition works without a custom slot', () => {
  it('starts, saves, resumes, replays and restarts with a full custom catalog', () => {
    const storage = memoryStorage();
    for (let at = 0; at < MAX_CUSTOM_SCENARIOS; at++) expect(saveCustomScenario(storage, operationData({ id: `custom-fill-${at}`, name: `fill ${at}` })).ok).toBe(true);
    // The catalog is full: one more definition is rejected, which is why a daily battlefield cannot use it.
    expect(saveCustomScenario(storage, operationData({ id: 'custom-overflow' })).ok).toBe(false);

    const definition = must(dailyScenario(FRONTLINE_WIN_DATE));
    expect(scenarioById(definition.id)).toBeUndefined();
    const played = won(FRONTLINE_WIN_DATE);
    expect(played.initial.scenarioId).toBe(definition.id);

    // Mid-game checkpoint: save and resume resolve the unsaved definition from the embedded snapshot.
    const midway = played.commands.slice(0, 6);
    let mid = played.initial;
    for (const command of midway) mid = must(applyGameCommand(mid, command));
    expect(saveGame(storage, MANUAL_SAVE_KEY, { mapId: definition.id, difficulty: 'normal', initialState: played.initial, commands: midway, gameState: mid }).ok).toBe(true);
    const loaded = loadGame(storage);
    expect(loaded?.ok).toBe(true);
    if (!loaded?.ok) return;
    expect(scenarioForState(loaded.value.initialState)?.id).toBe(definition.id);
    expect(scenarioById(definition.id)).toBeUndefined();
    // A resumed daily match is still recognised as the canonical one, so it can still be recorded.
    expect(dailyMatchOf(loaded.value.initialState)?.code).toBe('D1-20260203-v3');

    // The finished match exports and re-imports as a replay without the catalog.
    const replay = must(createReplay({ mapId: definition.id, difficulty: 'normal', initialState: played.initial, commands: played.commands }));
    expect(parseReplay(must(serializeReplay(replay))).ok).toBe(true);

    // Restart: main.ts calls resetGame(id, <regenerated definition>) and gets the identical turn-one state.
    expect(createScenarioInitialState(must(dailyScenario(FRONTLINE_WIN_DATE)))).toEqual(played.initial);
    expect(createScenarioInitialState(scenarioForState(played.initial)!)).toEqual(played.initial);
    // The id-only lookup the old #restart used cannot find an unsaved definition.
    expect(scenarioById(definition.id)).toBeUndefined();
  });

  it('coexists with a hand-generated, saved copy of the same conditions without interference', () => {
    const storage = memoryStorage();
    const definition = must(dailyScenario(STANDARD_WIN_DATE));
    const saved = saveCustomScenario(storage, scenarioDefinitionToData(definition));
    expect(saved.ok).toBe(true);
    expect(scenarioById(definition.id)).toBeDefined();
    // The saved copy is the same data, so both paths describe one match; editing the saved copy cannot change the date's definition.
    saveCustomScenario(storage, { ...scenarioDefinitionToData(definition), startingGold: definition.startingGold + 500 });
    expect(scenarioById(definition.id)?.startingGold).toBe(definition.startingGold + 500);
    expect(canonicalOperationValue(scenarioDefinitionToData(must(dailyScenario(STANDARD_WIN_DATE))))).toBe(canonicalOperationValue(scenarioDefinitionToData(definition)));
    expect(isStandardDailyDefinition(scenarioById(definition.id)!)).toBe(false);
    expect(dailyMatchOf(createScenarioInitialState(must(dailyScenario(STANDARD_WIN_DATE))))).toBeDefined();
  });
});

describe('date to conditions', () => {
  it('derives a frozen table of conditions from the date alone', () => {
    const expected: Record<string, string> = {
      '2026-01-01': 'D1-20260101-v3 20 ocean frontline',
      '2026-01-02': 'D1-20260102-v2 24 ocean standard',
      '2026-01-03': 'D1-20260103-v3 16 coast frontline',
      '2026-01-04': 'D1-20260104-v2 16 coast standard',
      '2026-06-15': 'D1-20260615-v2 24 coast standard',
      '2026-12-31': 'D1-20261231-v3 16 none frontline',
      '2030-02-28': 'D1-20300228-v2 16 coast standard',
      '2036-12-31': 'D1-20361231-v3 24 coast frontline',
    };
    for (const [date, text] of Object.entries(expected)) {
      const conditions = must(dailyConditions(date));
      expect(`${conditions.code} ${conditions.size} ${conditions.sea} ${conditions.preset}`, date).toBe(text);
      expect(conditions.seed).toBe(`D${date.replaceAll('-', '')}`);
    }
    expect(DAILY_TABLE_D1).toHaveLength(18);
    expect(new Set(DAILY_TABLE_D1.map((row) => row.join('/'))).size).toBe(18);
  });
  it('uses UTC only: the boundary and Japan time map to the expected date', () => {
    expect(dailyDateKey(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
    expect(dailyDateKey(new Date('2026-01-01T23:59:59.999Z'))).toBe('2026-01-01');
    expect(dailyDateKey(new Date('2026-01-02T00:00:00.000Z'))).toBe('2026-01-02');
    // 08:59 JST is still the previous UTC day; 09:00 JST starts the new one.
    expect(dailyDateKey(new Date('2026-01-02T08:59:59+09:00'))).toBe('2026-01-01');
    expect(dailyDateKey(new Date('2026-01-02T09:00:00+09:00'))).toBe('2026-01-02');
    expect(() => dailyDateKey(new Date(Number.NaN))).toThrow(RangeError);
  });
  it('rejects invalid dates and unknown generations', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '26-01-01', '2026-1-1', '1999-12-31', '2026-01-01T00:00:00Z', '', 'abcd-ef-gh']) {
      expect(isDailyDate(bad), bad).toBe(false);
      expect(dailyConditions(bad).ok, bad).toBe(false);
    }
    expect(isDailyDate('2028-02-29')).toBe(true);
    expect(isDailyDate('2027-02-29')).toBe(false);
    expect(dailyConditions('2026-01-01', 'd2' as never).ok).toBe(false);
  });
  // One test per year: the sweep is CPU-bound, and short tests let the test runner keep reporting while it runs.
  it.each(Array.from({ length: 11 }, (_, at) => 2026 + at))(
    'generates and validates every date of %i',
    (year) => {
      const started = performance.now();
      let days = 0;
      for (let index = 0; dateAt(index) <= `${year}-12-31`; index++) {
        const date = dateAt(index);
        if (date < `${year}-01-01`) continue;
        const scenario = must(dailyScenario(date));
        days++;
        expect(inspectGeneratedMap(scenario), date).toEqual([]);
        const conditions = must(dailyConditions(date));
        expect(scenario.id.endsWith(`-${conditions.size}-${conditions.sea}-${conditions.seed}`), date).toBe(true);
        expect(dailyDateOfScenarioId(scenario.id), date).toBe(date);
      }
      console.info(`daily sweep ${year}: ${days} dates in ${Math.round(performance.now() - started)} ms`);
    },
    60_000,
  );
  it('covers 2026-01-01 through 2036-12-31 and every table row', () => {
    // Derives the conditions only (no map generation), so this does not depend on the per-year tests above.
    const shapes = new Set<string>();
    let days = 0;
    for (let index = 0; dateAt(index) <= '2036-12-31'; index++) {
      const date = dateAt(index);
      if (date < '2026-01-01') continue;
      const conditions = must(dailyConditions(date));
      shapes.add(`${conditions.size}/${conditions.sea}/${conditions.preset}`);
      days++;
    }
    expect(days).toBe(4018);
    expect(shapes.size).toBe(DAILY_TABLE_D1.length);
  });
  it('keeps past dates reproducible: the generated definitions are frozen', () => {
    const digests: Record<string, string> = {};
    for (const date of ['2026-01-01', '2026-02-03', '2026-02-17', '2027-07-04', '2030-02-28', '2036-12-31'])
      digests[date] = fnv(canonicalOperationValue(scenarioDefinitionToData(must(dailyScenario(date)))));
    expect(digests).toEqual(FROZEN_DIGESTS);
  });
});
const FROZEN_DIGESTS: Record<string, string> = {
  '2026-01-01': 'f67eb3ab',
  '2026-02-03': '2361e7cb',
  '2026-02-17': '35770d33',
  '2027-07-04': '3607a1b5',
  '2030-02-28': 'a5f6fd9b',
  '2036-12-31': '5bce779c',
};

describe('identifiers', () => {
  it('only treats ids that name exactly the derived conditions as daily', () => {
    const conditions = must(dailyConditions('2026-01-01'));
    expect(conditions.code).toBe('D1-20260101-v3');
    expect(dailyDateOfScenarioId(must(dailyScenario('2026-01-01')).id)).toBe('2026-01-01');
    expect(dailyDateOfScenarioId('generated-v2-16-none-D20260101')).toBeUndefined(); // wrong size, sea and preset for that date
    expect(dailyDateOfScenarioId('generated-v2-20-ocean-D20260101')).toBeUndefined(); // frontline day, standard id
    expect(dailyDateOfScenarioId('generated-v3-frontline-20-ocean-D20260230')).toBeUndefined(); // impossible date
    expect(dailyDateOfScenarioId('generated-v1-20-ocean-D20260101')).toBeUndefined();
    expect(dailyDateOfScenarioId('skirmish')).toBeUndefined();
  });
  it('maps the copy identifier to the internal scenario id', () => {
    expect(must(dailyScenario('2026-01-01')).id).toBe('generated-v3-frontline-20-ocean-D20260101');
    expect(must(dailyScenario('2026-01-02')).id).toBe('generated-v2-24-ocean-D20260102');
  });
});

describe('recording rules', () => {
  it('replays and records a resumed v10 daily victory under its original rules', () => {
    const played = playOut(must(dailyScenario(STANDARD_WIN_DATE)), 'hard', 'easy', 10);
    const { initial, final } = played;
    expect(final.winner).toBe('red');
    const replay = must(createReplay({ mapId: initial.scenarioId!, difficulty: 'normal', initialState: initial, commands: played.commands }));
    expect(must(parseReplay(must(serializeReplay(replay)))).finalState).toEqual(final);
    const victory = must(dailyVictory(initial, final, played.commands, context));
    expect(victory.record.ruleVersion).toBe(10);
    expect(must(saveDailyVictory(memoryStorage(), victory.record)).retained).toBe(true);
  });
  it('records a standard red victory with the replayed turns and losses', () => {
    for (const date of [FRONTLINE_WIN_DATE, STANDARD_WIN_DATE]) {
      const played = won(date);
      const result = must(dailyVictory(played.initial, played.final, played.commands, context, new Date('2026-03-01T00:00:00Z')));
      expect(result.code).toBe(must(dailyConditions(date)).code);
      expect(result.record).toMatchObject({ date, generation: 'd1', ruleVersion: CURRENT_RULE_VERSION, updatedAt: '2026-03-01T00:00:00.000Z' });
      expect(result.record.bestTurns).toBe(played.final.turn - Number(played.commands.at(-1)?.type === 'endTurn' && played.final.activePlayer === 'red'));
      expect(result.record.bestLosses).toBeGreaterThanOrEqual(0);
    }
  });
  it('does not record a changed or non-standard match, and says why', () => {
    const played = won(STANDARD_WIN_DATE);
    const base = must(dailyScenario(STANDARD_WIN_DATE));
    const refuse = (patch: Partial<Parameters<typeof dailyVictory>[3]> = {}, initial = played.initial, final = played.final) => {
      const result = dailyVictory(initial, final, played.commands, { ...context, ...patch });
      expect(result.ok).toBe(false);
      return result.ok ? '' : result.error;
    };
    expect(refuse({ difficulty: 'easy' })).toContain('難易度');
    expect(refuse({ difficulty: 'hard' })).toContain('難易度');
    expect(refuse({ matchMode: 'hotseat' })).toContain('人間の赤軍対CPU');
    expect(refuse({ matchMode: 'spectate' })).toContain('人間の赤軍対CPU');
    // Unlimited supplies (a previous rule version) are refused before any replay.
    expect(refuse({}, { ...played.initial, ruleVersion: BRIDGE_RULE_VERSION })).toContain('補給方式');
    expect(refuse({}, played.initial, { ...played.final, winner: 'blue' })).toContain('赤軍が勝利');
    // A different date's match is never mistaken for this one.
    const other = createScenarioInitialState(must(dailyScenario(FRONTLINE_WIN_DATE)));
    expect(refuse({}, { ...other, scenarioId: played.initial.scenarioId })).toBeTruthy();
    expect(dailyVictory(createScenarioInitialState(base), played.final, played.commands, context).ok).toBe(true);
    // A match that is not a generated daily one at all.
    expect(dailyVictory({ ...played.initial, scenarioId: 'skirmish' }, played.final, played.commands, context)).toMatchObject({
      ok: false,
      error: expect.stringContaining('日替わり'),
    });
  });
  it('rejects tampered histories', () => {
    const played = won(STANDARD_WIN_DATE);
    expect(dailyVictory(played.initial, played.final, played.commands.slice(0, -1), context).ok).toBe(false);
    expect(dailyVictory(played.initial, played.final, [{ type: 'wait', unitId: 'nobody' }, ...played.commands], context).ok).toBe(false);
    expect(dailyVictory(played.initial, played.final, [{ type: 'nonsense' } as unknown as GameCommand], context).ok).toBe(false);
  });
  it('treats only the exact standard deployment as eligible, even after changing it and changing it back', () => {
    const base = must(dailyScenario(STANDARD_WIN_DATE));
    const slots = deploymentSlots(base, 'red');
    const original = slots.map((slot) => slot.kind);
    const index = slots.findIndex((slot) => slot.choices.some((kind) => kind !== slot.kind && unitStats[kind].cost <= unitStats[slot.kind].cost));
    expect(index).toBeGreaterThanOrEqual(0);
    const cheaper = slots[index]!.choices.find((kind) => kind !== slots[index]!.kind && unitStats[kind].cost <= unitStats[slots[index]!.kind].cost)!;
    const changed = original.map((kind, at) => (at === index ? cheaper : kind));
    // A change, including one that leaves part of the budget unused, is not the standard match.
    const modified = must(createDeploymentScenario(base, changed, 'red'));
    expect(isStandardDailyDefinition(modified)).toBe(false);
    expect(dailyMatchOf(createScenarioInitialState(modified))).toBeUndefined();
    expect(dailyVictory(createScenarioInitialState(modified), won(STANDARD_WIN_DATE).final, won(STANDARD_WIN_DATE).commands, context)).toMatchObject({
      ok: false,
      error: expect.stringContaining('編成'),
    });
    // Changing back yields exactly the canonical definition again.
    const restored = must(createDeploymentScenario(base, original, 'red'));
    expect(isStandardDailyDefinition(restored)).toBe(true);
    expect(dailyMatchOf(createScenarioInitialState(restored))?.date).toBe(STANDARD_WIN_DATE);
  });
});

describe('daily records', () => {
  it('saves, merges the best of each figure, and keeps unchanged records untouched', () => {
    const storage = memoryStorage();
    const first = must(saveDailyVictory(storage, record('2026-02-03', { bestTurns: 20, bestLosses: 2 })));
    expect(first.changed).toBe(true);
    const merged = must(saveDailyVictory(storage, record('2026-02-03', { bestTurns: 25, bestLosses: 0, updatedAt: '2026-02-04T00:00:00.000Z' })));
    expect(merged.changed).toBe(true);
    expect(merged.catalog.records).toEqual([record('2026-02-03', { bestTurns: 20, bestLosses: 0, updatedAt: '2026-02-04T00:00:00.000Z' })]);
    const before = storage.data.get(DAILY_RECORDS_KEY);
    expect(must(saveDailyVictory(storage, record('2026-02-03', { bestTurns: 30, bestLosses: 5 }))).changed).toBe(false);
    expect(storage.data.get(DAILY_RECORDS_KEY)).toBe(before);
  });
  it('replaces a record made under a different rule version instead of mixing them', () => {
    const storage = memoryStorage();
    saveDailyVictory(storage, record('2026-02-03', { ruleVersion: BRIDGE_RULE_VERSION, bestTurns: 5, bestLosses: 0 }));
    const saved = must(saveDailyVictory(storage, record('2026-02-03', { bestTurns: 9, bestLosses: 3 })));
    expect(saved.catalog.records).toHaveLength(1);
    expect(saved.catalog.records[0]).toMatchObject({ ruleVersion: CURRENT_RULE_VERSION, bestTurns: 9, bestLosses: 3 });
  });
  it('keeps only the newest 60 dates, newest first', () => {
    const storage = memoryStorage();
    for (let at = 0; at < MAX_DAILY_RECORDS + 5; at++) saveDailyVictory(storage, record(dateAt(at)));
    const catalog = must(loadDailyRecords(storage));
    expect(catalog.records).toHaveLength(MAX_DAILY_RECORDS);
    expect(catalog.records[0]!.date).toBe(dateAt(MAX_DAILY_RECORDS + 4));
    expect(catalog.records.at(-1)!.date).toBe(dateAt(5));
    // A record older than every kept date is not stored at all.
    const before = storage.data.get(DAILY_RECORDS_KEY);
    const old = must(saveDailyVictory(storage, record('2025-01-01')));
    expect(old).toMatchObject({ changed: false, retained: false });
    expect(storage.data.get(DAILY_RECORDS_KEY)).toBe(before);
    expect(old.catalog.records.some((entry) => entry.date === '2025-01-01')).toBe(false);
  });
  it('rejects malformed, oversized, duplicate and out-of-range data', () => {
    const wrap = (records: unknown) => JSON.stringify({ schemaVersion: 1, records });
    const good = record('2026-02-03');
    const cases: [string, string][] = [
      ['not json', '{'],
      ['array root', '[]'],
      ['schema 2', JSON.stringify({ schemaVersion: 2, records: [] })],
      ['extra root key', JSON.stringify({ schemaVersion: 1, records: [], extra: 1 })],
      ['records not array', wrap({})],
      ['extra field', wrap([{ ...good, extra: 1 }])],
      ['missing field', wrap([{ date: good.date }])],
      ['bad date', wrap([{ ...good, date: '2026-02-30' }])],
      ['bad generation', wrap([{ ...good, generation: 'd2' }])],
      ['unknown rule version', wrap([{ ...good, ruleVersion: 99 }])],
      ['zero turns', wrap([{ ...good, bestTurns: 0 }])],
      ['fractional turns', wrap([{ ...good, bestTurns: 1.5 }])],
      ['huge turns', wrap([{ ...good, bestTurns: 1001 }])],
      ['negative losses', wrap([{ ...good, bestLosses: -1 }])],
      ['string losses', wrap([{ ...good, bestLosses: '1' }])],
      ['bad time', wrap([{ ...good, updatedAt: 'yesterday' }])],
      ['long time', wrap([{ ...good, updatedAt: `2026-02-03T00:00:00.000Z${' '.repeat(40)}` }])],
      ['duplicate date', wrap([good, good])],
      ['too many', wrap(Array.from({ length: MAX_DAILY_RECORDS + 1 }, (_, at) => record(dateAt(at))))],
      ['oversized', `${wrap([])}${' '.repeat(40_000)}`],
    ];
    for (const [name, text] of cases) expect(parseDailyRecords(text).ok, name).toBe(false);
    expect(parseDailyRecords(wrap([good])).ok).toBe(true);
  });
  it('keeps existing records when storing fails and refuses to overwrite unreadable data', () => {
    const storage = memoryStorage();
    saveDailyVictory(storage, record('2026-02-03'));
    const before = storage.data.get(DAILY_RECORDS_KEY);
    const failing: StorageLike = {
      ...storage,
      getItem: storage.getItem,
      setItem: () => {
        throw Error('quota');
      },
      removeItem: () => {
        throw Error('denied');
      },
    };
    expect(saveDailyVictory(failing, record('2026-02-04'))).toMatchObject({ ok: false, error: expect.stringContaining('既存記録は保持') });
    expect(deleteDailyRecord(failing, '2026-02-03').ok).toBe(false);
    expect(resetDailyRecords(failing).ok).toBe(false);
    expect(storage.data.get(DAILY_RECORDS_KEY)).toBe(before);

    storage.data.set(DAILY_RECORDS_KEY, '{broken');
    expect(loadDailyRecords(storage).ok).toBe(false);
    expect(saveDailyVictory(storage, record('2026-02-04')).ok).toBe(false);
    expect(deleteDailyRecord(storage, '2026-02-03').ok).toBe(false);
    expect(storage.data.get(DAILY_RECORDS_KEY)).toBe('{broken');
    // Reset is the recovery path and works on corrupt data.
    expect(resetDailyRecords(storage).ok).toBe(true);
    expect(storage.data.has(DAILY_RECORDS_KEY)).toBe(false);
    expect(must(loadDailyRecords(storage)).records).toEqual([]);
    expect(
      loadDailyRecords({
        ...storage,
        getItem: () => {
          throw Error('blocked');
        },
      }).ok,
    ).toBe(false);
  });
  it('deletes one date and reports a missing one', () => {
    const storage = memoryStorage();
    saveDailyVictory(storage, record('2026-02-03'));
    saveDailyVictory(storage, record('2026-02-04'));
    expect(must(deleteDailyRecord(storage, '2026-02-03')).records.map((entry) => entry.date)).toEqual(['2026-02-04']);
    expect(deleteDailyRecord(storage, '2026-02-03').ok).toBe(false);
    expect(must(loadDailyRecords(storage)).records).toHaveLength(1);
  });
  it('never touches the operation records key', () => {
    const storage = memoryStorage();
    storage.data.set('ministr.operations.records', 'untouched');
    saveDailyVictory(storage, record('2026-02-03'));
    deleteDailyRecord(storage, '2026-02-03');
    resetDailyRecords(storage);
    expect(storage.data.get('ministr.operations.records')).toBe('untouched');
  });
});
