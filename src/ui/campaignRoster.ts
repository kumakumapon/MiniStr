import type { CampaignVeteran } from '../game/campaign';
import { getLocale } from './locale';
import { escapeHtml } from './strings';
import { unitNames } from './labels';

export function renderCampaignRoster(stageId: string, veterans: readonly CampaignVeteran[]): string {
  if (!veterans.length) return '';
  const en = getLocale() === 'en';
  return `<details class="campaign-roster"><summary>${en ? 'Surviving units and callsigns' : '生還部隊とコールサイン'}</summary>${veterans.map((unit, index) => `<label>${escapeHtml(unitNames[unit.kind])} · EXP ${Number(unit.experience)}<input data-user-content data-veteran-stage="${escapeHtml(stageId)}" data-veteran-index="${Number(index)}" maxlength="32" value="${escapeHtml(unit.callsign ?? '')}" aria-label="${en ? 'Callsign' : 'コールサイン'}"></label><button class="save-action campaign-veteran-rename" data-veteran-stage="${escapeHtml(stageId)}" data-veteran-index="${Number(index)}">${en ? 'Save callsign' : '名前を保存'}</button>`).join('')}</details>`;
}
