import { armyPolicies, type ArmyPolicies } from '../game/armyPolicy';
import { getLocale } from './locale';

export function renderArmyPolicies(policies: ArmyPolicies, spectate: boolean): string {
  const en = getLocale() === 'en';
  const labels = en ? ['Balanced', 'Offensive', 'Defensive'] : ['均衡', '攻勢', '守勢'];
  return `<section class="army-policies"><strong>${en ? 'CPU army policy' : 'CPUの軍方針'}</strong><p>${en ? 'Changes tactical priorities independently of difficulty. Fixed at deployment.' : '難易度とは別に戦術の傾向を選びます。出撃後は変更できません。'}</p>${(spectate ? (['red', 'blue'] as const) : (['blue'] as const)).map((side) => `<label>${en ? (side === 'red' ? 'Red' : 'Blue') : side === 'red' ? '赤軍' : '青軍'}<select data-army-policy="${side}">${armyPolicies.map((policy, index) => `<option value="${policy}" ${policies[side] === policy ? 'selected' : ''}>${labels[index]}</option>`).join('')}</select></label>`).join('')}</section>`;
}
