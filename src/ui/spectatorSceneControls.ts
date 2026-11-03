import { getLocale } from './locale';

/** Controls live inside the active dialog so the modal cannot trap them behind it. */
export function renderSpectatorSceneControls(): string {
  const en = getLocale() === 'en';
  return `<div class="spectate-scene-controls"><button id="spectate-scene-pause" type="button">${en ? 'Pause spectating' : '観戦を一時停止'}</button><button id="spectate-scene-menu" type="button">${en ? 'Pause and open menu' : '停止して観戦メニュー'}</button></div>`;
}
