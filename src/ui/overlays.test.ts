import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from './locale';
import {
  renderBriefingOverlay,
  renderCampaignOverlay,
  renderGameOverOverlay,
  renderHandoffOverlay,
  renderProductionCard,
  renderTitleOverlay,
  renderUnitActionCluster,
  type TitleMapCard,
} from './overlays';

afterEach(() => setLocale('ja'));

describe('overlay renderers', () => {
  it('escapes dynamic game-over and campaign content at the shared UI boundary', () => {
    const result = renderGameOverOverlay({
      visible: true,
      winner: 'red',
      mapName: '<map>',
      difficultyName: 'normal',
      campaignResult: '',
      campaignActions: '',
      summary: {
        winner: 'red',
        turns: 4,
        kills: { red: 2, blue: 1 },
        captures: { red: 1, blue: 0 },
      },
    });
    const campaign = renderCampaignOverlay(true, 10, '<notice>', '<article>safe markup</article>');

    expect(result).toContain('&lt;map&gt;');
    expect(campaign).toContain('&lt;notice&gt;');
    expect(campaign).toContain('<article>safe markup</article>');
  });

  it('shows how the match ended only when a reason is given', () => {
    const options = {
      visible: true,
      winner: 'red' as const,
      mapName: 'Map',
      difficultyName: 'normal',
      campaignResult: '',
      campaignActions: '',
    };

    expect(renderGameOverOverlay({ ...options, reasonLabel: '判定勝ち' })).toContain('<p class="result-reason">判定勝ち</p>');
    expect(renderGameOverOverlay(options)).not.toContain('result-reason');
  });

  it('renders a handoff screen that names the next side and carries no match data (#116 10.5)', () => {
    document.body.innerHTML = renderHandoffOverlay('青軍');

    expect(document.querySelector('#handoff-title')?.textContent).toBe('青軍の番です');
    expect(document.querySelector('#handoff-start')).not.toBeNull();
    expect(document.querySelector('.tile, .unit, #command-panel')).toBeNull();
  });

  it('names sides by colour on the result screen of a two-player match', () => {
    const result = renderGameOverOverlay({
      visible: true,
      winner: 'blue',
      mapName: 'Map',
      difficultyName: '2人対戦',
      campaignResult: '',
      campaignActions: '',
      sideNames: { red: '赤軍', blue: '青軍' },
      summary: {
        winner: 'blue',
        turns: 9,
        kills: { red: 1, blue: 2 },
        captures: { red: 0, blue: 1 },
      },
    });

    expect(result).toContain('青軍の勝利');
    expect(result).not.toContain('CPU');
  });

  it('offers the match format outside campaigns only', () => {
    const briefing = (campaignRun: boolean) =>
      renderBriefingOverlay({
        visible: true,
        mapName: 'Test',
        briefing: '',
        victoryConditions: ['Win'],
        defeatConditions: ['Lose'],
        startingGold: 0,
        difficultyName: '普通',
        campaignRun,
        matchMode: 'hotseat',
        conditionHeadings: {
          victory: '赤軍の勝利条件',
          defeat: '青軍の勝利条件',
        },
      });

    expect(briefing(false)).toContain('value="hotseat" checked');
    expect(briefing(false)).toContain('赤軍の勝利条件');
    expect(briefing(true)).not.toContain('match-mode');
  });

  it('offers CPU-versus-CPU spectating as a match format (#129)', () => {
    const result = renderBriefingOverlay({
      visible: true,
      mapName: 'Test',
      briefing: '',
      victoryConditions: ['Win'],
      defeatConditions: ['Lose'],
      startingGold: 0,
      difficultyName: '観戦・両軍普通',
      campaignRun: false,
      matchMode: 'spectate',
    });

    expect(result).toContain('value="spectate" checked');
    expect(result).toContain('観戦（CPU同士）');
    expect(result).toContain('value="cpu" ');
    expect(result).toContain('value="hotseat" ');
  });

  it('offers each side’s CPU difficulty only when spectating outside campaigns (#131)', () => {
    const levels = [
      { value: 'easy', label: '易しい' },
      { value: 'hard', label: '難しい' },
    ];
    const briefing = (matchMode: 'cpu' | 'spectate', campaignRun = false) =>
      renderBriefingOverlay({
        visible: true,
        mapName: 'Test',
        briefing: '',
        victoryConditions: ['Win'],
        defeatConditions: ['Lose'],
        startingGold: 0,
        difficultyName: '観戦・赤軍易しい / 青軍難しい',
        campaignRun,
        matchMode,
        spectateDifficulties: { red: 'easy', blue: 'hard', levels },
      });

    const spectating = briefing('spectate');
    expect(spectating).toMatch(/id="briefing-red-difficulty"[^>]*>.*<option value="easy" selected>/);
    expect(spectating).toMatch(/id="briefing-blue-difficulty"[^>]*>.*<option value="hard" selected>/);
    expect(spectating).toContain('観戦・赤軍易しい / 青軍難しい');
    expect(briefing('cpu')).not.toContain('briefing-red-difficulty');
    expect(briefing('spectate', true)).not.toContain('briefing-red-difficulty');
  });

  it('keeps briefing controls and compact game panels stable', () => {
    const briefing = renderBriefingOverlay({
      visible: true,
      mapName: 'Test',
      briefing: 'Briefing',
      victoryConditions: ['Win'],
      defeatConditions: ['Lose'],
      startingGold: 5000,
      difficultyName: '普通',
      campaignRun: false,
    });

    expect(briefing).toContain('id="begin-operation"');
    expect(renderUnitActionCluster(['<button id="wait">wait</button>'])).toContain('unit-action-cluster');
    expect(renderProductionCard('<p>target</p>', '<p>summary</p>', '<button>unit</button>')).toContain('production-grid');
  });
});

