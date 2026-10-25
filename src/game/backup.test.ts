import { loadMusicSettings, MUSIC_SETTINGS_KEY, defaultMusicSettings } from './musicSettings';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAILY_RECORDS_KEY, loadDailyRecords, saveDailyVictory } from './dailyChallenge';
import { exportBackup, previewBackup, restoreBackup } from './backup';
import { CUSTOM_SCENARIOS_KEY, createScenarioInitialState, loadCustomScenarios, maps, saveGameToSlot, scenarioById, scenarioDefinitionToData, type StorageLike } from './index';

class Store implements StorageLike {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
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
const pack = (entries: unknown) => JSON.stringify({ schemaVersion: 1, entries });
describe('complete local backup', () => {
  it('round trips data without touching another app and removes obsolete app entries', () => {
    const source = new Store();
    const initialState = createScenarioInitialState(maps[0]!);
    saveGameToSlot(source, 'one', 'match', {
      mapId: maps[0]!.id,
      difficulty: 'normal',
      initialState,
      gameState: initialState,
      commands: [],
    });
    source.setItem('ministr.sound.settings', '{"muted":true,"volume":0.5}');
    source.setItem('ministr.confirmEndTurnWithUnacted', 'true');
    source.setItem('ministr.locale', 'ja');
    const backup = exportBackup(source);
    if (!backup.ok) throw Error(backup.error);
    const target = new Store();
    target.setItem('another.app', 'private');
    target.setItem('ministr.save.manual', 'old');
    expect(restoreBackup(target, backup.value).ok).toBe(true);
    expect(target.getItem('another.app')).toBe('private');
    expect(target.getItem('ministr.save.manual')).toBeNull();
    for (const [key, value] of source.data) expect(target.getItem(key)).toBe(value);
  });
  it('rejects invalid entries before writing and still exports corrupt data for recovery', () => {
    const storage = new Store();
    storage.setItem('ministr.save.manual', 'broken');
    const old = new Map(storage.data);
    for (const entries of [
      null,
      [['other', 'x']],
      [['ministr.locale', 'xx']],
      [['ministr.sound.settings', '{"muted":true,"volume":8}']],
      [['ministr.confirmEndTurnWithUnacted', 'x']],
      [['ministr.unknown', 'x']],
      [['ministr.save.slots', '[{"id":"missing","name":"x"}]']],
      [['ministr.save.manual', 'broken']],
      [['ministr.scenarios.custom', '{}']],
      [['ministr.campaign.progress', '{}']],
      [
        ['ministr.locale', 'ja'],
        ['ministr.locale', 'en'],
      ],
    ]) {
      expect(restoreBackup(storage, pack(entries)).ok).toBe(false);
      expect(storage.data).toEqual(old);
    }
    expect(restoreBackup(storage, '{').ok).toBe(false);
    expect(exportBackup(storage).ok).toBe(true);
    expect(
      exportBackup({
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }).ok,
    ).toBe(false);
  });
  it('previews the scope of a backup replacement before restore', () => {
    const storage = new Store();
    storage.setItem('ministr.locale', 'ja');
    storage.setItem('ministr.sound.settings', '{"muted":true,"volume":0.5}');
    const preview = previewBackup(
      storage,
      JSON.stringify({
        schemaVersion: 1,
        createdAt: '2026-10-04T00:00:00.000Z',
        entries: [['ministr.locale', 'en']],
      }),
    );
    expect(preview).toEqual({
      ok: true,
      value: {
        createdAt: '2026-10-04T00:00:00.000Z',
        entryCount: 1,
        saveCount: 0,
        hasScenarios: false,
        hasCampaign: false,
        removedEntryCount: 1,
      },
    });
    expect(previewBackup(storage, pack([['ministr.save.manual', 'broken']]))).toMatchObject({
      ok: false,
      error: expect.stringContaining('ministr.save.manual'),
    });
  });
  it('rolls back when storage fails in the middle of restore', () => {
    const storage = new Store();
    storage.setItem('ministr.locale', 'ja');
    const original = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key.endsWith('settings')) throw Error('quota');
      original(key, value);
    };
    expect(
      restoreBackup(
        storage,
        pack([
          ['ministr.locale', 'en'],
          ['ministr.sound.settings', '{"muted":false,"volume":0.5}'],
        ]),
      ).ok,
    ).toBe(false);
    expect([...storage.data]).toEqual([['ministr.locale', 'ja']]);
  });

