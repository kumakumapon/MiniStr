import { expect, it, afterEach } from 'vitest';
import { renderArmyPolicies, renderArmyPolicySummary } from './armyPolicy';
import { renderCampaignRoster } from './campaignRoster';
import { defaultArmyPolicies } from '../game/armyPolicy';
import { setLocale } from './locale';

afterEach(() => setLocale('ja'));
it('shows independent army policies in Japanese and English', () => {
  for (const locale of ['ja', 'en'] as const) {
    setLocale(locale);
    document.body.innerHTML = renderArmyPolicies({ red: 'offensive', blue: 'defensive' }, true);
    expect(document.querySelectorAll('select')).toHaveLength(2);
    expect((document.querySelector('[data-army-policy="red"]') as HTMLSelectElement).value).toBe('offensive');
    expect((document.querySelector('[data-army-policy="blue"]') as HTMLSelectElement).value).toBe('defensive');
    document.body.innerHTML = renderArmyPolicies(defaultArmyPolicies(), false);
    expect(document.querySelector('[data-army-policy="red"]')).toBeNull();
    expect(renderArmyPolicySummary({ red: 'offensive', blue: 'defensive' }, true)).toContain(locale === 'en' ? 'Defensive' : '守勢');
  }
});
it('escapes names and offers callsign editing only for actual survivors', () => {
  expect(renderCampaignRoster('skirmish', [])).toBe('');
  document.body.innerHTML = renderCampaignRoster('skirmish', [{ kind: 'infantry', experience: 2, callsign: '<img src=x onerror=alert(1)>' }]);
  expect(document.querySelector('img')).toBeNull();
  expect((document.querySelector('input') as HTMLInputElement).value).toBe('<img src=x onerror=alert(1)>');
  expect(document.querySelector('.campaign-veteran-rename')).not.toBeNull();
});