describe('title screen (#143)', () => {
  const card = (patch: Partial<TitleMapCard> = {}): TitleMapCard => ({
    id: 'skirmish',
    name: '緑の国境',
    theme: '温帯',
    width: 12,
    height: 8,
    startingGold: 6000,
    victory: '敵部隊を全滅させる',
    custom: false,
    selected: false,
    preview: '',
    ...patch,
  });
  const title = (patch: Partial<Parameters<typeof renderTitleOverlay>[0]> = {}) =>
    renderTitleOverlay({
      visible: true,
      maps: [card()],
      canContinue: false,
      canResume: false,
      notice: '',
      ...patch,
    });

  it('lists each map with the facts needed to compare them', () => {
    const result = title({
      maps: [
        card(),
        card({
          id: 'landing',
          name: '海峡上陸作戦',
          theme: '沿岸',
          turnLimit: 18,
          selected: true,
        }),
      ],
    });
    expect(result).toContain('data-map-id="skirmish"');
    expect(result).toContain('12×8');
    expect(result).toContain('初期資金 6000G');
    expect(result).toContain('ターン制限なし');
    expect(result).toContain('18ターン制限');
    expect(result).toContain('敵部隊を全滅させる');
    expect(result).toMatch(/data-map-id="landing" aria-current="true"/);
    expect(result).not.toMatch(/data-map-id="skirmish" aria-current/);
  });

  it('offers the shared CPU speed on the title without making a game command', () => {
    expect(title()).toContain('id="title-cpu-speed"');
    expect(title()).toContain('<option value="1" selected>1x</option>');
    expect(title({ cpuSpeed: 4 })).toContain('<option value="4" selected>4x</option>');
  });

  it('offers automatic and every manual board zoom on the title', () => {
    expect(title()).toContain('id="title-board-zoom" aria-label="マップ表示サイズ"');
    expect(title()).toContain('<option value="auto" selected>自動</option>');
    for (const [index, value] of [50, 75, 100, 125, 150, 200].entries()) {
      const result = title({ boardZoom: { index, automatic: false } });
      expect(result).toContain(`<option value="${value}" selected>${value}%</option>`);
      expect(result).not.toContain('<option value="auto" selected>');
    }
    expect(title({ boardZoom: { index: 0, automatic: true } })).toContain('<option value="auto" selected>自動</option>');
  });

  it('labels the title zoom in English while keeping percentage values stable', () => {
    setLocale('en');
    expect(title()).toContain('aria-label="Map display size"');
    expect(title()).toContain('<option value="auto" selected>Auto</option>');
    expect(title({ boardZoom: { index: 0, automatic: false } })).toContain('<option value="50" selected>50%</option>');
  });

  it('marks custom maps and escapes their text', () => {
    const result = title({
      maps: [card({ id: 'my-map', name: '<b>自作</b>', custom: true })],
    });
    expect(result).toContain('<em>カスタム</em>');
    expect(result).toContain('&lt;b&gt;自作&lt;/b&gt;');
    expect(result).not.toContain('<b>自作</b>');
    document.body.innerHTML = result;
    expect(document.querySelectorAll('button button')).toHaveLength(0);
    expect(document.querySelector('[data-delete-custom-map="my-map"]')?.getAttribute('aria-label')).toBe('「<b>自作</b>」を削除');
    expect(title()).not.toContain('data-delete-custom-map');
  });

  it('labels custom-map deletion in English while preserving authored Japanese names', () => {
    setLocale('en');
    document.body.innerHTML = title({ maps: [card({ id: 'my-map', name: '戦車', custom: true })] });
    const button = document.querySelector('[data-delete-custom-map]');
    expect(button?.textContent).toBe('Delete map');
    expect(button?.getAttribute('aria-label')).toBe('Delete map "戦車"');
  });

  it('enables continue only with a save and offers to return only when opened from a match', () => {
    expect(title()).toMatch(/id="title-continue" class="save-action" disabled/);
    expect(title({ canContinue: true })).not.toMatch(/id="title-continue" class="save-action" disabled/);
    expect(title()).not.toContain('title-resume');
    expect(title({ canResume: true })).toContain('id="title-resume"');
  });

  it('shows a notice only when there is one, and nothing when hidden', () => {
    expect(title()).not.toContain('title-notice');
    expect(title({ notice: '<読込失敗>' })).toContain('&lt;読込失敗&gt;');
    expect(title({ visible: false })).toBe('');
  });

  it('offers a way back to the title from skirmish briefings only', () => {
    const briefing = (campaignRun: boolean, backToTitle?: boolean) =>
      renderBriefingOverlay({
        visible: true,
        mapName: 'Test',
        briefing: '',
        victoryConditions: ['Win'],
        defeatConditions: ['Lose'],
        startingGold: 0,
        difficultyName: '普通',
        campaignRun,
        backToTitle,
      });
    expect(briefing(false, true)).toContain('id="briefing-back-to-title"');
    expect(briefing(true, true)).not.toContain('briefing-back-to-title');
    expect(briefing(false)).not.toContain('briefing-back-to-title');
  });
});
