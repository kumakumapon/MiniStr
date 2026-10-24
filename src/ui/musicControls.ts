import { defaultMusicSettings, FIELD_TRACKS, FIELD_TRACK_LABELS, type MusicSettings } from './music';
import { getLocale, translateText } from './locale';

export function renderMusicControls(settings: MusicSettings = defaultMusicSettings, prefix = 'music', preview = false): string {
  const en = getLocale() === 'en';
  const options = (selected: string) =>
    FIELD_TRACKS.map((track) => `<option value="${track}" ${track === selected ? 'selected' : ''}>${translateText(FIELD_TRACK_LABELS[track])}</option>`).join('');
  return `<section class="music-controls" aria-label="${en ? 'BGM settings' : 'BGM設定'}">
    <label><input id="${prefix}-muted" type="checkbox" ${settings.muted ? '' : 'checked'}> BGM</label>
    <label>${en ? 'BGM volume' : 'BGM音量'} <input id="${prefix}-volume" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}" aria-label="${en ? 'BGM volume' : 'BGMの音量'}"></label>
    <label><input id="${prefix}-army-tracks" type="checkbox" ${settings.armyTracks ? 'checked' : ''}> ${en ? 'Switch by army turn' : '手番で曲を切り替える'}</label>
    <label>${en ? 'Red army / shared track' : '赤軍・共通曲'} <select id="${prefix}-track" aria-label="${en ? 'Red army or shared BGM track' : '赤軍または共通のBGM曲'}">${options(settings.fieldTrack)}</select></label>
    <label>${en ? 'Blue army track' : '青軍の曲'} <select id="${prefix}-blue-track" aria-label="${en ? 'Blue army BGM track' : '青軍のBGM曲'}" ${settings.armyTracks ? '' : 'disabled'}>${options(settings.blueFieldTrack)}</select></label>
    ${preview ? `<div class="music-preview-actions"><button id="title-music-preview-red" class="save-action">${en ? 'Preview red army' : '赤軍の曲を試聴'}</button><button id="title-music-preview-blue" class="save-action">${en ? 'Preview blue army' : '青軍の曲を試聴'}</button></div>` : ''}
    <p class="music-hint">${en ? 'Different tracks make turn changes audible. Shared mode keeps one track playing. Battle scenes use their own short cue. Playback starts after an interaction.' : '別々の曲を選ぶと手番の交代が音でも分かります。共通方式では同じ曲を継続。戦闘中は専用の短い曲になります。操作後に再生を開始します。'}</p>
    <p class="music-settings-notice" role="status"></p>
  </section>`;
}

/** Update both surfaces without replacing a focused select or range mid-drag. */
export function syncMusicControls(root: ParentNode, settings: MusicSettings): void {
  for (const prefix of ['music', 'title-music']) {
    const muted = root.querySelector<HTMLInputElement>(`#${prefix}-muted`);
    const volume = root.querySelector<HTMLInputElement>(`#${prefix}-volume`);
    const army = root.querySelector<HTMLInputElement>(`#${prefix}-army-tracks`);
    const red = root.querySelector<HTMLSelectElement>(`#${prefix}-track`);
    const blue = root.querySelector<HTMLSelectElement>(`#${prefix}-blue-track`);
    if (muted) muted.checked = !settings.muted;
    if (volume) volume.value = String(Math.round(settings.volume * 100));
    if (army) army.checked = settings.armyTracks;
    if (red) red.value = settings.fieldTrack;
    if (blue) {
      blue.value = settings.blueFieldTrack;
      blue.disabled = !settings.armyTracks;
    }
  }
}
