import { expect, it, vi } from 'vitest';
import { FourArmyCpuPlanner } from './fourArmyCpuPlanner';
import { FourArmyCpuSession } from './fourArmyCpuSession';
import { handleFourArmyCpuRequest, type FourArmyCpuRequest } from '../ai/fourArmyCpuProtocol';
import { defaultFourArmyCpuSettings } from '../ai/fourArmyCpu';
import { fourCpuMap } from '../ai/fourArmyCpu.fixture';
import { createFourArmyState, applyFourArmyCommand, type FourArmyState } from '../game/fourArmyEngine';
import { serializeFourArmyArchive, parseFourArmyArchive } from '../game/fourArmyArchive';

const initial = () => {
  const r = createFourArmyState(fourCpuMap());
  if (!r.ok) throw Error(r.error);
  return r.value;
};
const options = { difficulty: 'normal', policy: 'balanced' } as const;
function fakeWorker() {
  return { terminate: vi.fn(), postMessage: vi.fn(), onmessage: null as Worker['onmessage'], onerror: null as Worker['onerror'] };
}
function respond(w: ReturnType<typeof fakeWorker>, request?: FourArmyCpuRequest) {
  const r = request ?? (w.postMessage.mock.calls.at(-1)![0] as FourArmyCpuRequest);
  w.onmessage!.call(w as unknown as Worker, { data: handleFourArmyCpuRequest(r) } as MessageEvent);
}

it('posts only the acting army observation and options, and reuses a healthy Worker', async () => {
  const w = fakeWorker(),
    factory = vi.fn(() => w as unknown as Worker),
    planner = new FourArmyCpuPlanner(factory),
    s = initial();
  const p = planner.plan(s, options);
  const sent = w.postMessage.mock.calls[0]![0] as FourArmyCpuRequest;
  expect(sent).not.toHaveProperty('state');
  expect(sent.observation).not.toHaveProperty('players');
  expect(sent.observation).not.toHaveProperty('rngSeed');
  expect(sent.observation.units.every((u) => u.owner === 'army1')).toBe(true);
  respond(w);
  expect(await p).toMatchObject({ actor: 'army1' });
  const second = planner.plan(s, options);
  expect(w.postMessage.mock.calls[1]![0].id).toBeGreaterThan(sent.id);
  respond(w);
  await second;
  expect(factory).toHaveBeenCalledOnce();
  expect(w.onmessage).toBeNull();
  expect(w.onerror).toBeNull();
  planner.cancel();
  expect(w.terminate).toHaveBeenCalledOnce();
});
it('settles cancellation and ignores captured late message/error handlers even if a factory reuses the object', async () => {
  const w = fakeWorker(),
    planner = new FourArmyCpuPlanner(() => w as unknown as Worker),
    s = initial();
  const old = planner.plan(s, options),
    late = w.onmessage!,
    lateError = w.onerror!,
    request = w.postMessage.mock.calls[0]![0] as FourArmyCpuRequest;
  planner.cancel();
  expect(await old).toBeUndefined();
  expect(w.terminate).toHaveBeenCalledOnce();
  const fresh = planner.plan(s, options);
  late.call(w as unknown as Worker, { data: handleFourArmyCpuRequest(request) } as MessageEvent);
  lateError.call(w as unknown as Worker, {} as ErrorEvent);
  expect(w.onmessage).not.toBeNull();
  respond(w);
  expect(await fresh).toMatchObject({ actor: 'army1' });
  planner.cancel();
});
it('replaces an in-flight plan and ignores an older queued response on a reused healthy Worker', async () => {
  const a = fakeWorker(),
    b = fakeWorker(),
    factory = vi.fn().mockReturnValueOnce(a).mockReturnValue(b),
    planner = new FourArmyCpuPlanner(factory),
    s = initial();
  const first = planner.plan(s, options),
    old = a.postMessage.mock.calls[0]![0];
  const second = planner.plan(s, options);
  expect(await first).toBeUndefined();
  expect(a.terminate).toHaveBeenCalledOnce();
  respond(b);
  await second;
  const third = planner.plan(s, options);
  b.onmessage!.call(b as unknown as Worker, { data: handleFourArmyCpuRequest(old) } as MessageEvent);
  expect(b.onmessage).not.toBeNull();
  respond(b);
  await third;
  planner.cancel();
});
it.each(['wrong-actor', 'wrong-round', 'extra', 'illegal', 'garbage', 'worker-error'] as const)('rejects %s replies without retaining a failed Worker', async (kind) => {
  const w = fakeWorker(),
    planner = new FourArmyCpuPlanner(() => w as unknown as Worker);
  const p = planner.plan(initial(), options),
    rejected = expect(p).rejects.toThrow();
  const r = w.postMessage.mock.calls[0]![0] as FourArmyCpuRequest;
  const response: any = handleFourArmyCpuRequest(r);
  if (kind === 'wrong-actor') response.turn.actor = 'army2';
  if (kind === 'wrong-round') response.turn.round++;
  if (kind === 'extra') response.extra = 1;
  if (kind === 'illegal') response.command = { actor: 'army1', type: 'attack', unitId: 'u1', targetId: 'u1' };
  if (kind === 'worker-error') {
    w.onerror!.call(w as unknown as Worker, {} as ErrorEvent);
  } else w.onmessage!.call(w as unknown as Worker, { data: kind === 'garbage' ? null : response } as MessageEvent);
  await rejected;
  expect(w.onmessage).toBeNull();
  expect(w.onerror).toBeNull();
  expect(w.terminate).toHaveBeenCalledOnce();
});
it('cleans up clone/post failures and supports a cancellable no-Worker fallback', async () => {
  const w = fakeWorker();
  w.postMessage.mockImplementation(() => {
    throw Error('clone');
  });
  const planner = new FourArmyCpuPlanner(() => w as unknown as Worker);
  await expect(planner.plan(initial(), options)).rejects.toThrow('request failed');
  expect(w.terminate).toHaveBeenCalledOnce();
  const fallback = new FourArmyCpuPlanner(() => {
    throw Error('unsupported');
  });
  const cancelled = fallback.plan(initial(), options);
  fallback.cancel();
  expect(await cancelled).toBeUndefined();
  expect(await fallback.plan(initial(), options)).toMatchObject({ actor: 'army1' });
  fallback.cancel();
});
it('does not create workers for paused/terminal/invalid plans', async () => {
  const factory = vi.fn(() => fakeWorker() as unknown as Worker),
    planner = new FourArmyCpuPlanner(factory);
  await expect(planner.plan({} as FourArmyState, options)).rejects.toThrow('Invalid');
  await expect(planner.plan(initial(), {} as typeof options)).rejects.toThrow('Invalid');
  const s = initial();
  s.round.round = 101;
  s.round.phase = 'pending';
  s.paused = true;
  expect(await planner.plan(s, options)).toBeUndefined();
  expect(factory).not.toHaveBeenCalled();
});

