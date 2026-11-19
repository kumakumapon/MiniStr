import { describe, expect, it } from 'vitest';
import { ACTION_SCENE_SETTINGS_KEY, loadActionSceneSettings, parseActionSceneSettings, saveActionSceneSetting } from './actionSceneSettings';
import { exportBackup, previewBackup, restoreBackup } from './backup';
const storage = () => {
  const entries = new Map<string, string>();
  return {
    entries,
    get length() {
      return entries.size;
    },
    key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => {
      entries.set(k, v);
    },
    removeItem: (k: string) => {
      entries.delete(k);
    },
  };
};
describe('capture and logistics scene preferences', () => {
  it('defaults to visible, preserves the other mode and roundtrips a backup', () => {
    const source = storage();
    expect(loadActionSceneSettings(source)).toEqual({ twoArmy: true, multiArmy: true });
    expect(saveActionSceneSetting(source, 'twoArmy', false)).toBe(true);
    expect(saveActionSceneSetting(source, 'multiArmy', false)).toBe(true);
    expect(saveActionSceneSetting(source, 'twoArmy', true)).toBe(true);
    expect(loadActionSceneSettings(source)).toEqual({ twoArmy: true, multiArmy: false });
    const backup = exportBackup(source);
    if (!backup.ok) throw Error(backup.error);
    const target = storage();
    const preview = previewBackup(target, backup.value);
    if (!preview.ok) throw Error(preview.error);
    expect(restoreBackup(target, preview.value).ok).toBe(true);
    expect(target.getItem(ACTION_SCENE_SETTINGS_KEY)).toBe(source.getItem(ACTION_SCENE_SETTINGS_KEY));
  });
  it.each(['{', 'null', '[]', '{}', '{"twoArmy":0,"multiArmy":true}', '{"twoArmy":false,"multiArmy":true,"extra":true}', ' '.repeat(129)])(
    'rejects malformed preferences without trusting imported values: %s',
    (raw) => {
      const s = storage();
      s.setItem(ACTION_SCENE_SETTINGS_KEY, raw);
      expect(parseActionSceneSettings(raw)).toBeUndefined();
      expect(loadActionSceneSettings(s)).toEqual({ twoArmy: true, multiArmy: true });
      const backup = exportBackup(s);
      if (!backup.ok) throw Error(backup.error);
      expect(previewBackup(storage(), backup.value).ok).toBe(false);
    },
  );
  it('handles unavailable storage and rejects nonboolean writes', () => {
    const s = {
      getItem: () => {
        throw Error('unavailable');
      },
      setItem: () => {
        throw Error('unavailable');
      },
      removeItem: () => {},
    };
    expect(loadActionSceneSettings(s)).toEqual({ twoArmy: true, multiArmy: true });
    expect(saveActionSceneSetting(s, 'multiArmy', false)).toBe(false);
    expect(saveActionSceneSetting(storage(), 'twoArmy', 'false' as unknown as boolean)).toBe(false);
  });
});

it('keeps battle and action preferences independent and accepts older backups without the new key', () => {
  const s = storage();
  s.setItem('ministr.battleScene.settings', JSON.stringify({ twoArmy: true, multiArmy: false }));
  saveActionSceneSetting(s, 'twoArmy', false);
  expect(s.getItem('ministr.battleScene.settings')).toBe('{"twoArmy":true,"multiArmy":false}');
  expect(loadActionSceneSettings(s)).toEqual({ twoArmy: false, multiArmy: true });
  const old = storage();
  const backup = exportBackup(old);
  if (!backup.ok) throw Error(backup.error);
  expect(previewBackup(s, backup.value).ok).toBe(true);
});
