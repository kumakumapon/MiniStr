import type { PlayerId } from '../game';
import type { FieldTrack, MusicSettings } from '../game/musicSettings';

export type MusicTrack = FieldTrack | 'battle';

/**
 * The slice of the Web Audio API used for BGM. Declared structurally so tests can
 * supply a fake context; the real AudioContext is adapted at one boundary.
 */
export interface MusicBuffer {
  readonly duration: number;
}
export interface MusicGainNode {
  gain: { value: number };
  connect(destination: unknown): unknown;
}
export interface MusicBufferSource {
  buffer: MusicBuffer | null;
  loop: boolean;
  onended: (() => void) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(): void;
}
export interface MusicAudioContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  createGain(): MusicGainNode;
  createBufferSource(): MusicBufferSource;
  createBuffer(channels: number, length: number, sampleRate: number): MusicBuffer;
  decodeAudioData(data: ArrayBuffer): Promise<MusicBuffer>;
  resume(): Promise<void>;
  close(): Promise<void>;
}
export type MusicFetch = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

/** The track that should be audible for the requested state. A battle owns playback until it ends. */
export function wantedTrack(settings: MusicSettings, army: PlayerId, battle: boolean): MusicTrack {
  if (battle) return 'battle';
  return settings.armyTracks && army === 'blue' ? settings.blueFieldTrack : settings.fieldTrack;
}

/** Wrap a playhead into [0, duration). Invalid input falls back to the start. */
export function wrapPosition(position: number, duration: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0;
  const wrapped = position % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}

/** Playhead after `elapsed` seconds from `offset`: looping tracks wrap, a one-shot cue stops at its end. */
export function positionAfter(offset: number, elapsed: number, duration: number, loop: boolean): number {
  const raw = (Number.isFinite(offset) ? offset : 0) + (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0);
  return loop ? wrapPosition(raw, duration) : Math.min(raw, Math.max(0, duration));
}

/** Fetch and decode one track. Rejects on HTTP errors, aborted transfers and undecodable data. */
export async function loadMusicBuffer(ctx: MusicAudioContext, url: string, fetchImpl: MusicFetch): Promise<MusicBuffer> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error('music fetch failed');
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  if (!(buffer.duration > 0)) throw new Error('music buffer is empty');
  return buffer;
}

/** Minimum delay before a user gesture re-attempts to fetch tracks that are still missing. */
export const PREFETCH_RETRY_MS = 10_000;

interface ActivePlay {
  readonly track: MusicTrack;
  readonly source: MusicBufferSource;
  readonly startedAt: number;
  readonly offset: number;
  readonly duration: number;
  readonly loop: boolean;
}

export interface WebAudioMusicDeps {
  readonly ctx: MusicAudioContext;
  readonly urlFor: (track: MusicTrack) => string;
  readonly fetchImpl: MusicFetch;
}

/**
 * Gapless BGM on AudioBufferSourceNode. A field track is one looping source; the
 * 3.5 s battle cue is a one-shot whose `onended` marks it finished so readiness
 * or volume changes cannot replay it. Sources are never reused: a stop commits
 * the playhead into `offsets`, and the next start resumes there. The desired
 * state (settings, army, battle) is the single source of truth and `sync()`
 * reconciles playback to it, so a late decode can never start an obsolete track.
 */
