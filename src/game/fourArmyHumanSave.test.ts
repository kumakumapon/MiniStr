import { expect, it } from 'vitest';
import { fourArmySpectatorFixture } from './fourArmySpectator.fixture';
import { fourArmySlotName, parseFourArmySpectatorSave, serializeFourArmySpectatorSave, type FourArmySpectatorSave } from './fourArmySpectatorSave';
import { exportBackup, previewBackup } from './backup';
const human = (): FourArmySpectatorSave => ({ ...fourArmySpectatorFixture(8), format: 'ministr-four-army-match', schemaVersion: 2, humanArmy: 'army3', view: 'army3' });
it('preserves the human controller, active actor, RNG and history through save, file verification and backup', () => {
  const source = human(),
    encoded = serializeFourArmySpectatorSave(source);
  expect(encoded.ok).toBe(true);
  if (!encoded.ok) throw Error(encoded.error);
  const decoded = parseFourArmySpectatorSave(encoded.value);
  expect(decoded).toEqual({ ok: true, value: source });
  expect(fourArmySlotName(encoded.value)).toBe(source.name);
  const store = {
    length: 1,
    key: () => 'ministr.fourArmy.save.1',
    getItem: (key: string) => (key === 'ministr.fourArmy.save.1' ? encoded.value : null),
    setItem: () => {},
    removeItem: () => {},
  };
  const backup = exportBackup(store);
  expect(backup.ok).toBe(true);
  if (!backup.ok) throw Error(backup.error);
  expect(previewBackup(store, backup.value).ok).toBe(true);
});
it('rejects forged controller/view metadata, legacy human envelopes and invalid histories while retaining spectator compatibility', () => {
  const source = human();
  for (const patch of [{ humanArmy: 'army5' }, { humanArmy: null }, { view: 'all' }, { view: 'army2' }, { schemaVersion: 1 }, { format: 'ministr-four-army-spectator' }]) {
    expect(serializeFourArmySpectatorSave({ ...source, ...patch } as FourArmySpectatorSave).ok, JSON.stringify(patch)).toBe(false);
  }
  const { humanArmy: omitted, ...missing } = source as Extract<FourArmySpectatorSave, { format: 'ministr-four-army-match' }>;
  expect(omitted).toBe('army3');
  expect(serializeFourArmySpectatorSave(missing as FourArmySpectatorSave).ok).toBe(false);
  const forged = human();
  forged.archive.payload.state.rngSeed++;
  expect(serializeFourArmySpectatorSave(forged).ok).toBe(false);
  const old = fourArmySpectatorFixture(2),
    raw = JSON.stringify(old);
  expect(parseFourArmySpectatorSave(raw)).toEqual({ ok: true, value: old });
  expect(old).not.toHaveProperty('humanArmy');
});

it('retains a defeated controller when importing and replaying a verified record', async () => {
  const { fourArmyHumanFinishedFixture } = await import('./fourArmyHuman.fixture');
  for (const source of [fourArmyHumanFinishedFixture(), fourArmyHumanFinishedFixture('army4', true)]) {
    const encoded = serializeFourArmySpectatorSave(source);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) throw Error(encoded.error);
    expect(parseFourArmySpectatorSave(encoded.value)).toEqual({ ok: true, value: source });
  }
});
