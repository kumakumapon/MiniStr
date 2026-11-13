import { describe, it, expect, vi } from 'vitest';
import { fourArmySpectatorFixture } from '../game/fourArmySpectator.fixture';
import { encodeFourArmySpectatorSave, verifyFourArmySpectatorSave } from '../game/fourArmySpectatorSave';
import { FourArmyReplay } from './fourArmyReplay';
import { FourArmyFileCodec } from './fourArmyFileCodec';
const cached = { ...fourArmySpectatorFixture(2050), schemaVersion: 2 as const };
describe('bounded long replay navigation', () => {
  it('uses verified checkpoints for distant seeks and bounds its dynamic cache across repeated navigation', async () => {
    const save = { ...structuredClone(cached), schemaVersion: 2 as const },
      raw = encodeFourArmySpectatorSave(save);
    if (!raw.ok) throw Error(raw.error);
    const g = verifyFourArmySpectatorSave(raw.value);
    let next = g.next();
    while (!next.done) next = g.next();
    if (!next.value.ok) throw Error(next.value.error);
    const verified = next.value.value,
      r = new FourArmyReplay(save.archive.payload.map, save.archive.payload.commands, verified.checkpoints);
    expect(await r.seek(2050)).toEqual(save.archive.payload.state);
    for (const pos of [1023, 2050, 1023, 2050]) await r.seek(pos);
    expect(r.cachedStates).toBeLessThanOrEqual(FourArmyReplay.CACHE_LIMIT + 1 + verified.checkpoints.length);
    const before = r.state,
      at = r.position,
      pending = r.seek(1900);
    r.cancel();
    expect(await pending).toBeUndefined();
    expect(r.position).toBe(at);
    expect(r.state).toEqual(before);
  }, 10000);
  it('keeps progress notifications from completing a file request, then settles cancellation', async () => {
    const w = { onmessage: null as ((e: MessageEvent) => void) | null, onerror: null, terminate: vi.fn(), postMessage: vi.fn() },
      codec = new FourArmyFileCodec(() => w as unknown as Worker),
      progress = vi.fn();
    const p = codec.run('{}', progress);
    w.onmessage?.({ data: { id: 1, kind: 'progress', done: 2048, total: 4096 } } as MessageEvent);
    expect(progress).toHaveBeenCalledWith(2048, 4096);
    codec.cancel();
    expect(await p).toBeUndefined();
    expect(w.terminate).toHaveBeenCalledOnce();
  });
  it('rejects invalid or regressing progress and forged checkpoint DTOs', async () => {
    for (const reply of [
      { id: 1, kind: 'progress', done: -1, total: 4096 },
      { id: 1, kind: 'progress', done: 2048, total: 1 },
      { id: 1, kind: 'progress', done: 0, total: 65537 },
      {
        id: 1,
        result: { ok: true, value: { text: '{}', save: fourArmySpectatorFixture(), checkpoints: [{ position: 9, state: fourArmySpectatorFixture().archive.payload.state }] } },
      },
    ]) {
      const w = { onmessage: null as ((e: MessageEvent) => void) | null, onerror: null, terminate: vi.fn(), postMessage: vi.fn() },
        codec = new FourArmyFileCodec(() => w as unknown as Worker),
        p = codec.run('{}');
      w.onmessage?.({ data: reply } as MessageEvent);
      expect((await p)?.ok).toBe(false);
    }
  });
});
