import { parseBoundedJson } from '../game/jsonBoundary';
import { FOUR_ARMY_IDS, type FourArmyId } from '../game/fourArmyFoundation';
import type { StorageLike } from '../game/session';
import { FIELD_TRACKS, FIELD_TRACK_LABELS, loadMusicSettings, type FieldTrack, type MusicSettings } from './music';
import { getLocale, translateText } from './locale';

export const FOUR_ARMY_MUSIC_KEY = 'ministr.fourArmy.music';
export interface FourArmyMusicSettings {
  muted: boolean;
  volume: number;
  fieldTrack: FieldTrack;
  armyTracks: boolean;
  tracks: Record<FourArmyId, FieldTrack>;
}

const trackFor = (value: unknown) => FIELD_TRACKS.find((track) => track === value);

export function loadFourArmyMusic(storage: StorageLike): FourArmyMusicSettings {
  const original = loadMusicSettings(storage);
  const defaults: FourArmyMusicSettings = {
    muted: original.muted,
    volume: original.volume,
    fieldTrack: original.fieldTrack,
    armyTracks: false,
    tracks: { army1: 'rock-red', army2: 'rock-blue', army3: 'drive', army4: 'dawn' },
  };
  try {
    const data = parseBoundedJson(storage.getItem(FOUR_ARMY_MUSIC_KEY) ?? '', 1000);
    if (!data.ok || !data.value || typeof data.value !== 'object') return defaults;
    const { muted, volume, fieldTrack, armyTracks, tracks } = data.value as Partial<FourArmyMusicSettings>;
    if (
      typeof muted !== 'boolean' ||
      typeof volume !== 'number' ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      volume > 1 ||
      !trackFor(fieldTrack) ||
      typeof armyTracks !== 'boolean' ||
      !tracks ||
      !FOUR_ARMY_IDS.every((army) => trackFor(tracks[army]))
    )
      return defaults;
    return { muted, volume, fieldTrack: fieldTrack!, armyTracks, tracks: { army1: tracks.army1, army2: tracks.army2, army3: tracks.army3, army4: tracks.army4 } };
  } catch {
    return defaults;
  }
}

export function saveFourArmyMusic(storage: StorageLike, settings: FourArmyMusicSettings): boolean {
  try {
    storage.setItem(FOUR_ARMY_MUSIC_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function fourArmyMusicPlayback(settings: FourArmyMusicSettings, actor?: FourArmyId): MusicSettings {
  const fieldTrack = settings.armyTracks && actor ? settings.tracks[actor] : settings.fieldTrack;
  return { muted: settings.muted, volume: settings.volume, fieldTrack, armyTracks: false, blueFieldTrack: fieldTrack };
}

export function editFourArmyMusic(settings: FourArmyMusicSettings, input: HTMLInputElement | HTMLSelectElement): FourArmyMusicSettings | undefined {
  if (input instanceof HTMLInputElement) {
    if (input.id === 'four-music-on') return { ...settings, muted: !input.checked };
    if (input.id === 'four-music-by-army') return { ...settings, armyTracks: input.checked };
    if (input.id === 'four-music-volume') {
      const volume = input.valueAsNumber / 100;
      if (Number.isFinite(volume) && volume >= 0 && volume <= 1) return { ...settings, volume };
    }
  }
  const track = trackFor(input.value);
  if (!track) return;
  if (input.id === 'four-music-shared') return { ...settings, fieldTrack: track };
  const army = FOUR_ARMY_IDS.find((id) => input.id === `four-music-${id}`);
  if (army) return { ...settings, tracks: { ...settings.tracks, [army]: track } };
}

export function renderFourArmyMusic(settings: FourArmyMusicSettings, open: boolean): string {
  const en = getLocale() === 'en';
  const trackOptions = (track: FieldTrack) =>
    FIELD_TRACKS.map((id) => `<option value="${id}" ${track === id ? 'selected' : ''}>${translateText(FIELD_TRACK_LABELS[id])}</option>`).join('');
  return `<details id="four-music-settings" class="four-music-settings" ${open ? 'open' : ''}>
    <summary>${en ? 'BGM settings' : 'BGM設定'}</summary>
    <div class="four-music-controls">
      <label><input id="four-music-on" type="checkbox" data-four-music ${settings.muted ? '' : 'checked'}> BGM</label>
      <label>${en ? 'BGM volume' : 'BGM音量'} <input id="four-music-volume" type="range" min="0" max="100" data-four-music value="${Math.round(settings.volume * 100)}"></label>
      <label><input id="four-music-by-army" type="checkbox" data-four-music ${settings.armyTracks ? 'checked' : ''}> ${en ? 'Switch by army turn' : '手番で曲を切り替える'}</label>
      <label>${en ? 'Shared track' : '共通曲'} <select id="four-music-shared" data-four-music>${trackOptions(settings.fieldTrack)}</select></label>
      ${FOUR_ARMY_IDS.map((army, i) => `<label>${en ? `Army ${i + 1} track` : `第${i + 1}軍の曲`} <select id="four-music-${army}" data-four-music data-four-music-army ${settings.armyTracks ? '' : 'disabled'}>${trackOptions(settings.tracks[army])}</select></label>`).join('')}
      <p id="four-music-status" role="status"></p>
    </div>
  </details>`;
}
