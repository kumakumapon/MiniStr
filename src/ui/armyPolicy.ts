import { armyPolicies, type ArmyPolicies } from '../game/armyPolicy';
import type { PlayerId } from '../game/types';
import { getLocale } from './locale';

export function renderArmyPolicies(policies: ArmyPolicies, spectate: boolean, cpuPlayer: PlayerId = 'blue'): string {
  const en = getLocale() === 'en';
  const labels = en ? ['Balanced', 'Offensive', 'Defensive'] : ['均衡', '攻勢', '守勢'];
  return `<section class="army-policies"><strong>${en ? 'CPU army policy' : 'CPUの軍方針'}</strong><p>${en ? 'Changes tactical priorities independently of difficulty. Fixed at deployment.' : '難易度とは別に戦術の傾向を選びます。出撃後は変更できません。'}</p>${(spectate ? (['red', 'blue'] as const) : [cpuPlayer]).map((side) => `<label>${en ? (side === 'red' ? 'Red' : 'Blue') : side === 'red' ? '赤軍' : '青軍'}<select id="briefing-cpu-policy-${side}" data-army-policy="${side}">${armyPolicies.map((policy, index) => `<option value="${policy}" ${policies[side] === policy ? 'selected' : ''}>${labels[index]}</option>`).join('')}</select></label>`).join('')}</section>`;
}

export function renderArmyPolicySummary(policies: ArmyPolicies, spectate: boolean, cpuPlayer: PlayerId = 'blue'): string {
  const en = getLocale() === 'en';
  const labels = en ? { balanced: 'Balanced', offensive: 'Offensive', defensive: 'Defensive' } : { balanced: '均衡', offensive: '攻勢', defensive: '守勢' };
  const sides = spectate ? (['red', 'blue'] as const) : [cpuPlayer];
  return `<p class="army-policy-summary">${sides.map((side) => `${en ? (side === 'red' ? 'Red CPU' : 'Blue CPU') : side === 'red' ? '赤軍CPU' : '青軍CPU'}: ${labels[policies[side]]}`).join(' · ')}</p>`;
}