  it('restores the live scenario catalog after a candidate backup fails validation', () => {
    const live = new Store();
    const liveScenario = {
      ...scenarioDefinitionToData(maps[0]!),
      id: 'live-catalog-scenario',
    };
    live.setItem(
      CUSTOM_SCENARIOS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        scenarios: [liveScenario],
        history: [],
      }),
    );
    expect(loadCustomScenarios(live).ok).toBe(true);
    const target = new Store();
    target.setItem(CUSTOM_SCENARIOS_KEY, '{broken persisted catalog');
    const candidateScenario = {
      ...scenarioDefinitionToData(maps[1]!),
      id: 'candidate-catalog-scenario',
    };
    const restored = restoreBackup(
      target,
      pack([
        [
          CUSTOM_SCENARIOS_KEY,
          JSON.stringify({
            schemaVersion: 1,
            scenarios: [candidateScenario],
            history: [],
          }),
        ],
        ['ministr.save.manual', 'broken'],
      ]),
    );
    expect(restored.ok).toBe(false);
    expect(scenarioById('live-catalog-scenario')?.name).toBe(liveScenario.name);
    expect(scenarioById('candidate-catalog-scenario')).toBeUndefined();
  });

  describe('daily challenge records (#230)', () => {
    const daily = (patch: object = {}) => ({
      date: '2026-02-03',
      generation: 'd1',
      ruleVersion: 10,
      bestTurns: 12,
      bestLosses: 1,
      updatedAt: '2026-02-03T10:00:00.000Z',
      ...patch,
    });
    const text = (records: unknown[]) => JSON.stringify({ schemaVersion: 1, records });

    it('round trips the records and reloads them after a restore', () => {
      const source = new Store();
      expect(saveDailyVictory(source, { ...daily(), ruleVersion: 10 } as never).ok).toBe(true);
      const backup = exportBackup(source);
      if (!backup.ok) throw Error(backup.error);
      const target = new Store();
      target.setItem(DAILY_RECORDS_KEY, text([daily({ date: '2026-01-01' })]));
      const preview = previewBackup(target, backup.value);
      expect(preview).toMatchObject({ ok: true, value: { hasDaily: true } });
      expect(restoreBackup(target, preview.ok ? preview.value : backup.value).ok).toBe(true);
      const reloaded = loadDailyRecords(target);
      expect(reloaded.ok && reloaded.value.records.map((record) => record.date)).toEqual(['2026-02-03']);
    });
    it('rejects invalid or corrupt daily records without touching existing data', () => {
      const storage = new Store();
      storage.setItem(DAILY_RECORDS_KEY, text([daily()]));
      storage.setItem('ministr.locale', 'ja');
      const old = new Map(storage.data);
      for (const raw of [
        '{broken',
        text([daily({ date: '2026-02-30' })]),
        text([daily({ bestTurns: 0 })]),
        text([daily(), daily()]),
        JSON.stringify({ schemaVersion: 2, records: [] }),
      ]) {
        expect(restoreBackup(storage, pack([[DAILY_RECORDS_KEY, raw]])).ok, raw).toBe(false);
        expect(previewBackup(storage, pack([[DAILY_RECORDS_KEY, raw]])).ok, raw).toBe(false);
        expect(storage.data).toEqual(old);
      }
    });
    it('removes the records on restore when the backup does not contain them', () => {
      const storage = new Store();
      storage.setItem(DAILY_RECORDS_KEY, text([daily()]));
      expect(restoreBackup(storage, pack([['ministr.locale', 'en']])).ok).toBe(true);
      expect(storage.getItem(DAILY_RECORDS_KEY)).toBeNull();
    });
  });

  it('knows every persisted key the application source mentions, so a new key cannot be forgotten by backup', () => {
    const files = (directory: string): string[] =>
      readdirSync(directory).flatMap((name) => {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) return files(path);
        return /\.ts$/.test(name) && !/\.(test|fixture|d)\.ts$/.test(name) ? [path] : [];
      });
    const keys = new Set<string>();
    for (const file of files('src')) for (const match of readFileSync(file, 'utf8').matchAll(/'(ministr\.[A-Za-z.]*[A-Za-z])\.?'/g)) keys.add(match[1]!);
    expect([...keys]).toContain(DAILY_RECORDS_KEY);
    const unsupported = [...keys].filter((key) => {
      const result = restoreBackup(new Store(), pack([[key.endsWith('.slot') ? `${key}.probe` : key, 'x']]));
      return !result.ok && result.error.includes('未対応の保存項目');
    });
    expect(unsupported).toEqual([]);
  });
});

it.each([
  { muted: false, volume: 0.5 },
  { ...defaultMusicSettings, fieldTrack: 'rock-red', blueFieldTrack: 'mist', armyTracks: false },
])('restores legacy/current BGM settings atomically: %j', (settings) => {
  const source = new Store();
  source.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(settings));
  const exported = exportBackup(source);
  if (!exported.ok) throw Error(exported.error);
  const target = new Store();
  const preview = previewBackup(target, exported.value);
  if (!preview.ok) throw Error(preview.error);
  expect(restoreBackup(target, preview.value).ok).toBe(true);
  expect(loadMusicSettings(target)).toMatchObject(settings);
});
it.each([
  '{',
  '[]',
  'null',
  JSON.stringify({ muted: false, volume: 1.1 }),
  JSON.stringify({ muted: false, volume: -1 }),
  JSON.stringify({ muted: 'false', volume: 0.5 }),
  JSON.stringify({ ...defaultMusicSettings, fieldTrack: 'unknown' }),
  JSON.stringify({ ...defaultMusicSettings, blueFieldTrack: null }),
  JSON.stringify({ ...defaultMusicSettings, armyTracks: 1 }),
  JSON.stringify({ ...defaultMusicSettings, extra: 'a'.repeat(1001) }),
])('rejects invalid BGM before any writes: %s', (raw) => {
  const target = new Store();
  target.setItem('ministr.locale', 'ja');
  target.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(defaultMusicSettings));
  const before = new Map(target.data);
  const backup = pack([
    ['ministr.locale', 'en'],
    [MUSIC_SETTINGS_KEY, raw],
  ]);
  expect(previewBackup(target, backup).ok).toBe(false);
  expect(restoreBackup(target, backup).ok).toBe(false);
  expect(target.data).toEqual(before);
});
