import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSoundSettings, loadSoundSettings, ProceduralSoundPlayer, saveSoundSettings, SOUND_SETTINGS_KEY } from './sound';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

describe('sound settings', () => {
  it('uses safe defaults for missing or malformed values', () => {
    expect(loadSoundSettings(storage())).toEqual(defaultSoundSettings);
    expect(loadSoundSettings(storage({ [SOUND_SETTINGS_KEY]: '{oops' }))).toEqual(defaultSoundSettings);
    expect(loadSoundSettings(storage({ [SOUND_SETTINGS_KEY]: '{"muted":false,"volume":2}' }))).toEqual(defaultSoundSettings);
  });

  it('persists valid settings without touching game saves', () => {
    const target = storage();
    expect(saveSoundSettings(target, { muted: true, volume: 0.2 })).toBe(true);
    expect(loadSoundSettings(target)).toEqual({ muted: true, volume: 0.2 });
  });

  it('rejects invalid settings and reports storage failures instead of throwing', () => {
    const target = storage();
    expect(saveSoundSettings(target, { muted: false, volume: -1 })).toBe(false);
    expect(target.values.size).toBe(0);
    const full = {
      ...storage(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(saveSoundSettings(full, { muted: false, volume: 0.5 })).toBe(false);
  });
});

class FakeParam {
  value = 1;
  readonly calls: [string, number, number][] = [];
  setValueAtTime(value: number, time: number) {
    this.calls.push(['set', value, time]);
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push(['ramp', value, time]);
  }
}

class FakeNode {
  connectedTo: unknown;
  disconnected = false;
  connect<T>(target: T): T {
    this.connectedTo = target;
    return target;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeOscillator extends FakeNode {
  type = '';
  readonly frequency = new FakeParam();
  started?: number;
  stopped?: number;
  stopCalls = 0;
  private ended?: () => void;
  start(time: number) {
    this.started = time;
  }
  stop(time?: number) {
    this.stopCalls += 1;
    this.stopped = time;
  }
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions) {
    if (type === 'ended' && options?.once) this.ended = listener;
  }
  end() {
    this.ended?.();
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeBufferSource extends FakeOscillator {
  buffer: unknown;
}

class FakeFilter extends FakeNode {
  type = '';
  readonly frequency = new FakeParam();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 2;
  sampleRate = 1000;
  readonly destination = {};
  readonly oscillators: FakeOscillator[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly buffers: Float32Array[] = [];
  static resumeFails = false;
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  async resume() {
    if (FakeAudioContext.resumeFails) throw new Error('blocked by autoplay policy');
    this.state = 'running';
  }
  createOscillator() {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }
  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createBuffer(_channels: number, length: number) {
    const samples = new Float32Array(length);
    this.buffers.push(samples);
    return { getChannelData: () => samples };
  }
  createBufferSource() {
    const node = new FakeBufferSource();
    this.sources.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }
}

function fakePlayer(settings = { muted: false, volume: 0.45 }) {
  FakeAudioContext.instances = [];
  FakeAudioContext.resumeFails = false;
  const player = new ProceduralSoundPlayer(settings, FakeAudioContext as unknown as new () => AudioContext);
  return { player, context: () => FakeAudioContext.instances[0] };
}

describe('ProceduralSoundPlayer', () => {
  it.each([
    ['fire', 'infantry', 3, 0.22],
    ['fire', 'tank', 1, 0.2],
    ['fire', 'rocket', 1, 0.25],
    ['impact', 'tank', 1, 0.24],
    ['destroy', 'tank', 1, 0.65],
  ] as const)('plays %s for %s with shaped noise and body, and releases all nodes', async (cue, kind, bursts, duration) => {
    const { player, context } = fakePlayer();
    await player.unlock();
    const stop = player.playBattle(cue, kind);
    const audio = context()!;
    expect(audio.sources).toHaveLength(bursts);
    expect(audio.oscillators).toHaveLength(bursts);
    expect(audio.filters.every((filter) => filter.type === 'lowpass')).toBe(true);
    expect(audio.sources.at(-1)?.stopped).toBeCloseTo(audio.currentTime + duration);
    expect(audio.gains[0]?.gain.calls[0]).toEqual(['set', defaultSoundSettings.volume, 2]);
    const samples = audio.buffers[0]!;
    expect(samples.every((value) => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true);
    expect(samples.some((value) => value !== 0)).toBe(true);
    audio.oscillators.at(-1)!.end();
    expect([...audio.gains, ...audio.filters, ...audio.sources, ...audio.oscillators].every((node) => node.disconnected)).toBe(true);
    const stopCounts = audio.sources.map((source) => source.stopCalls);
    stop?.();
    expect(audio.sources.map((source) => source.stopCalls)).toEqual(stopCounts);
  });

  it('caches the noise buffer and applies volume and mute changes to active battle sounds', async () => {
    const { player, context } = fakePlayer();
    await player.unlock();
    player.playBattle('fire', 'tank');
    player.playBattle('destroy', 'infantry');
    const audio = context()!;
    expect(audio.buffers).toHaveLength(1);
    player.setSettings({ muted: false, volume: 0.2 });
    expect(audio.gains[0]?.gain.calls.at(-1)).toEqual(['set', 0.2, 2]);
    player.setSettings({ muted: true, volume: 0.2 });
    expect(audio.sources.every((source) => source.disconnected)).toBe(true);
    expect(player.playBattle('fire', 'tank')).toBeUndefined();
    player.setSettings({ muted: false, volume: 0 });
    expect(player.playBattle('impact', 'tank')).toBeUndefined();
    expect(audio.sources).toHaveLength(2);
  });

  it('does not create battle audio before unlock or when the context remains suspended', async () => {
    const { player, context } = fakePlayer();
    expect(player.playBattle('fire', 'tank')).toBeUndefined();
    expect(context()).toBeUndefined();
    FakeAudioContext.resumeFails = true;
    await player.unlock();
    expect(player.playBattle('fire', 'tank')).toBeUndefined();
    expect(context()!.buffers).toHaveLength(0);
  });

  it('stays silent until a user gesture unlocks it', () => {
    const { player, context } = fakePlayer();
    player.play('move');
    expect(context()).toBeUndefined();
  });

  it('plays a short tone per event once unlocked and releases its nodes when it ends', async () => {
    const { player, context } = fakePlayer();
    await player.unlock();
    player.play('capture');
    const [oscillator] = context()!.oscillators;
    const [gain] = context()!.gains;
    expect(oscillator?.type).toBe('sine');
    const [from, to] = oscillator?.frequency.calls ?? [];
    expect(from).toEqual(['set', 340, 2]);
    expect(to?.slice(0, 2)).toEqual(['ramp', 700]);
    expect(to?.[2]).toBeCloseTo(2.14);
    expect(oscillator?.started).toBe(2);
    expect(oscillator?.stopped).toBeCloseTo(2.14);
    expect(oscillator?.connectedTo).toBe(gain);
    expect(gain?.connectedTo).toBe(context()!.destination);
    oscillator?.end();
    expect(oscillator?.disconnected).toBe(true);
    expect(gain?.disconnected).toBe(true);
  });

  it('scales the peak gain with the volume and caps it', async () => {
    const quiet = fakePlayer({ muted: false, volume: 0.25 });
    await quiet.player.unlock();
    quiet.player.play('hit');
    expect(quiet.context()!.gains[0]?.gain.calls[0]?.[1]).toBeCloseTo(0.08);

    const loud = fakePlayer({ muted: false, volume: 1 });
    await loud.player.unlock();
    loud.player.play('hit');
    expect(loud.context()!.gains[0]?.gain.calls[0]?.[1]).toBeCloseTo(0.18);
  });

  it('plays nothing while muted or at zero volume, and follows updated settings', async () => {
    const { player, context } = fakePlayer({ muted: true, volume: 0.5 });
    await player.unlock();
    player.play('attack');
    player.setSettings({ muted: false, volume: 0 });
    player.play('attack');
    expect(context()!.oscillators).toHaveLength(0);
    player.setSettings({ muted: false, volume: 0.5 });
    player.play('attack');
    expect(context()!.oscillators).toHaveLength(1);
  });

  it('reuses one context across unlocks', async () => {
    const { player } = fakePlayer();
    await player.unlock();
    await player.unlock();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('stays silent without throwing when the browser refuses to resume', async () => {
    const { player, context } = fakePlayer();
    FakeAudioContext.resumeFails = true;
    await expect(player.unlock()).resolves.toBeUndefined();
    player.play('turn');
    expect(context()!.state).toBe('suspended');
    expect(context()!.oscillators).toHaveLength(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing without Web Audio support', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const player = new ProceduralSoundPlayer({ muted: false, volume: 0.5 });
    await expect(player.unlock()).resolves.toBeUndefined();
    expect(() => player.play('produce')).not.toThrow();
  });
});
