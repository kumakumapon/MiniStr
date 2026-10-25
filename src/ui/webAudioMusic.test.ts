import { describe, expect, it, vi } from 'vitest';
import { BackgroundMusicPlayer, DECISION_TIMEOUT_MS, defaultMusicSettings, type LoopingAudio, type MusicSettings } from './music';
import { positionAfter, PREFETCH_RETRY_MS, wantedTrack, wrapPosition, type MusicAudioContext, type MusicBuffer, type MusicBufferSource, type MusicFetch } from './webAudioMusic';

interface FakeBuffer extends MusicBuffer {
  url?: string;
}

class FakeSource implements MusicBufferSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  starts: { when: number | undefined; offset: number | undefined }[] = [];
  stops = 0;
  constructor(private readonly ctx: FakeContext) {}
  connect(): void {}
  disconnect(): void {}
  start(when?: number, offset?: number): void {
    this.starts.push({ when, offset });
    this.ctx.running.add(this);
  }
  stop(): void {
    this.stops += 1;
    this.ctx.running.delete(this);
  }
  /** The natural end of a one-shot source. */
  end(): void {
    this.ctx.running.delete(this);
    this.onended?.();
  }
  get track(): string {
    return this.buffer?.url?.match(/assets\/([a-z-]+)-theme/)?.[1] ?? '';
  }
}

class FakeContext implements MusicAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = 'suspended';
  destination = {};
  duration = 24;
  readonly gainNode = { gain: { value: -1 }, connect: vi.fn() };
  readonly sources: FakeSource[] = [];
  readonly running = new Set<FakeSource>();
  readonly resume = vi.fn(async () => {
    this.state = 'running';
  });
  readonly close = vi.fn(async () => undefined);
  createGain() {
    return this.gainNode;
  }
  createBufferSource() {
    const source = new FakeSource(this);
    this.sources.push(source);
    return source;
  }
  createBuffer(): FakeBuffer {
    return { duration: 1 / 48000 };
  }
  async decodeAudioData(data: ArrayBuffer): Promise<FakeBuffer> {
    const url = new TextDecoder().decode(data);
    if (url.includes('broken')) throw new Error('decode failed');
    return { duration: url.includes('battle') ? 3.5 : this.duration, url };
  }
  /** Audible (non-priming) sources that started and have not stopped. */
  playing(): FakeSource[] {
    return [...this.running].filter((source) => source.buffer?.url);
  }
  audible(): FakeSource[] {
    return this.sources.filter((source) => source.buffer?.url);
  }
}

function setup(options: { settings?: MusicSettings; hold?: string[]; failing?: string[]; failOnce?: string[]; ctx?: FakeContext | null } = {}) {
  const ctx = options.ctx === null ? undefined : (options.ctx ?? new FakeContext());
  const held = new Map<string, () => void>();
  const requested: string[] = [];
  const fetchImpl: MusicFetch = vi.fn(async (url: string) => {
    requested.push(url);
    const once = options.failOnce?.find((part) => url.includes(part));
    if (once) {
      options.failOnce = options.failOnce?.filter((part) => part !== once);
      throw new Error('network');
    }
    if (options.hold?.some((part) => url.includes(part))) await new Promise<void>((resolve) => held.set(url, resolve));
    const bytes = new TextEncoder().encode(options.failing?.some((part) => url.includes(part)) ? `${url}#broken` : url);
    return { ok: true, arrayBuffer: async () => bytes.buffer as ArrayBuffer };
  });
  const audio = new FakeAudio();
  const createContext = vi.fn(() => ctx);
  const player = new BackgroundMusicPlayer(options.settings ?? defaultMusicSettings, audio, { createContext, fetchImpl });
  const release = async (part: string) => {
    const key = [...held.keys()].find((url) => url.includes(part));
    if (!key) throw new Error(`nothing held for ${part}`);
    held.get(key)?.();
    held.delete(key);
    await flush();
  };
  return { ctx, audio, player, createContext, fetchImpl, requested, release };
}

