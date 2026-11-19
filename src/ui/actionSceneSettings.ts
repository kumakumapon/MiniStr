import { getLocale } from './locale';
import type { ActionSceneMode } from '../game/actionSceneSettings';
export { ACTION_SCENE_SETTINGS_KEY, loadActionSceneSettings, saveActionSceneSetting } from '../game/actionSceneSettings';
export function renderActionSceneSetting(mode: ActionSceneMode, enabled: boolean, surface?: 'title' | 'overlay'): string {
  const id = `action-scenes-${mode}${surface ? '-' + surface : ''}`;
  return `<label class="battle-scene-setting action-scene-setting"><input id="${id}" data-action-scenes="${mode}" type="checkbox" ${enabled ? 'checked' : ''}>${getLocale() === 'en' ? (surface === 'title' ? 'Show two-army capture & supply scenes' : 'Show capture & supply scenes') : surface === 'title' ? '2軍の占領・補給演出を表示' : '占領・補給演出を表示'}</label>`;
}
