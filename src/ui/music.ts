import type { StorageLike } from '../game';

export const FIELD_TRACKS = ['march', 'dawn', 'drive', 'wasteland', 'mist'] as const;
export type FieldTrack = (typeof FIELD_TRACKS)[number];

/** Audio file (without extension) for each selectable field track. */
export const FIELD_TRACK_FILES: Record<FieldTrack, string> = {
  march: 'frontier-theme',
  dawn: 'dawn-theme',
  drive: 'drive-theme',
  wasteland: 'wasteland-theme',
  mist: 'mist-theme',
};
export const FIELD_TRACK_LABELS: Record<FieldTrack, string> = {
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
}

export const MUSIC_SETTINGS_KEY = 'ministr.music.settings';
export const defaultMusicSettings: MusicSettings = { muted: false, volume: 0.28, fieldTrack: 'march' };

export interface LoopingAudio {
  loop: boolean;
  preload: string;
  volume: number;
  muted?: boolean;
  currentTime?: number;
  readonly ended?: boolean;
  play(): Promise<void>;
  pause(): void;
}

const isFieldTrack = (value: unknown): value is FieldTrack => FIELD_TRACKS.some((track) => track === value);

function isMusicSettings(value: unknown): value is MusicSettings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { muted?: unknown; volume?: unknown; fieldTrack?: unknown };
  return (
    typeof candidate.muted === 'boolean' &&
    typeof candidate.volume === 'number' &&
    Number.isFinite(candidate.volume) &&
    candidate.volume >= 0 &&
    candidate.volume <= 1 &&
    isFieldTrack(candidate.fieldTrack)
  );
}

