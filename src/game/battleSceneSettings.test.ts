import { describe, expect, it } from 'vitest';
import { BATTLE_SCENE_SETTINGS_KEY, loadBattleSceneSettings, parseBattleSceneSettings, saveBattleSceneSetting } from './battleSceneSettings';
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
describe('battle scene preferences', () => {
  it('defaults to visible, preserves the other mode and roundtrips a backup', () => {
    const source = storage();
    expect(loadBattleSceneSettings(source)).toEqual({ twoArmy: true, multiArmy: true });
    expect(saveBattleSceneSetting(source, 'twoArmy', false)).toBe(true);
    expect(saveBattleSceneSetting(source, 'multiArmy', false)).toBe(true);
    expect(saveBattleSceneSetting(source, 'twoArmy', true)).toBe(true);
    expect(loadBattleSceneSettings(source)).toEqual({ twoArmy: true, multiArmy: false });
    const backup = exportBackup(source);
    if (!backup.ok) throw Error(backup.error);
    const target = storage();
    const preview = previewBackup(target, backup.value);
    if (!preview.ok) throw Error(preview.error);
    expect(restoreBackup(target, preview.value).ok).toBe(true);
    expect(target.getItem(BATTLE_SCENE_SETTINGS_KEY)).toBe(source.getItem(BATTLE_SCENE_SETTINGS_KEY));
  });
  it.each(['{', 'null', '[]', '{}', '{"twoArmy":0,"multiArmy":true}', '{"twoArmy":false,"multiArmy":true,"extra":true}', ' '.repeat(129)])(
    'rejects malformed preferences without trusting imported values: %s',
    (raw) => {
      const s = storage();
      s.setItem(BATTLE_SCENE_SETTINGS_KEY, raw);
      expect(parseBattleSceneSettings(raw)).toBeUndefined();
      expect(loadBattleSceneSettings(s)).toEqual({ twoArmy: true, multiArmy: true });
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
    expect(loadBattleSceneSettings(s)).toEqual({ twoArmy: true, multiArmy: true });
    expect(saveBattleSceneSetting(s, 'multiArmy', false)).toBe(false);
    expect(saveBattleSceneSetting(storage(), 'twoArmy', 'false' as unknown as boolean)).toBe(false);
  });
});
