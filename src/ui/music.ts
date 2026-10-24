import type { PlayerId, StorageLike } from '../game';

export const FIELD_TRACKS = ['march', 'dawn', 'drive', 'wasteland', 'mist', 'rock-red', 'rock-blue'] as const;
export type FieldTrack = (typeof FIELD_TRACKS)[number];

/** Audio file (without extension) for each selectable field track. */
export const FIELD_TRACK_FILES: Record<FieldTrack, string> = {
  'rock-red': 'rock-red-theme',
  'rock-blue': 'rock-blue-theme',
  march: 'frontier-theme',
  dawn: 'dawn-theme',
  drive: 'drive-theme',
  wasteland: 'wasteland-theme',
  mist: 'mist-theme',
};
export const FIELD_TRACK_LABELS: Record<FieldTrack, string> = {
  'rock-red': '烈火（ロック・160 BPM）',
  'rock-blue': '蒼雷（ロック・148 BPM）',
  march: '行進（勇壮・144 BPM）',
  dawn: '暁（凱旋・136 BPM）',
  drive: '疾走（突撃・156 BPM）',
  wasteland: '荒野（進軍・144 BPM）',
  mist: '霧（決意・132 BPM）',
};

export interface MusicSettings {
  muted: boolean;
  volume: number;
  fieldTrack: FieldTrack;
  armyTracks: boolean;
  blueFieldTrack: FieldTrack;
}

export const MUSIC_SETTINGS_KEY = 'ministr.music.settings';
export const defaultMusicSettings: MusicSettings = { muted: false, volume: 0.28, fieldTrack: 'march', armyTracks: true, blueFieldTrack: 'rock-blue' };

export interface LoopingAudio {
  src: string;
  loop: boolean;
  preload: string;
  volume: number;
  muted: boolean;
  currentTime: number;
  readonly readyState: number;
  readonly ended: boolean;
  readonly paused: boolean;
  addEventListener(type: 'loadedmetadata' | 'canplay', listener: () => void): void;
  load(): void;
  play(): Promise<void>;
  pause(): void;
}

const isFieldTrack = (value: unknown): value is FieldTrack => FIELD_TRACKS.some((track) => track === value);

function isMusicSettings(value: unknown): value is MusicSettings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { muted?: unknown; volume?: unknown; fieldTrack?: unknown; armyTracks?: unknown; blueFieldTrack?: unknown };
  return (
    typeof candidate.muted === 'boolean' &&
    typeof candidate.volume === 'number' &&
    Number.isFinite(candidate.volume) &&
    candidate.volume >= 0 &&
    candidate.volume <= 1 &&
    isFieldTrack(candidate.fieldTrack) &&
    typeof candidate.armyTracks === 'boolean' &&
    isFieldTrack(candidate.blueFieldTrack)
  );
}

export function loadMusicSettings(storage: StorageLike): MusicSettings {
  try {
    const raw = storage.getItem(MUSIC_SETTINGS_KEY);
    if (!raw) return { ...defaultMusicSettings };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...defaultMusicSettings };
    // Old choices, volume and mute survive. New army fields are defaulted only
    // when absent; malformed explicit values are rejected rather than coerced.
    const candidate = {
      ...parsed,
      ...(!('fieldTrack' in parsed) ? { fieldTrack: 'march' } : {}),
      ...(!('armyTracks' in parsed) ? { armyTracks: defaultMusicSettings.armyTracks } : {}),
      ...(!('blueFieldTrack' in parsed) ? { blueFieldTrack: defaultMusicSettings.blueFieldTrack } : {}),
    };
    return isMusicSettings(candidate)
      ? { muted: candidate.muted, volume: candidate.volume, fieldTrack: candidate.fieldTrack, armyTracks: candidate.armyTracks, blueFieldTrack: candidate.blueFieldTrack }
      : { ...defaultMusicSettings };
  } catch {
    return { ...defaultMusicSettings };
  }
}