class FakeAudio implements LoopingAudio {
  src = '';
  loop = false;
  preload = '';
  volume = 1;
  muted = true;
  currentTime = 0;
  readyState = 1;
  ended = false;
  paused = true;
  addEventListener = vi.fn();
  load = vi.fn();
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe('music position helpers', () => {
  it('wraps playheads into the track length and rejects invalid input', () => {
    expect(wrapPosition(30, 24)).toBe(6);
    expect(wrapPosition(24, 24)).toBe(0);
    expect(wrapPosition(-1, 24)).toBe(23);
    expect(wrapPosition(Number.NaN, 24)).toBe(0);
    expect(wrapPosition(5, 0)).toBe(0);
    expect(positionAfter(20, 10, 24, true)).toBe(6);
    expect(positionAfter(1, 10, 3.5, false)).toBe(3.5);
    expect(positionAfter(1, -5, 24, true)).toBe(1);
  });

  it('picks the battle cue over any field choice and follows the army only when enabled', () => {
    const settings = { ...defaultMusicSettings, fieldTrack: 'dawn' as const, blueFieldTrack: 'mist' as const, armyTracks: true };
    expect(wantedTrack(settings, 'blue', true)).toBe('battle');
    expect(wantedTrack(settings, 'blue', false)).toBe('mist');
    expect(wantedTrack(settings, 'red', false)).toBe('dawn');
    expect(wantedTrack({ ...settings, armyTracks: false }, 'blue', false)).toBe('dawn');
  });
});

describe('BackgroundMusicPlayer on Web Audio', () => {
  it('creates and resumes the context inside the gesture, then loops one source without touching the element', async () => {
    const { ctx, audio, player, createContext } = setup();
    const unlocking = player.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(ctx?.resume).toHaveBeenCalledTimes(1);
    // The iOS permission is granted by a silent source started in the same gesture.
    expect(ctx?.sources).toHaveLength(1);
    expect(ctx?.sources[0]?.starts).toHaveLength(1);
    await unlocking;
    const sources = ctx!.playing();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.loop).toBe(true);
    expect(sources[0]?.starts).toEqual([{ when: 0, offset: 0 }]);
    expect(ctx?.gainNode.gain.value).toBe(defaultMusicSettings.volume);
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.load).not.toHaveBeenCalled();
  });

