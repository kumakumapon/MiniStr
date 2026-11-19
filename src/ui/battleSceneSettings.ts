import { getLocale } from './locale';
import type { BattleSceneMode } from '../game/battleSceneSettings';
export { BATTLE_SCENE_SETTINGS_KEY, loadBattleSceneSettings, saveBattleSceneSetting } from '../game/battleSceneSettings';
export function renderBattleSceneSetting(mode: BattleSceneMode, enabled: boolean, surface?: 'title' | 'overlay'): string {
  const id = `battle-scenes-${mode}${surface ? '-' + surface : ''}`;
  return `<label class="battle-scene-setting"><input id="${id}" data-battle-scenes="${mode}" type="checkbox" ${enabled ? 'checked' : ''}>${getLocale() === 'en' ? (surface === 'title' ? 'Show two-army battle scenes' : 'Show battle scenes') : surface === 'title' ? '2軍のバトルシーンを表示' : 'バトルシーンを表示'}</label>`;
}
