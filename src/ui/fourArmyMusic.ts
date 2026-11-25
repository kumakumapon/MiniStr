import type { FourArmyMusicSettings } from '../game/musicSettings';
import { FOUR_ARMY_IDS, type FourArmyId } from '../game/fourArmyFoundation';
import { FIELD_TRACKS, FIELD_TRACK_LABELS, type FieldTrack, type MusicSettings } from './music';
import { getLocale, translateText } from './locale';
import { escapeHtml } from './strings';

const trackFor = (value: unknown) => FIELD_TRACKS.find((track) => track === value);

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
    FIELD_TRACKS.map((id) => `<option value="${id}" ${track === id ? 'selected' : ''}>${escapeHtml(translateText(FIELD_TRACK_LABELS[id]))}</option>`).join('');
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
