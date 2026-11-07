import { groundUnit, tacticalFeatures, tacticalEnabled, weatherAt, isDeployedUnit, type GameState, type PlayerId } from '../game';
import { prepareAmbush, toggleDive } from '../game/tacticalActions';
import { weaponsForUnit } from '../game/weapons';
import { getLocale } from './locale';

export const DEFAULT_TACTICAL_PRESET = true;

export function renderTacticalPreset(selected: boolean): string {
  const en = getLocale() === 'en';
  return `<section class="tactics-settings"><label><input type="checkbox" id="title-tactical-preset" ${selected ? 'checked' : ''}> ${en ? 'Combined tactics (on by default)' : '統合戦術（標準ON）'}</label><p>${en ? 'Simultaneous fire, prepared ambush, terrain cover, forecast weather, ground ZOC and submarines. On by default for new standalone matches; turn off for the original setup. Campaigns, daily challenges and basic training keep their own rules. Map variants have separate records.' : '同時射撃・待伏せ・地形防御・天候予報・地上ZOC・潜航。新しい通常戦・単体作戦で標準ON。OFFで従来設定。キャンペーン・日替わり・基本訓練は専用ルールを使い、マップ差分は別の戦績として扱います。'}</p></section>`;
}
export function renderTacticalControls(state: GameState, player: PlayerId, selected: string | undefined, canAct: boolean): string {
  if (!state.tactics) return '';
  const en = getLocale() === 'en';
  const weather = (round: number) => (weatherAt(state, round) === 'rain' ? (en ? 'Rain: vision −1 (minimum 1)' : '雨：視界−1（最低1）') : en ? 'Clear' : '晴れ');
  const unit = state.units.find((u) => u.id === selected && u.owner === player && isDeployedUnit(u));
  const ready = canAct && !!unit && !unit.hasMoved && !unit.hasActed;
  const slot = unit ? weaponsForUnit(unit.kind, state).findIndex((_, i) => prepareAmbush(state, unit.id, i === 0 ? 0 : 1).ok) : -1;
  const ambush =
    unit && groundUnit(unit) && tacticalEnabled(state, 'ambush')
      ? `<button id="tactical-ambush" data-slot="${slot}" ${!ready || slot < 0 ? 'disabled' : ''}>${en ? 'Prepare ambush' : '待伏せ準備'}</button>`
      : '';
  const dive =
    unit?.kind === 'submarine'
      ? `<button id="tactical-dive" ${!ready || !toggleDive(state, unit.id).ok ? 'disabled' : ''}>${unit.submerged ? (en ? 'Surface' : '浮上') : en ? 'Submerge' : '潜航'}</button><span>${en ? 'Submerged turns' : '潜航経過'} ${Number(unit.diveTurns ?? 0)}/3</span>`
      : '';
  const status = unit?.ambush !== undefined ? (en ? 'Ambush prepared until next own turn' : '待伏せ準備中：次の自軍手番で解除') : '';
  const draw = state.draw ? `<strong role="status">${en ? 'Draw — mutual terminal objectives' : '引き分け：双方の終局条件が同時成立'}</strong>` : '';
  const descriptions = {
    simultaneous: en
      ? `Adjacent direct fire uses starting HP, initiative +${Number(state.tactics.options.initiative ?? 3)}%.`
      : `隣接直接射撃は開始HPで同時解決、攻撃側+${Number(state.tactics.options.initiative ?? 3)}%。`,
    ambush: en
      ? 'Prepared ambush fires once at an initially unseen route contact; no automatic return fire.'
      : '待伏せは移動開始時に未視認だった経路上の実接触で1回射撃し、自動反撃を受けません。',
    terrain: en
      ? `Ground mountain cover +5 points${state.tactics.options.plainCover ? ', plains +5 points' : ''}, capped at 45%.`
      : `地上の山防御+5ポイント${state.tactics.options.plainCover ? '、平原+5ポイント' : ''}、上限45%。`,
    weather: en
      ? 'Rain reduces sight by 1 (minimum 1); sonar, movement costs and flight permission are unchanged.'
      : '雨は視界−1（最低1）。ソナー・移動コスト・飛行可否は変えません。',
    zoc: en
      ? 'Orange outlines show visible ground ZOC. Entering ends movement; leaving the starting cell is allowed.'
      : '橙の点線は視認済み地上ZOC。進入で移動終了、開始マスからは離脱可能。',
    submarines: en
      ? 'Destroyers detect submerged contacts within 3 tiles; submarines within 2. Diving spends the action; surface after 3 own starts or entering port. One unit per cell.'
      : '潜航艦は駆逐艦3マス・潜水艦2マスで探知。潜航は行動を消費し、自軍開始3回か入港で浮上。1マス1部隊。',
  };
  return `<section class="tactics-status" aria-label="${en ? 'Tactical rules' : '統合戦術'}"><strong>${en ? 'Combined tactics' : '統合戦術'}</strong><span>${weather(state.turn)}</span><span>${en ? 'Next round' : '次ラウンド'}: ${weather(state.turn + 1)}</span>${draw}${ambush}${dive}<span>${status}</span><details><summary>${en ? 'Rules' : 'ルール説明'}</summary><p>${tacticalFeatures
    .filter((key) => state.tactics!.options[key])
    .map((key) => descriptions[key])
    .join(
      ' ',
    )} ${en ? 'Unloaded units act next turn. ZOC stops and unloading do not themselves fire an ambush.' : '降車した部隊は次手番から行動します。ZOC停止や降車自体では待伏せを発射しません。'}</p></details></section>`;
}
