import type { StorageLike } from '../game';

export interface MusicSettings {
  muted: boolean;
  volume: number;
}

export const MUSIC_SETTINGS_KEY = 'ministr.music.settings';
export const defaultMusicSettings: MusicSettings = { muted: false, volume: 0.28 };

export interface LoopingAudio {
  loop: boolean;
  preload: string;
  volume: number;
  currentTime?: number;
  play(): Promise<void>;
  pause(): void;
}

function isMusicSettings(value: unknown): value is MusicSettings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { muted?: unknown; volume?: unknown };
  return typeof candidate.muted === 'boolean' && typeof candidate.volume === 'number' && Number.isFinite(candidate.volume) && candidate.volume >= 0 && candidate.volume <= 1;
}

export function loadMusicSettings(storage: StorageLike): MusicSettings {
  try {
    const raw = storage.getItem(MUSIC_SETTINGS_KEY);
    if (!raw) return { ...defaultMusicSettings };
    const parsed: unknown = JSON.parse(raw);
    return isMusicSettings(parsed) ? parsed : { ...defaultMusicSettings };
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

function createAudio(track = 'frontier-theme'): LoopingAudio {
  const audio = new Audio(`${import.meta.env.BASE_URL}assets/${track}.ogg`);
  audio.loop = true;
  audio.preload = 'none';
  return audio;
}

/** Starts a looped soundtrack only after a user gesture unlocks browser audio. */
export class BackgroundMusicPlayer {
  private readonly audio: LoopingAudio;
  private battleAudio: LoopingAudio | undefined;
  private inBattle = false;
  private activated = false;

  constructor(
    private settings: MusicSettings,
    audio?: LoopingAudio,
    battleAudio?: LoopingAudio,
  ) {
    this.audio = audio ?? createAudio();
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
    this.settings = settings;
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