  it('stays silent and fetches nothing before the first gesture, then applies only the latest request once', async () => {
    const { ctx, player, createContext, requested } = setup();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    player.setArmy('blue');
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'drive', armyTracks: false });
    await flush();
    expect(createContext).not.toHaveBeenCalled();
    expect(requested).toHaveLength(0);
    await player.unlock();
    expect(ctx!.audible()).toHaveLength(1);
    expect(ctx!.playing()[0]?.track).toBe('drive');
    // The decoded track is reused: it is requested exactly once.
    expect(requested.filter((url) => url.includes('drive-theme'))).toHaveLength(1);
  });

  it('keeps battle and field music from ever sounding together and resumes the field position', async () => {
    const { ctx, player } = setup();
    await player.unlock();
    ctx!.currentTime = 10;
    player.setBattle(true, true);
    await flush();
    expect(ctx!.playing().map((source) => source.track)).toEqual(['battle']);
    expect(ctx!.playing()[0]?.loop).toBe(false);
    ctx!.currentTime = 11;
    player.setBattle(false);
    expect(ctx!.playing().map((source) => source.track)).toEqual(['frontier']);
    expect(ctx!.playing()[0]?.starts).toEqual([{ when: 0, offset: 10 }]);
  });

  it('never has more than one audible source across arbitrary switches', async () => {
    const { ctx, player } = setup();
    await player.unlock();
    let peak = 0;
    const observe = () => (peak = Math.max(peak, ctx!.playing().length));
    for (const step of [
      () => player.setBattle(true, true),
      () => player.setSettings({ ...defaultMusicSettings, fieldTrack: 'mist' }),
      () => player.setArmy('blue'),
      () => player.setBattle(true, true),
      () => player.setBattle(false),
      () => player.setSettings({ ...defaultMusicSettings, muted: true }),
      () => player.setSettings({ ...defaultMusicSettings, muted: false, fieldTrack: 'dawn' }),
    ]) {
      step();
      observe();
      await flush();
      observe();
    }
    expect(peak).toBe(1);
  });

  it('discards obsolete decode results when the selection changes mid-decode', async () => {
    const { ctx, player, release } = setup({ hold: ['dawn-theme', 'drive-theme'] });
    await player.unlock();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'drive' });
    await flush();
    expect(ctx!.playing()).toHaveLength(0);
    await release('dawn-theme');
    expect(ctx!.playing()).toHaveLength(0);
    expect((player as unknown as { backend: { cachedTracks(): string[] } }).backend.cachedTracks()).not.toContain('dawn');
    expect(ctx!.audible().some((source) => source.track === 'dawn')).toBe(false);
    await release('drive-theme');
    expect(ctx!.playing().map((source) => source.track)).toEqual(['drive']);
  });

  it('restarts a consecutive battle from the start without leaving the first one running', async () => {
    const { ctx, player } = setup();
    await player.unlock();
    player.setBattle(true, true);
    await flush();
    const first = ctx!.playing()[0]!;
    const staleEnd = first.onended;
    ctx!.currentTime = 2;
    player.setBattle(true, true);
    await flush();
    expect(first.stops).toBe(1);
    const second = ctx!.playing();
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first);
    expect(second[0]?.starts).toEqual([{ when: 0, offset: 0 }]);
    // The retired source's end event must neither stop nor mark the new cue as played.
    staleEnd?.();
    player.setSettings({ ...defaultMusicSettings, volume: 0.5 });
    expect(ctx!.playing()).toEqual(second);
    expect(second[0]?.stops).toBe(0);
    // ...and it is still the current source, so leaving the battle stops it.
    player.setBattle(false);
    expect(second[0]?.stops).toBe(1);
    expect(ctx!.playing().map((source) => source.track)).toEqual(['frontier']);
  });

  it('does not replay a finished battle cue on readiness, volume or gesture changes', async () => {
    const { ctx, player } = setup();
    await player.unlock();
    player.setBattle(true, true);
    await flush();
    ctx!.playing()[0]?.end();
    const count = ctx!.audible().length;
    player.setSettings({ ...defaultMusicSettings, volume: 0.4 });
    await player.unlock();
    player.setBattle(true);
    await flush();
    expect(ctx!.audible()).toHaveLength(count);
    expect(ctx!.playing()).toHaveLength(0);
    player.setBattle(true, true);
    await flush();
    expect(ctx!.audible()).toHaveLength(count + 1);
    player.setBattle(false);
    expect(ctx!.playing().map((source) => source.track)).toEqual(['frontier']);
  });

  it('keeps the playhead while muted or at zero volume and wraps long absences', async () => {
    const { ctx, player } = setup();
    await player.unlock();
    ctx!.currentTime = 5;
    player.setSettings({ ...defaultMusicSettings, muted: true });
    expect(ctx!.playing()).toHaveLength(0);
    ctx!.currentTime = 500;
    player.setSettings(defaultMusicSettings);
    expect(ctx!.playing()[0]?.starts).toEqual([{ when: 0, offset: 5 }]);
    ctx!.currentTime = 500 + 30;
    player.setSettings({ ...defaultMusicSettings, volume: 0 });
    expect(ctx!.playing()).toHaveLength(0);
    expect(ctx!.gainNode.gain.value).toBe(0);
    player.setSettings({ ...defaultMusicSettings, volume: 0.8 });
    // 5 + 30 s on a 24 s loop resumes at 11 s.
    expect(ctx!.playing()[0]?.starts).toEqual([{ when: 0, offset: 11 }]);
    expect(ctx!.gainNode.gain.value).toBe(0.8);
  });

  it('prefers the saved position of a track over time spent on another one', async () => {
    const { ctx, player } = setup();
    await player.unlock();
    ctx!.currentTime = 7;
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    await flush();
    ctx!.currentTime = 9;
    // Switching away again before the new track is audible must not corrupt the saved offsets.
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'march' });
    await flush();
    expect(ctx!.playing()[0]?.starts).toEqual([{ when: 0, offset: 7 }]);
  });

  it('retries a track that failed to load on the next request instead of staying silent', async () => {
    const { ctx, player } = setup({ failOnce: ['dawn-theme'] });
    await player.unlock();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    await flush();
    expect(ctx!.playing()).toHaveLength(0);
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn', volume: 0.5 });
    await flush();
    expect(ctx!.playing().map((source) => source.track)).toEqual(['dawn']);
  });

  it('retries a rejected resume() on the next gesture', async () => {
    const ctx = new FakeContext();
    // The decision's resume() and the first unlock's retry are both refused.
    ctx.resume.mockRejectedValueOnce(new Error('NotAllowedError')).mockRejectedValueOnce(new Error('NotAllowedError'));
    const { player } = setup({ ctx });
    await expect(player.unlock()).resolves.toBeUndefined();
    expect(ctx.state).toBe('suspended');
    await player.unlock();
    expect(ctx.resume.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(ctx.state).toBe('running');
    expect(ctx.playing()).toHaveLength(1);
  });

  it('keeps at most the current, army and battle buffers and drops the rest', async () => {
    const { ctx, player } = setup({ settings: { ...defaultMusicSettings, fieldTrack: 'march', blueFieldTrack: 'rock-blue', armyTracks: true } });
    await player.unlock();
    await flush();
    // Switch through several field tracks, then back to a pair.
    for (const fieldTrack of ['dawn', 'drive', 'wasteland'] as const) {
      player.setSettings({ ...defaultMusicSettings, fieldTrack, blueFieldTrack: 'mist', armyTracks: true });
      await flush();
    }
    const backend = (player as unknown as { backend: { cachedTracks(): string[] } }).backend;
    const cached = backend.cachedTracks().sort();
    expect(cached).toEqual(['battle', 'mist', 'wasteland']);
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'wasteland', armyTracks: false });
    expect(backend.cachedTracks().sort()).toEqual(['battle', 'wasteland']);
    expect(ctx!.playing().map((source) => source.track)).toEqual(['wasteland']);
  });

  it('prefetches the current, then the other army, then the battle track', async () => {
    const { player, requested } = setup({ settings: { ...defaultMusicSettings, fieldTrack: 'march', blueFieldTrack: 'rock-blue', armyTracks: true } });
    await player.unlock();
    await flush();
    expect(requested.map((url) => url.match(/assets\/([a-z-]+)-theme/)?.[1])).toEqual(['frontier', 'rock-blue', 'battle']);
    const single = setup({ settings: { ...defaultMusicSettings, armyTracks: false } });
    await single.player.unlock();
    await flush();
    expect(single.requested.map((url) => url.match(/assets\/([a-z-]+)-theme/)?.[1])).toEqual(['frontier', 'battle']);
  });
});

