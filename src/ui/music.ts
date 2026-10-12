import type { StorageLike } from '../game';

export const FIELD_TRACKS = ['march', 'dawn', 'drive'] as const;
export type FieldTrack = (typeof FIELD_TRACKS)[number];

/** Audio file (without extension) for each selectable field track. */
export const FIELD_TRACK_FILES: Record<FieldTrack, string> = { march: 'frontier-theme', dawn: 'dawn-theme', drive: 'drive-theme' };
export const FIELD_TRACK_LABELS: Record<FieldTrack, string> = { march: '行進（重厚）', dawn: '暁（壮麗）', drive: '疾走（シンセ）' };

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
  currentTime?: number;
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
  const audio = new Audio(`${import.meta.env.BASE_URL}assets/${track}.ogg`);
  audio.loop = true;
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
    this.battleAudio = battleAudio ?? (audio ? undefined : createAudio('battle-theme'));
    if (this.battleAudio) {
      this.battleAudio.loop = true;
      this.battleAudio.preload = 'auto';
      this.battleAudio.volume = settings.volume;
    }
  }

  async unlock(): Promise<void> {
    if (this.activated) return;
    this.activated = true;
    // Unlock both elements during the gesture, including browsers that grant
    // playback permission per element. A late completion cannot restart a scene.
    const battle = this.battleAudio;
    if (battle && !this.inBattle) {
      battle.volume = 0;
      void battle
        .play()
        .then(() => {
          if (!this.inBattle || this.settings.muted || this.settings.volume === 0) battle.pause();
          battle.volume = this.settings.volume;
        })
        .catch(() => {
          battle.volume = this.settings.volume;
        });
    }
    await this.syncPlayback();
  }

  setBattle(active: boolean): void {
    if (active === this.inBattle) return;
    this.inBattle = active;
    if (active) {
      this.battleAudio ??= createAudio('battle-theme');
      this.battleAudio.loop = true;
      this.battleAudio.preload = 'auto';
      this.battleAudio.volume = this.settings.volume;
      if (this.battleAudio.currentTime !== undefined) this.battleAudio.currentTime = 0;
    }
    (active ? this.audio : this.battleAudio)?.pause();
    void this.syncPlayback();
  }

  setSettings(settings: MusicSettings): void {
    const trackChanged = settings.fieldTrack !== this.settings.fieldTrack;
    this.settings = settings;
    // The chosen track is only fetched when picked; a battle in progress keeps its own theme.
    if (trackChanged && this.createField) {
      this.audio.pause();
      let next = this.fieldAudio.get(settings.fieldTrack);
      const fresh = next === undefined;
      if (!next) {
        next = this.createField(settings.fieldTrack);
        next.loop = true;
        next.preload = 'none';
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
        this.audio.pause();
        this.battleAudio?.pause();
      }
      return;
    }
    void this.syncPlayback();
  }

  private primeSilently(audio: LoopingAudio): void {
    audio.volume = 0;
    const restore = (): void => {
      audio.volume = this.settings.volume;
    };
    void audio
      .play()
      .then(() => {
        if (audio !== (this.inBattle ? this.battleAudio : this.audio) || this.settings.muted || this.settings.volume === 0) audio.pause();
        restore();
      })
      .catch(restore);
  }

  private async syncPlayback(): Promise<void> {
    const audio = this.inBattle ? this.battleAudio : this.audio;
    if (!audio) return;
    if (!this.activated || this.settings.muted || this.settings.volume === 0) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
      if (audio !== (this.inBattle ? this.battleAudio : this.audio) || this.settings.muted || this.settings.volume === 0) audio.pause();
    } catch {
      // Browser autoplay policy or unavailable audio: remain silent.
    }
  }
}
