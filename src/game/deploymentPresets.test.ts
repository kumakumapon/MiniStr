import { describe, expect, it } from 'vitest';
import {
  applyDeploymentPreset,
  deleteDeploymentPreset,
  DEPLOYMENT_PRESETS_KEY,
  deploymentFingerprint,
  loadDeploymentPresets,
  parseDeploymentPresets,
  resetDeploymentPresets,
  saveDeploymentPreset,
} from './deploymentPresets';
import { createDeploymentScenario, deploymentSlots } from './deployment';
import { operation, valueOf } from './operations.fixture';
import type { StorageLike } from './session';
import { exportBackup, previewBackup, restoreBackup } from './backup';

function storage(): StorageLike {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
const scenario = operation();
const kinds = deploymentSlots(scenario).map((slot) => slot.kind);

describe('deployment presets', () => {
  it('round-trips presets in complete backups and validates them before replacement', () => {
    const source = storage();
    valueOf(saveDeploymentPreset(source, scenario, 'red', 0, 'Backup', kinds));
    const text = valueOf(exportBackup(source));
    const target = storage();
    target.setItem('another.app', 'keep');
    const preview = valueOf(previewBackup(target, text));
    valueOf(restoreBackup(target, preview));
    expect(target.getItem(DEPLOYMENT_PRESETS_KEY)).toBe(source.getItem(DEPLOYMENT_PRESETS_KEY));
    expect(target.getItem('another.app')).toBe('keep');
    const before = target.getItem(DEPLOYMENT_PRESETS_KEY);
    const malformed = JSON.stringify({ schemaVersion: 1, entries: [[DEPLOYMENT_PRESETS_KEY, '{bad']] });
    expect(restoreBackup(target, malformed).ok).toBe(false);
    expect(target.getItem(DEPLOYMENT_PRESETS_KEY)).toBe(before);
  });
  it('saves, overwrites, applies and deletes three slots independently by map and side', () => {
    const store = storage();
    expect(valueOf(loadDeploymentPresets(store)).presets).toEqual([]);
    for (const slot of [0, 1, 2]) valueOf(saveDeploymentPreset(store, scenario, 'red', slot, `編成${slot}`, kinds));
    valueOf(
      saveDeploymentPreset(
        store,
        scenario,
        'blue',
        0,
        '青',
        deploymentSlots(scenario, 'blue').map((slot) => slot.kind),
      ),
    );
    const other = operation({ id: 'other' });
    valueOf(saveDeploymentPreset(store, other, 'red', 0, '別作戦', kinds));
    const catalog = valueOf(saveDeploymentPreset(store, scenario, 'red', 0, ' 更新 ', kinds));
    expect(catalog.presets).toHaveLength(5);
    const preset = catalog.presets.find((entry) => entry.scenarioId === scenario.id && entry.player === 'red' && entry.slot === 0)!;
    expect(preset.name).toBe('更新');
    const selected = valueOf(applyDeploymentPreset(scenario, 'red', preset));
    expect(selected).toEqual(kinds);
    selected[0] = 'bomber';
    expect(preset.kinds).toEqual(kinds);
    expect(valueOf(deleteDeploymentPreset(store, scenario.id, 'red', 0)).presets).toHaveLength(4);
    expect(valueOf(resetDeploymentPresets(store)).presets).toEqual([]);
    expect(store.getItem(DEPLOYMENT_PRESETS_KEY)).toBeNull();
  });

  it('rechecks budget, capturing capability, terrain, fixed slots and map revisions', () => {
    const store = storage();
    const preset = valueOf(saveDeploymentPreset(store, scenario, 'red', 0, 'Test', kinds)).presets[0]!;
    expect(applyDeploymentPreset(scenario, 'blue', preset).ok).toBe(false);
    expect(applyDeploymentPreset(operation({ id: 'other' }), 'red', preset).ok).toBe(false);
    expect(applyDeploymentPreset(operation({ board: { width: 8, height: 4, cells: [[1, 1, 'mountain']] } }), 'red', preset).ok).toBe(false);
    expect(applyDeploymentPreset(scenario, 'red', { ...preset, kinds: ['heavyTank', 'heavyTank', 'heavyTank'] }).ok).toBe(false);
    expect(saveDeploymentPreset(store, scenario, 'red', 0, 'Bad', ['battleship', 'infantry', 'apc']).ok).toBe(false);
    const escort = operation({ victoryConditions: [{ type: 'escort', unitIds: ['r1'], positions: [{ x: 3, y: 1 }], required: 1 }] });
    expect(saveDeploymentPreset(store, escort, 'red', 0, 'Bad', ['recon', 'tank', 'apc']).ok).toBe(false);
    expect(deploymentFingerprint(scenario)).not.toBe(deploymentFingerprint(escort));
    const deployed = valueOf(createDeploymentScenario(scenario, kinds, 'red', [{ kind: 'infantry', experience: 8 }]));
    expect(deploymentFingerprint(deployed)).toBe(deploymentFingerprint(scenario));
  });

  it('rejects invalid names and slots without replacing a valid catalog', () => {
    const store = storage();
    valueOf(saveDeploymentPreset(store, scenario, 'red', 0, 'Valid', kinds));
    const before = store.getItem(DEPLOYMENT_PRESETS_KEY);
    for (const [slot, name] of [
      [3, 'Bad'],
      [-1, 'Bad'],
      [0, ''],
      [0, 'x'.repeat(25)],
      [0, '\nBad'],
    ] as const)
      expect(saveDeploymentPreset(store, scenario, 'red', slot, name, kinds).ok).toBe(false);
    expect(store.getItem(DEPLOYMENT_PRESETS_KEY)).toBe(before);
  });

  it.each([null, {}, { schemaVersion: 2, presets: [] }, { schemaVersion: 1, presets: [], extra: 1 }, { schemaVersion: 1, presets: [null] }])(
    'rejects malformed external catalogs %j',
    (data) => {
      expect(parseDeploymentPresets(JSON.stringify(data)).ok).toBe(false);
    },
  );

  it('rejects duplicate, invalid and excessive preset data and preserves corrupt storage', () => {
    const store = storage();
    const preset = valueOf(saveDeploymentPreset(store, scenario, 'red', 0, 'Test', kinds)).presets[0]!;
    const parse = (presets: unknown[]) => parseDeploymentPresets(JSON.stringify({ schemaVersion: 1, presets }));
    for (const patch of [
      { player: { toString: null } },
      { player: 'green' },
      { scenarioId: '../bad' },
      { slot: 0.5 },
      { fingerprint: 'bad' },
      { kinds: ['bad'] },
      { kinds: new Array(129).fill('infantry') },
      { extra: 1 },
      { name: '\u0000bad' },
    ])
      expect(parse([{ ...preset, ...patch }]).ok).toBe(false);
    expect(parse([preset, preset]).ok).toBe(false);
    expect(parse(new Array(193).fill(preset)).ok).toBe(false);
    expect(parseDeploymentPresets(' '.repeat(256_001)).ok).toBe(false);
    store.setItem(DEPLOYMENT_PRESETS_KEY, '{bad');
    expect(loadDeploymentPresets(store).ok).toBe(false);
    expect(saveDeploymentPreset(store, scenario, 'red', 0, 'New', kinds).ok).toBe(false);
    expect(deleteDeploymentPreset(store, scenario.id, 'red', 0).ok).toBe(false);
    expect(store.getItem(DEPLOYMENT_PRESETS_KEY)).toBe('{bad');
  });

  it('reports unavailable reads, quota writes and failed resets', () => {
    const denied: StorageLike = {
      getItem: () => {
        throw Error('denied');
      },
      setItem: () => {
        throw Error('quota');
      },
      removeItem: () => {
        throw Error('denied');
      },
    };
    expect(loadDeploymentPresets(denied).ok).toBe(false);
    expect(resetDeploymentPresets(denied).ok).toBe(false);
    expect(saveDeploymentPreset({ ...denied, getItem: () => null }, scenario, 'red', 0, 'New', kinds).ok).toBe(false);
  });
});