export function loadMusicSettings(storage: StorageLike): MusicSettings {
  try {
    const raw = storage.getItem(MUSIC_SETTINGS_KEY);
    if (!raw) return { ...defaultMusicSettings };
    const parsed: unknown = JSON.parse(raw);
    // Settings saved before the track choice existed have no fieldTrack: keep them and default the track.
    const candidate = typeof parsed === 'object' && parsed !== null && !('fieldTrack' in parsed) ? { ...parsed, fieldTrack: defaultMusicSettings.fieldTrack } : parsed;
    return isMusicSettings(candidate) ? { muted: candidate.muted, volume: candidate.volume, fieldTrack: candidate.fieldTrack } : { ...defaultMusicSettings };
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

function createAudio(track: string = FIELD_TRACK_FILES.march): LoopingAudio {
  const revision = track === 'battle-theme' ? '?v=cinematic-20261017' : track === 'frontier-theme' ? '?v=brave-20261015' : '?v=campaign-20261015';
  const audio = new Audio(`${import.meta.env.BASE_URL}assets/${track}.ogg${revision}`);
  audio.loop = track !== 'battle-theme';
  audio.preload = 'none';
  return audio;
}

/** Starts a looped soundtrack only after a user gesture unlocks browser audio. */
export class BackgroundMusicPlayer {
  private audio: LoopingAudio;
  /** Field-track elements are created when first picked and then reused. */
  private readonly fieldAudio = new Map<FieldTrack, LoopingAudio>();
  private readonly createField: ((track: FieldTrack) => LoopingAudio) | undefined;
  private battleAudio: LoopingAudio | undefined;
  private inBattle = false;
  private activated = false;
  private battleGeneration = 0;
  private battleStartPending = false;

  constructor(
    private settings: MusicSettings,
    audio?: LoopingAudio,
    battleAudio?: LoopingAudio,
    createField?: (track: FieldTrack) => LoopingAudio,
  ) {
    // Injected audio without a factory (tests) stays fixed; otherwise tracks come from files.
    this.createField = createField ?? (audio ? undefined : (track) => createAudio(FIELD_TRACK_FILES[track]));
    this.audio = audio ?? this.createField!(settings.fieldTrack);
    this.fieldAudio.set(settings.fieldTrack, this.audio);
    this.audio.loop = true;
    this.audio.preload = 'none';
    this.audio.volume = settings.volume;
    this.audio.muted = true;
    this.battleAudio = battleAudio ?? (audio ? undefined : createAudio('battle-theme'));
    if (this.battleAudio) {
      this.battleAudio.loop = false;
      this.battleAudio.preload = 'auto';
      this.battleAudio.volume = settings.volume;
      this.battleAudio.muted = true;
    }
  }

  async unlock(): Promise<void> {
    if (!this.activated) {
      this.activated = true;
      // Unlock both elements during the first gesture, including browsers that grant
      // playback permission per element. A late completion cannot restart a scene.
      const battle = this.battleAudio;
      if (battle && !this.inBattle) this.primeSilently(battle);
    }
    // A denied play or a browser suspension can recover on the next user gesture.
    await this.syncPlayback();
  }

  setBattle(active: boolean, restart = false): void {
    if (active === this.inBattle && !(active && restart)) return;
    this.inBattle = active;
    this.battleGeneration += 1;
    this.battleStartPending = active;
    if (active) {
      this.battleAudio ??= createAudio('battle-theme');
      this.battleAudio.loop = false;
      this.battleAudio.preload = 'auto';
      this.battleAudio.volume = this.settings.volume;
      if (this.battleAudio.currentTime !== undefined) this.battleAudio.currentTime = 0;
    }
    const previous = active ? this.audio : this.battleAudio;
    if (previous) {
      previous.muted = true;
      previous.pause();
    }
    void this.syncPlayback();
  }

  setSettings(settings: MusicSettings): void {
    const trackChanged = settings.fieldTrack !== this.settings.fieldTrack;
    this.settings = settings;
    // The chosen track is only fetched when picked; a battle in progress keeps its own theme.
    if (trackChanged && this.createField) {
      this.audio.muted = true;
      this.audio.pause();
      let next = this.fieldAudio.get(settings.fieldTrack);
      const fresh = next === undefined;
      if (!next) {
        next = this.createField(settings.fieldTrack);
        next.loop = true;
        next.preload = 'none';
        next.muted = true;
        this.fieldAudio.set(settings.fieldTrack, next);
      }
      this.audio = next;
      // Picking a track is a user gesture: grant a new element playback permission now
      // (per-element on some browsers) even if it must stay silent until later.
      if (fresh && this.activated) this.primeSilently(next);
    }
    this.audio.volume = settings.volume;
    if (this.battleAudio) this.battleAudio.volume = settings.volume;
    if (!this.activated || settings.muted || settings.volume === 0) {
      if (settings.muted || settings.volume === 0) {
        this.audio.muted = true;
        if (this.battleAudio) this.battleAudio.muted = true;
        this.audio.pause();
        this.battleAudio?.pause();
      }
      return;
    }
    void this.syncPlayback();
  }

  private primeSilently(audio: LoopingAudio): void {
    // Some browsers ignore element volume. Keep an inactive track explicitly
    // muted even while its playback permission is being unlocked.
    audio.muted = true;
    audio.volume = 0;
    const restore = (): void => {
      audio.muted = audio !== (this.inBattle ? this.battleAudio : this.audio) || this.settings.muted || this.settings.volume === 0;
      if (audio.muted) audio.pause();
      audio.volume = this.settings.volume;
    };
    void audio.play().then(restore).catch(restore);
  }

  private async syncPlayback(): Promise<void> {
    const audio = this.inBattle ? this.battleAudio : this.audio;
    if (!audio) return;
    // Silence the other elements before making the current one audible.
    for (const field of this.fieldAudio.values()) {
      if (field !== audio) field.muted = true;
    }
    if (this.battleAudio && this.battleAudio !== audio) this.battleAudio.muted = true;
    audio.muted = !this.activated || this.settings.muted || this.settings.volume === 0;
    if (audio.muted) {
      audio.pause();
      return;
    }
    // Seeking is asynchronous: ended may still describe the previous battle
    // after currentTime = 0. Only suppress replays after this scene has started.
    if (this.inBattle && audio.ended && !this.battleStartPending) return;
    const generation = this.battleGeneration;
    const startingBattle = this.inBattle;
    try {
      await audio.play();
      if (startingBattle && this.inBattle && generation === this.battleGeneration) this.battleStartPending = false;
      if (audio !== (this.inBattle ? this.battleAudio : this.audio) || this.settings.muted || this.settings.volume === 0) {
        audio.muted = true;
        audio.pause();
      }
    } catch {
      // Browser autoplay policy or unavailable audio: remain silent.
    }
  }
}
