import { describe, expect, it } from 'vitest';
import { renderBriefingOverlay, renderCampaignOverlay, renderGameOverOverlay, renderHandoffOverlay, renderProductionCard, renderUnitActionCluster } from './overlays';

describe('overlay renderers', () => {
  it('escapes dynamic game-over and campaign content at the shared UI boundary', () => {
    const result = renderGameOverOverlay({
      visible: true,
      winner: 'red',
      mapName: '<map>',
      difficultyName: 'normal',
      campaignResult: '',
      campaignActions: '',
      summary: { winner: 'red', turns: 4, kills: { red: 2, blue: 1 }, captures: { red: 1, blue: 0 } },
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
      summary: { winner: 'blue', turns: 9, kills: { red: 1, blue: 2 }, captures: { red: 0, blue: 1 } },
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
        conditionHeadings: { victory: '赤軍の勝利条件', defeat: '青軍の勝利条件' },
      });

    expect(briefing(false)).toContain('value="hotseat" checked');
    expect(briefing(false)).toContain('赤軍の勝利条件');
    expect(briefing(true)).not.toContain('match-mode');
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
