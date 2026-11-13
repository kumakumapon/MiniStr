import { describe, it, expect, vi } from 'vitest';
import { fourArmySpectatorFixture } from '../game/fourArmySpectator.fixture';
import { FourArmyFileCodec } from './fourArmyFileCodec';
import { handleFourArmyFileRequest } from '../game/fourArmySpectatorProtocol';
import { FourArmyReplay } from './fourArmyReplay';
import { fourArmyDisplay } from './fourArmyBoard';
import { applyFourArmyCommand, createFourArmyState } from '../game/fourArmyEngine';
import type { GameResult } from '../game/types';
const value = <T>(r: GameResult<T>): T => {
  if (!r.ok) throw Error(r.error);
  return r.value;
};
class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn((data: unknown) => {
    void data;
  });
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}
describe('four-army UI boundaries', () => {
  it('uses only visible contacts and the selected army funds in restricted views', () => {
    const s = fourArmySpectatorFixture().archive.payload.state;
    expect(fourArmyDisplay(s, 'all').units).toHaveLength(32);
    const o = fourArmyDisplay(s, 'army1');
    expect(Object.keys(o.players)).toEqual(['army1']);
    expect(o.units.every((u) => u.owner === 'army1')).toBe(true);
    s.units.find((u) => u.owner === 'army2')!.position = { x: 7, y: 5 };
    const seen = fourArmyDisplay(s, 'army1');
    expect(seen.units.some((u) => u.owner === 'army2')).toBe(true);
    expect(seen.players.army2).toBeUndefined();
  });
  it('settles cancelled file operations and discards replies from earlier Workers', async () => {
    const w = new FakeWorker(),
      codec = new FourArmyFileCodec(() => w as unknown as Worker);
    const p = codec.run(fourArmySpectatorFixture()),
      old = w.onmessage!;
    codec.cancel();
    expect(await p).toBeUndefined();
    expect(w.terminate).toHaveBeenCalledOnce();
    old({ data: { id: 1, result: { ok: true, value: '{}' } } } as MessageEvent);
    expect(w.onmessage).toBeNull();
  });
  it('accepts only a validated file response for the current request and cleans up its Worker', async () => {
    const w = new FakeWorker(),
      codec = new FourArmyFileCodec(() => w as unknown as Worker),
      save = fourArmySpectatorFixture(),
      p = codec.run(save);
    w.reply(handleFourArmyFileRequest(w.postMessage.mock.calls[0]![0]));
    const r = await p;
    expect(r?.ok).toBe(true);
    if (r?.ok) expect(r.value.save).toEqual(save);
    expect(w.terminate).toHaveBeenCalledOnce();
  });
  it.each([null, { id: 99, result: { ok: true, value: '{}' } }, { id: 1, result: { ok: true, value: '{}' } }, { id: 1, result: { ok: false, error: 'invalid' } }])(
    'rejects malformed file replies safely',
    async (reply) => {
      const w = new FakeWorker(),
        codec = new FourArmyFileCodec(() => w as unknown as Worker),
        p = codec.run('{}');
      w.reply(reply);
      expect((await p)?.ok).toBe(false);
      expect(w.terminate).toHaveBeenCalledOnce();
    },
  );
  it('falls back when Worker construction is unavailable and cancels before fallback execution', async () => {
    const codec = new FourArmyFileCodec(() => {
      throw Error('unavailable');
    });
    const ok = await codec.run(fourArmySpectatorFixture());
    expect(ok?.ok).toBe(true);
    const cancelled = codec.run(fourArmySpectatorFixture());
    codec.cancel();
    expect(await cancelled).toBeUndefined();
  });
  it('handles Worker and postMessage failures without leaving a pending promise', async () => {
    const w = new FakeWorker(),
      codec = new FourArmyFileCodec(() => w as unknown as Worker),
      p = codec.run('{}');
    w.onerror?.();
    expect((await p)?.ok).toBe(false);
    w.postMessage.mockImplementation(() => {
      throw Error('clone');
    });
    expect((await codec.run('{}'))?.ok).toBe(false);
  });
  it('seeks verified command history deterministically and keeps the original commands unchanged', async () => {
    const s = fourArmySpectatorFixture(24),
      r = new FourArmyReplay(s.archive.payload.map, s.archive.payload.commands);
    const at = await r.seek(17);
    let expected = value(createFourArmyState(s.archive.payload.map));
    for (const c of s.archive.payload.commands.slice(0, 17)) expected = value(applyFourArmyCommand(expected, c));
    expect(at).toEqual(expected);
    expect(r.position).toBe(17);
    expect(await r.seek(24)).toEqual(s.archive.payload.state);
    expect((await r.seek(0))?.round.round).toBe(1);
    expect(s.archive.payload.commands).toHaveLength(24);
    await expect(r.seek(-1)).rejects.toThrow('Invalid');
  });
  it('cancels long seeks before committing a different replay position', async () => {
    const s = fourArmySpectatorFixture(80),
      r = new FourArmyReplay(s.archive.payload.map, s.archive.payload.commands),
      initial = r.state;
    const pending = r.seek(80);
    r.cancel();
    expect(await pending).toBeUndefined();
    expect(r.position).toBe(0);
    expect(r.state).toEqual(initial);
  });
});