describe('BackgroundMusicPlayer fallback to the element', () => {
  it('uses the element without a context and never creates a second one', async () => {
    const { audio, player, createContext } = setup({ ctx: null });
    await player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
    await player.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('falls back for the session when the first track cannot be decoded, and applies the latest request', async () => {
    const { ctx, audio, player, createContext, requested } = setup({ failing: ['frontier-theme'] });
    const unlocking = player.unlock();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    await unlocking;
    expect(ctx!.close).toHaveBeenCalled();
    expect(audio.src).toContain('dawn-theme.ogg');
    expect(audio.play).toHaveBeenCalledTimes(1);
    // Sticky: later requests stay on the element and the context is never retried.
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'drive' });
    player.setBattle(true, true);
    await player.unlock();
    expect(audio.src).toContain('battle-theme.ogg');
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(requested).toHaveLength(1);
    expect(ctx!.playing()).toHaveLength(0);
  });

  it('falls back when the track request fails with an HTTP error', async () => {
    const audio = new FakeAudio();
    const fetchImpl: MusicFetch = vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }));
    const failing = new BackgroundMusicPlayer(defaultMusicSettings, audio, { createContext: () => new FakeContext(), fetchImpl });
    await failing.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('retries a refused element play() on the next gesture after a late fallback', async () => {
    const { audio, player } = setup({ failing: ['frontier-theme'] });
    audio.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    await player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(true);
    await player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.paused).toBe(false);
  });

  it('falls back to the element when loading the first track times out', async () => {
    vi.useFakeTimers();
    try {
      const { audio, player, ctx, release } = setup({ hold: ['frontier-theme'] });
      const unlocking = player.unlock();
      await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS + 1);
      await unlocking;
      expect(audio.play).toHaveBeenCalledTimes(1);
      expect(ctx!.close).toHaveBeenCalled();
      // The late response is ignored: still on the element.
      await release('frontier-theme');
      expect(ctx!.playing()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies a battle requested while the backend is being chosen, then falls back with it', async () => {
    const { audio, player } = setup({ failing: ['frontier-theme'] });
    const unlocking = player.unlock();
    player.setBattle(true, true);
    await unlocking;
    expect(audio.src).toContain('battle-theme.ogg');
    expect(audio.loop).toBe(false);
  });

  it('replays army and battle changes made before the first gesture onto the element', async () => {
    const { audio, player } = setup({ ctx: null });
    player.setArmy('blue');
    player.setBattle(true, true);
    expect(audio.play).not.toHaveBeenCalled();
    await player.unlock();
    expect(audio.src).toContain('battle-theme.ogg');
    expect(audio.play).toHaveBeenCalledTimes(1);
    player.setBattle(false);
    expect(audio.src).toContain('rock-blue-theme.ogg');
  });

  it('shares one decision between concurrent unlocks', async () => {
    const { ctx, player, createContext, requested, release } = setup({ hold: ['frontier-theme'] });
    const unlocks = Promise.all([player.unlock(), player.unlock()]);
    expect(createContext).toHaveBeenCalledTimes(1);
    await flush();
    expect(ctx!.playing()).toHaveLength(0);
    await release('frontier-theme');
    await unlocks;
    expect(ctx!.playing()).toHaveLength(1);
    expect(requested.filter((url) => url.includes('frontier-theme'))).toHaveLength(1);
  });

  it('throttles re-fetching missing tracks on repeated gestures', async () => {
    vi.useFakeTimers();
    try {
      const { player, requested } = setup({ settings: { ...defaultMusicSettings, armyTracks: false }, failing: ['battle-theme'] });
      await player.unlock();
      await flush();
      const attempts = () => requested.filter((url) => url.includes('battle-theme')).length;
      expect(attempts()).toBe(1);
      for (let i = 0; i < 5; i += 1) await player.unlock();
      await flush();
      expect(attempts()).toBe(1);
      await vi.advanceTimersByTimeAsync(PREFETCH_RETRY_MS + 1);
      await player.unlock();
      await flush();
      expect(attempts()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