it('pauses between response delivery and commit without advancing state or history', async () => {
  const w = fakeWorker(),
    session = new FourArmyCpuSession(initial(), () => w as unknown as Worker),
    before = session.state;
  expect(await session.step()).toBeUndefined();
  session.resume();
  const p = session.step();
  respond(w);
  session.pause();
  expect(await p).toBeUndefined();
  expect(session.state).toEqual(before);
  expect(session.commands).toEqual([]);
  expect(w.terminate).toHaveBeenCalledOnce();
  session.resume();
  const next = session.step();
  respond(w);
  expect(await next).toMatchObject({ actor: 'army1' });
  expect(session.commands).toHaveLength(1);
  const copy = session.state;
  copy.units[0]!.hp = 1;
  expect(session.state.units[0]!.hp).toBe(100);
  session.stop();
  expect(() => session.resume()).toThrow('stopped');
  expect(await session.step()).toBeUndefined();
});
it('cancels old work on same-turn match replacement and on settings changes', async () => {
  const w = fakeWorker(),
    session = new FourArmyCpuSession(initial(), () => w as unknown as Worker);
  session.resume();
  let p = session.step();
  const old = w.onmessage!,
    r = w.postMessage.mock.calls[0]![0];
  const replacement = initial();
  replacement.rngSeed = 99;
  session.replaceState(replacement);
  old.call(w as unknown as Worker, { data: handleFourArmyCpuRequest(r) } as MessageEvent);
  expect(await p).toBeUndefined();
  expect(session.state.rngSeed).toBe(99);
  expect(session.paused).toBe(true);
  expect(session.commands).toEqual([]);
  session.resume();
  p = session.step();
  const settings = defaultFourArmyCpuSettings();
  settings.army1 = { difficulty: 'hard', policy: 'defensive' };
  session.configure(settings);
  expect(await p).toBeUndefined();
  p = session.step();
  expect(w.postMessage.mock.calls.at(-1)![0].options).toEqual(settings.army1);
  respond(w);
  await p;
  session.stop();
});
it('keeps only the latest concurrent step and pauses on transport errors', async () => {
  const w = fakeWorker(),
    session = new FourArmyCpuSession(initial(), () => w as unknown as Worker);
  session.resume();
  const old = session.step(),
    fresh = session.step();
  expect(await old).toBeUndefined();
  respond(w);
  await fresh;
  expect(session.commands).toHaveLength(1);
  const before = session.state;
  const p = session.step(),
    rejected = expect(p).rejects.toThrow('worker failed');
  w.onerror!.call(w as unknown as Worker, {} as ErrorEvent);
  await rejected;
  expect(session.paused).toBe(true);
  expect(session.state).toEqual(before);
  expect(session.commands).toHaveLength(1);
  session.stop();
});
it('uses per-army settings, records legal commands and restores an autonomous match from JSON', async () => {
  const map = fourCpuMap(),
    r = createFourArmyState(map);
  if (!r.ok) throw Error(r.error);
  const settings = defaultFourArmyCpuSettings();
  settings.army2 = { difficulty: 'easy', policy: 'offensive' };
  settings.army3 = { difficulty: 'hard', policy: 'defensive' };
  const w = fakeWorker(),
    session = new FourArmyCpuSession(r.value, () => w as unknown as Worker, settings);
  session.resume();
  const actors = new Set();
  for (let i = 0; i < 40 && session.state.outcome.type === 'ongoing'; i++) {
    const p = session.step();
    const sent = w.postMessage.mock.calls.at(-1)![0] as FourArmyCpuRequest;
    actors.add(sent.turn.actor);
    expect(sent.options).toEqual(settings[sent.turn.actor]);
    respond(w);
    await p;
  }
  expect(actors.size).toBe(4);
  const text = serializeFourArmyArchive(map, session.commands, session.state);
  expect(text.ok).toBe(true);
  if (text.ok) expect(parseFourArmyArchive(text.value).ok).toBe(true);
  session.stop();
});
it('falls back to a legal pass when a hidden occupant blocks observed production, without probing hidden data', async () => {
  const map = fourCpuMap();
  map.board.terrain[0]![4] = { kind: 'factory', owner: 'army1' };
  map.players.army1.gold = 50000;
  map.units[1]!.position = { x: 4, y: 0 };
  const r = createFourArmyState(map);
  if (!r.ok) throw Error(r.error);
  const s = r.value;
  s.units[0]!.hasActed = true;
  const w = fakeWorker(),
    session = new FourArmyCpuSession(s, () => w as unknown as Worker);
  session.resume();
  const p = session.step();
  const sent = w.postMessage.mock.calls[0]![0];
  expect(sent.observation.units.some((u: any) => u.owner === 'army2')).toBe(false);
  respond(w);
  expect(await p).toEqual({ actor: 'army1', type: 'endTurn' });
  expect(session.commands).toEqual([{ actor: 'army1', type: 'endTurn' }]);
  session.stop();
});
it('requires explicit resume at the 100-round engine pause and rejects invalid replacements/settings', async () => {
  const state = initial();
  state.round = { ...state.round, round: 100, index: 3, startedArmies: ['army1', 'army2', 'army3', 'army4'] };
  state.units.forEach((u) => {
    u.hasMoved = true;
    u.hasActed = true;
  });
  const ended = applyFourArmyCommand(state, { actor: 'army4', type: 'endTurn' });
  if (!ended.ok) throw Error(ended.error);
  const session = new FourArmyCpuSession(ended.value, () => {
    throw Error('fallback');
  });
  expect(await session.step()).toBeUndefined();
  const before = session.state.players.army1.gold;
  session.resume();
  expect(session.commands).toEqual([{ actor: 'army1', type: 'resume' }]);
  expect(session.state.players.army1.gold).toBe(before + 1000);
  session.resume();
  expect(session.commands).toHaveLength(1);
  expect(() => session.replaceState({} as FourArmyState)).toThrow('Invalid');
  expect(() => session.configure({} as any)).toThrow('Invalid');
  session.stop();
  expect(() => session.replaceState(initial())).toThrow('Invalid');
  expect(() => session.configure(defaultFourArmyCpuSettings())).toThrow('Invalid');
  expect(() => new FourArmyCpuSession({} as FourArmyState, () => fakeWorker() as unknown as Worker)).toThrow('Invalid');
});
