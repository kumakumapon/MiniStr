import { expect, it, vi } from 'vitest';
import { FourArmyAutosave } from './fourArmyAutosave';
import { FOUR_ARMY_AUTO_SAVE_KEY, FOUR_ARMY_SAVE_KEYS } from '../game/fourArmySpectatorSave';
import { fourArmySpectatorFixture } from '../game/fourArmySpectator.fixture';
import { FourArmyFileCodec } from './fourArmyFileCodec';
import type { FourArmyFileResult } from '../game/fourArmySpectatorProtocol';
import type { GameResult } from '../game/types';
import type { StorageLike } from '../game/session';
function store() {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
    removeItem: (k) => {
      values.delete(k);
    },
  };
  return { values, storage };
}
const fallback = () =>
  new FourArmyFileCodec(() => {
    throw Error('no Worker');
  });
it('does not begin verification without writer ownership and preserves storage on read or verification errors', async () => {
  const { values, storage } = store();
  const codec = { cancel: vi.fn(), run: vi.fn(async () => ({ ok: false as const, error: 'invalid' })) };
  const auto = new FourArmyAutosave(storage, () => false, undefined, codec);
  await auto.write(fourArmySpectatorFixture());
  expect(auto.status).toBe('blocked-writer');
  expect(codec.run).not.toHaveBeenCalled();
  const invalid = new FourArmyAutosave(storage, () => true, undefined, codec);
  await invalid.write(fourArmySpectatorFixture());
  expect(invalid.status).toBe('failed');
  expect(values.size).toBe(0);
  const unavailable = new FourArmyAutosave(
    {
      ...storage,
      getItem: () => {
        throw Error('storage denied');
      },
    },
    () => true,
    undefined,
    codec,
  );
  await unavailable.write(fourArmySpectatorFixture());
  expect(unavailable.status).toBe('failed');
  expect(values.size).toBe(0);
});
it('writes only its dedicated slot and preserves corrupt and unknown originals', async () => {
  const { values, storage } = store();
  values.set(FOUR_ARMY_SAVE_KEYS[0], 'manual one');
  values.set(FOUR_ARMY_SAVE_KEYS[1], 'manual two');
  const auto = new FourArmyAutosave(storage, () => true, undefined, fallback());
  await auto.write(fourArmySpectatorFixture());
  expect(auto.status).toBe('saved');
  expect(values.has(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(true);
  expect(values.get(FOUR_ARMY_SAVE_KEYS[0])).toBe('manual one');
  expect(values.get(FOUR_ARMY_SAVE_KEYS[1])).toBe('manual two');
  for (const raw of ['{', '{"format":"ministr-four-army-configurable","schemaVersion":999}']) {
    values.set(FOUR_ARMY_AUTO_SAVE_KEY, raw);
    await auto.write(fourArmySpectatorFixture(4));
    expect(auto.status).toBe('blocked-original');
    expect(values.get(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(raw);
  }
  values.delete(FOUR_ARMY_AUTO_SAVE_KEY);
  auto.reset();
  expect(auto.status).toBe('idle');
  await auto.write(fourArmySpectatorFixture());
  expect(auto.status).toBe('saved');
});
it('rechecks writer ownership and detects a concurrent slot change before committing', async () => {
  const { values, storage } = store();
  let writable = true;
  let resolve!: (r: GameResult<FourArmyFileResult>) => void;
  const codec = {
    cancel: vi.fn(),
    run: vi.fn(
      () =>
        new Promise<GameResult<FourArmyFileResult>>((r) => {
          resolve = r;
        }),
    ),
  };
  const snapshot = fourArmySpectatorFixture(),
    checked: GameResult<FourArmyFileResult> = { ok: true, value: { text: 'verified', save: snapshot, checkpoints: [] } };
  const auto = new FourArmyAutosave(storage, () => writable, undefined, codec);
  const pending = auto.write(snapshot);
  writable = false;
  resolve(checked);
  await pending;
  expect(auto.status).toBe('blocked-writer');
  expect(values.has(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(false);
  writable = true;
  const changed = auto.write(snapshot);
  values.set(FOUR_ARMY_AUTO_SAVE_KEY, 'other tab');
  resolve(checked);
  await changed;
  expect(auto.status).toBe('conflict');
  expect(values.get(FOUR_ARMY_AUTO_SAVE_KEY)).toBe('other tab');
});
it('does not overwrite any original when capacity fails and discards late cancelled verification', async () => {
  const { values, storage } = store();
  const original = JSON.stringify(fourArmySpectatorFixture());
  values.set(FOUR_ARMY_AUTO_SAVE_KEY, original);
  const auto = new FourArmyAutosave(
    {
      ...storage,
      setItem: () => {
        throw Error('quota');
      },
    },
    () => true,
    undefined,
    fallback(),
  );
  await auto.write(fourArmySpectatorFixture(4));
  expect(auto.status).toBe('failed');
  expect(values.get(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(original);
  let resolve!: (v: GameResult<FourArmyFileResult>) => void;
  const codec = {
    cancel: vi.fn(),
    run: vi.fn(
      () =>
        new Promise<GameResult<FourArmyFileResult>>((r) => {
          resolve = r;
        }),
    ),
  };
  values.delete(FOUR_ARMY_AUTO_SAVE_KEY);
  const cancelled = new FourArmyAutosave(storage, () => true, undefined, codec),
    pending = cancelled.write(fourArmySpectatorFixture());
  cancelled.cancel();
  resolve({ ok: true, value: { text: 'late', save: fourArmySpectatorFixture(), checkpoints: [] } });
  await pending;
  expect(values.has(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(false);
  expect(codec.cancel).toHaveBeenCalled();
});
