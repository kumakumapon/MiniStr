import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_METRICS,
  presetNameKey,
  reconContactLabel,
  renderBattleAnalysis,
  renderMapGenerator,
  renderPresetControls,
  renderReconMarker,
  renderReconPanel,
} from './standaloneSystems';
import type { BattleAnalysis, ReconContact } from '../game/battleHistory';
import { deploymentFingerprint } from '../game/deploymentPresets';
import { operation } from '../game/operations.fixture';

describe('standalone system controls', () => {
  it('renders three side-specific preset slots and escapes names and notices', () => {
    const scenario = operation();
    const catalog = {
      schemaVersion: 1 as const,
      presets: [
        { scenarioId: scenario.id, player: 'red' as const, slot: 0, name: '<img src=x>', fingerprint: deploymentFingerprint(scenario), kinds: ['infantry' as const] },
        { scenarioId: scenario.id, player: 'blue' as const, slot: 0, name: 'Blue saved', fingerprint: deploymentFingerprint(scenario), kinds: ['tank' as const] },
      ],
    };
    document.body.innerHTML = renderPresetControls(scenario.id, 'red', true, { catalog, notice: '<b>Saved</b>', draftNames: { [presetNameKey('red', 1)]: 'Draft' } });
    expect(document.querySelectorAll('.preset-row')).toHaveLength(3);
    expect(document.querySelector('img, b')).toBeNull();
    expect(document.querySelector<HTMLInputElement>('#briefing-preset-red-0-name')?.value).toBe('<img src=x>');
    expect(document.querySelector<HTMLInputElement>('#briefing-preset-red-1-name')?.value).toBe('Draft');
    expect(document.querySelector<HTMLButtonElement>('#briefing-preset-red-0-apply')?.disabled).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('#briefing-preset-red-1-delete')?.disabled).toBe(true);
    expect(document.body.textContent).not.toContain('Blue saved');
    document.body.innerHTML = renderPresetControls(scenario.id, 'blue', false, { catalog, notice: '', draftNames: {} });
    expect(document.querySelector<HTMLButtonElement>('#briefing-preset-blue-0-save')?.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#briefing-preset-blue-0-name')?.value).toBe('Blue saved');
  });
  it('offers explicit preset recovery for unreadable data', () => {
    document.body.innerHTML = renderPresetControls('a', 'red', true, { notice: 'Broken <script>', draftNames: {} });
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Broken <script>');
    expect(document.querySelector('[data-presets-reset]')).not.toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });
  it.each(['none', 'coast', 'ocean'])('exposes reproducible generation settings for %s', (sea) => {
    document.body.innerHTML = renderMapGenerator({ size: 16, sea, seed: 'seed-1' }, '', false);
    expect(document.querySelector('details')?.open).toBe(false);
    expect(document.querySelectorAll('#title-generator-size option')).toHaveLength(3);
    expect(document.querySelector<HTMLSelectElement>('#title-generator-sea')?.value).toBe(sea);
    expect(document.querySelector<HTMLInputElement>('#title-generator-seed')?.maxLength).toBe(24);
    expect(document.querySelector('#title-generator-create')).not.toBeNull();
    document.body.innerHTML = renderMapGenerator({ size: 24, sea, seed: '"><img src=x>' }, '<bad>', true);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('details')?.open).toBe(true);
    expect(document.querySelector('[role=alert]')?.textContent).toBe('<bad>');
  });
  it('labels stale positions as old observations and offers location controls', () => {
    const contact: ReconContact = { id: 'b1', kind: 'tank', position: { x: 2, y: 3 }, turn: 4, phase: 'blue' };
    expect(reconContactLabel(contact)).toContain('4ターン目青軍手番');
    document.body.innerHTML = renderReconMarker(contact) + renderReconPanel([contact], true, true);
    expect(document.querySelector('.recon-contact')?.textContent).toContain('最終 T4');
    expect(document.querySelector('.unit')).toBeNull();
    expect(document.querySelector('[data-recon-x="2"][data-recon-y="3"]')?.textContent).toContain('現在位置は不明');
    expect(document.querySelector<HTMLInputElement>('#recon-markers')?.checked).toBe(true);
    document.body.innerHTML = renderReconPanel([], false, false);
    expect(document.querySelector('details')?.open).toBe(false);
    expect(document.body.textContent).toContain('記録はありません');
    expect(document.querySelector<HTMLInputElement>('#recon-markers')?.checked).toBe(false);
    expect(reconContactLabel({ ...contact, phase: 'red' })).toContain('赤軍手番');
  });
  it.each(ANALYSIS_METRICS)('renders accessible %s trends, data tables and turn summaries', (metric) => {
    const analysis: BattleAnalysis = {
      samples: [
        { turn: 1, red: { units: 5, income: 2000, losses: 0 }, blue: { units: 4, income: 1000, losses: 1 } },
        { turn: 2, red: { units: 4, income: 3000, losses: 1 }, blue: { units: 3, income: 2000, losses: 2 } },
      ],
      summaries: [{ turn: 1, attacks: 3, produced: 1, captured: 1, evacuated: 2, losses: { red: 1, blue: 2 } }],
    };
    document.body.innerHTML = renderBattleAnalysis(analysis, metric, true);
    expect(document.querySelector('[role=img]')?.getAttribute('aria-label')).toContain('下の表');
    expect(document.querySelectorAll('polyline')).toHaveLength(2);
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(document.querySelector('.analysis-summary')?.textContent).toContain('T1：攻撃3・生産1・占領1・撤退2');
    expect(document.querySelector<HTMLSelectElement>('#analysis-metric')?.value).toBe(metric);
    expect(document.body.innerHTML).not.toMatch(/NaN|Infinity/);
    document.body.innerHTML = renderBattleAnalysis({ samples: [], summaries: [] }, metric, false);
    expect(document.querySelector('details')?.open).toBe(false);
    expect(document.body.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(renderBattleAnalysis(undefined, metric, true)).toBe('');
  });
});
