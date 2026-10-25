import type { StorageLike } from './session';
import { parseBoundedJson } from './jsonBoundary';

export const FIELD_TRACKS = ['march', 'dawn', 'drive', 'wasteland', 'mist', 'rock-red', 'rock-blue'] as const;
export type FieldTrack = (typeof FIELD_TRACKS)[number];

export interface MusicSettings {
  muted: boolean;
  volume: number;
  fieldTrack: FieldTrack;
  armyTracks: boolean;
  blueFieldTrack: FieldTrack;
}

export const MUSIC_SETTINGS_KEY = 'ministr.music.settings';
export const defaultMusicSettings: MusicSettings = { muted: false, volume: 0.28, fieldTrack: 'march', armyTracks: true, blueFieldTrack: 'rock-blue' };

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
    return raw === null ? { ...defaultMusicSettings } : (parseMusicSettings(raw) ?? { ...defaultMusicSettings });
  } catch {
    return { ...defaultMusicSettings };
  }
}

export function parseMusicSettings(raw: string): MusicSettings | undefined {
  try {
    const bounded = parseBoundedJson(raw, 1000);
    if (!bounded.ok) return undefined;
    const parsed: unknown = bounded.value;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
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
      : undefined;
  } catch {
    return undefined;
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