export class WebAudioMusicBackend {
  private readonly gain: MusicGainNode;
  private readonly buffers = new Map<MusicTrack, MusicBuffer>();
  private readonly inflight = new Map<MusicTrack, Promise<MusicBuffer | undefined>>();
  private readonly offsets = new Map<MusicTrack, number>();
  private current: ActivePlay | undefined;
  private battleDone = false;
  private activated = false;
  private lastPrefetchAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly deps: WebAudioMusicDeps,
    private settings: MusicSettings,
    private army: PlayerId,
    private battle: boolean,
  ) {
    this.gain = deps.ctx.createGain();
    this.gain.gain.value = settings.volume;
    this.gain.connect(deps.ctx.destination);
  }

  /** Reuse the buffer already decoded while choosing this backend. */
  seed(track: MusicTrack, buffer: MusicBuffer): void {
    if (this.retained().has(track)) this.buffers.set(track, buffer);
  }

  unlock(): Promise<void> {
    this.activated = true;
    // resume() must run in the gesture; a rejected one is retried on the next unlock.
    const resumed = this.resume();
    this.sync();
    // Gestures are frequent: re-fetch missing tracks only after a cool-down.
    this.prefetch(false);
    return resumed;
  }

  setBattle(active: boolean, restart = false): void {
    if (active === this.battle && !(active && restart)) return;
    this.battle = active;
    if (active) {
      // Entering or restarting a cue always begins at 0 and may sound again.
      this.stopCurrent();
      this.battleDone = false;
      this.offsets.set('battle', 0);
    }
    this.sync();
  }

  setSettings(settings: MusicSettings): void {
    this.settings = settings;
    this.gain.gain.value = settings.volume;
    this.pruneBuffers();
    this.sync();
    this.prefetch(true);
  }

  setArmy(army: PlayerId): void {
    if (this.army === army) return;
    this.army = army;
    this.sync();
  }

  /** Test/diagnostic view of cached tracks. */
  cachedTracks(): MusicTrack[] {
    return [...this.buffers.keys()];
  }

  private async resume(): Promise<void> {
    if (this.deps.ctx.state === 'running') return;
    try {
      await this.deps.ctx.resume();
    } catch {
      // Autoplay policy or an interruption: the next user gesture retries.
    }
  }

  private retained(): Set<MusicTrack> {
    const keep = new Set<MusicTrack>(['battle', wantedTrack(this.settings, this.army, false), this.settings.fieldTrack]);
    if (this.settings.armyTracks) keep.add(this.settings.blueFieldTrack);
    return keep;
  }

  private pruneBuffers(): void {
    const keep = this.retained();
    for (const track of [...this.buffers.keys()]) if (!keep.has(track)) this.buffers.delete(track);
  }

  private prefetch(force: boolean): void {
    const current = wantedTrack(this.settings, this.army, false);
    const order: MusicTrack[] = [current];
    if (this.settings.armyTracks) order.push(wantedTrack(this.settings, this.army === 'blue' ? 'red' : 'blue', false));
    order.push('battle');
    const missing = order.filter((track) => !this.buffers.has(track));
    if (missing.length === 0) return;
    const now = Date.now();
    if (!force && now - this.lastPrefetchAt < PREFETCH_RETRY_MS) return;
    this.lastPrefetchAt = now;
    void (async () => {
      for (const track of order) await this.load(track);
    })();
  }

  private load(track: MusicTrack): Promise<MusicBuffer | undefined> {
    const cached = this.buffers.get(track);
    if (cached) return Promise.resolve(cached);
    const pending = this.inflight.get(track);
    if (pending) return pending;
    const request: Promise<MusicBuffer | undefined> = loadMusicBuffer(this.deps.ctx, this.deps.urlFor(track), this.deps.fetchImpl)
      .catch(() => undefined)
      .then((buffer) => {
        if (this.inflight.get(track) === request) this.inflight.delete(track);
        // A result nobody needs any more (the selection moved on) is dropped.
        if (buffer && this.retained().has(track)) this.buffers.set(track, buffer);
        return buffer;
      });
    this.inflight.set(track, request);
    return request;
  }

  private sync(): void {
    const wanted = wantedTrack(this.settings, this.army, this.battle);
    const audible = this.activated && !this.settings.muted && this.settings.volume > 0;
    if (this.current && (!audible || this.current.track !== wanted)) this.stopCurrent();
    if (!audible || this.current) return;
    if (wanted === 'battle' && this.battleDone) return;
    const buffer = this.buffers.get(wanted);
    if (!buffer) {
      // Playback is reconciled again when the decode lands. A failed load is retried by the next request.
      void this.load(wanted).then(() => {
        if (this.buffers.has(wanted)) this.sync();
      });
      return;
    }
    this.start(wanted, buffer);
  }

  private start(track: MusicTrack, buffer: MusicBuffer): void {
    const { ctx } = this.deps;
    const loop = track !== 'battle';
    const saved = this.offsets.get(track) ?? 0;
    const offset = positionAfter(saved, 0, buffer.duration, loop);
    if (!loop && offset >= buffer.duration) {
      this.battleDone = true;
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(this.gain);
    const play: ActivePlay = { track, source, startedAt: ctx.currentTime, offset, duration: buffer.duration, loop };
    source.onended = () => {
      // A stopped or replaced source is no longer current: its event is ignored.
      if (this.current !== play) return;
      this.current = undefined;
      source.disconnect();
      if (!loop) {
        this.battleDone = true;
        this.offsets.set(track, 0);
      }
    };
    this.current = play;
    source.start(0, offset);
  }

  private stopCurrent(): void {
    const play = this.current;
    if (!play) return;
    this.current = undefined;
    this.offsets.set(play.track, positionAfter(play.offset, this.deps.ctx.currentTime - play.startedAt, play.duration, play.loop));
    play.source.onended = null;
    try {
      play.source.stop();
    } catch {
      // Already stopped.
    }
    play.source.disconnect();
  }
}