export function saveMusicSettings(storage: StorageLike, settings: MusicSettings): boolean {
  if (!isMusicSettings(settings)) return false;
  try {
    storage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

type MusicTrack = FieldTrack | 'battle';

function trackUrl(track: MusicTrack): string {
  const file = track === 'battle' ? 'battle-theme' : FIELD_TRACK_FILES[track];
  const revision =
    track === 'rock-red' || track === 'rock-blue' ? 'rock-20261024' : track === 'battle' ? 'legato-20261017' : track === 'march' ? 'brave-20261015' : 'campaign-20261015';
  return `${import.meta.env.BASE_URL}assets/${file}.ogg?v=${revision}`;
}

/**
 * Reuse the element unlocked by a real gesture for every BGM. iOS grants audio
 * permission per element; silently priming a second, muted battle element does
 * not reliably grant permission for later audible CPU-initiated playback.
 */
export class BackgroundMusicPlayer {
  private track: MusicTrack;
  private army: PlayerId = 'red';
  private readonly fieldPositions = new Map<FieldTrack, number>();
  private activated = false;
  private generation = 0;
  private started = false;
  private pendingPlay: Promise<void> | undefined;
  private pendingPosition: number | undefined;

  constructor(
    private settings: MusicSettings,
    private readonly audio: LoopingAudio = new Audio(),
  ) {
    this.track = settings.fieldTrack;
    audio.muted = true;
    audio.volume = settings.volume;
    audio.loop = true;
    audio.preload = 'none';
    audio.src = trackUrl(this.track);
    audio.addEventListener('loadedmetadata', () => this.restorePosition());
    // A source may become ready after an earlier play request was interrupted.
    audio.addEventListener('canplay', () => void this.syncPlayback());
  }

  async unlock(): Promise<void> {
    this.activated = true;
    // Retry policy denials or device interruptions on a real user gesture.
    await this.syncPlayback();
  }

  setBattle(active: boolean, restart = false): void {
    if (active === (this.track === 'battle') && !(active && restart)) return;
    this.selectTrack(active ? 'battle' : this.fieldTrack());
    void this.syncPlayback();
  }

  setSettings(settings: MusicSettings): void {
    this.settings = settings;
    // Changing the field choice during a battle takes effect after that scene.
    if (this.track !== 'battle' && this.track !== this.fieldTrack()) this.selectTrack(this.fieldTrack());
    this.audio.volume = settings.volume;
    void this.syncPlayback();
  }

  setArmy(army: PlayerId): void {
    if (this.army === army) return;
    this.army = army;
    // A battle owns the source until it ends. A turn/seek during the scene
    // only changes which army's field track will be restored afterward.
    if (this.track !== 'battle' && this.track !== this.fieldTrack()) this.selectTrack(this.fieldTrack());
    void this.syncPlayback();
  }

  private fieldTrack(): FieldTrack {
    return this.settings.armyTracks && this.army === 'blue' ? this.settings.blueFieldTrack : this.settings.fieldTrack;
  }

  private selectTrack(track: MusicTrack): void {
    if (this.track !== 'battle') {
      // The new source may not have metadata yet: preserve its saved position
      // if another switch occurs before the pending seek can be applied.
      this.fieldPositions.set(this.track, this.pendingPosition ?? this.audio.currentTime);
    }
    this.stopPlayback();
    this.track = track;
    this.started = false;
    this.pendingPosition = track === 'battle' ? 0 : (this.fieldPositions.get(track) ?? 0);
    this.audio.loop = track !== 'battle';
    this.audio.preload = 'auto';
    this.audio.src = trackUrl(track);
    // Cancel obsolete play/seek requests, including consecutive battles on the
    // same source. Permission remains on this one already-unlocked element.
    this.audio.load();
    this.restorePosition();
  }

  private restorePosition(): void {
    // Safari cannot seek to a saved field position before metadata is ready.
    if (this.pendingPosition === undefined || this.audio.readyState === 0) return;
    this.audio.currentTime = this.pendingPosition;
    this.pendingPosition = undefined;
  }

  private stopPlayback(): void {
    this.generation += 1;
    this.pendingPlay = undefined;
    this.audio.muted = true;
    this.audio.pause();
  }

  private async syncPlayback(): Promise<void> {
    if (!this.activated || this.settings.muted || this.settings.volume === 0) {
      this.stopPlayback();
      return;
    }
    this.audio.muted = false;
    // Do not repeat a completed battle cue on gestures, readiness events or
    // volume edits. A new scene resets started before its asynchronous seek.
    if (this.track === 'battle' && this.audio.ended && this.started) return;
    if (this.pendingPlay) return this.pendingPlay;
    if (this.audio.paused === false) return;
    const generation = this.generation;
    const pending = this.audio
      .play()
      .then(() => {
        // A late completion belongs to an old source. Never pause or mute the
        // element here: it may already be playing the next battle/field track.
        if (generation === this.generation) this.started = true;
      })
      .catch(() => {
        // Retry on canplay or the next gesture; gameplay remains available.
      })
      .finally(() => {
        if (this.pendingPlay === pending) this.pendingPlay = undefined;
      });
    this.pendingPlay = pending;
    await pending;
  }
}
