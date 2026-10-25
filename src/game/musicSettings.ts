import { parseBoundedJson } from './jsonBoundary';
import type { GameResult } from './types';

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
export const MAX_MUSIC_SETTINGS_BYTES = 1000;
export const defaultMusicSettings: MusicSettings = { muted: false, volume: 0.28, fieldTrack: 'march', armyTracks: true, blueFieldTrack: 'rock-blue' };

const MUSIC_SETTING_KEYS: readonly string[] = ['muted', 'volume', 'fieldTrack', 'armyTracks', 'blueFieldTrack'];

const isFieldTrack = (value: unknown): value is FieldTrack => FIELD_TRACKS.some((track) => track === value);

export function isMusicSettings(value: unknown): value is MusicSettings {
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

/**
 * Parse stored BGM settings. Old choices, volume and mute survive; new army
 * fields are defaulted only when absent, while malformed explicit values are
 * rejected rather than coerced. `rejectUnknownKeys` is for external imports.
 */
export function parseMusicSettings(raw: string, options: { rejectUnknownKeys?: boolean } = {}): GameResult<MusicSettings> {
  const parsed = parseBoundedJson(raw, MAX_MUSIC_SETTINGS_BYTES);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const error = { ok: false, error: 'BGM設定が不正です。' } as const;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return error;
  if (options.rejectUnknownKeys && Object.keys(value).some((key) => !MUSIC_SETTING_KEYS.includes(key))) return error;
  const candidate = {
    ...value,
    ...(!('fieldTrack' in value) ? { fieldTrack: defaultMusicSettings.fieldTrack } : {}),
    ...(!('armyTracks' in value) ? { armyTracks: defaultMusicSettings.armyTracks } : {}),
    ...(!('blueFieldTrack' in value) ? { blueFieldTrack: defaultMusicSettings.blueFieldTrack } : {}),
  };
  if (!isMusicSettings(candidate)) return error;
  return {
    ok: true,
    value: { muted: candidate.muted, volume: candidate.volume, fieldTrack: candidate.fieldTrack, armyTracks: candidate.armyTracks, blueFieldTrack: candidate.blueFieldTrack },
  };
}
