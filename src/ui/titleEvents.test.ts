import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maps } from '../game';
import { CURRENT_RULE_VERSION } from '../game/types';
import type { DailyRecords } from '../game/dailyChallenge';
import type { ScenarioDefinition } from '../game/maps';
import { setLocale } from './locale';
import { defaultMusicSettings } from './music';
import { ScreenController } from './screenController';
import { bindTitleEvents, installTitleDelegation, type TitleEventDeps } from './titleEvents';
import { buildTitleOverlay, TitleState } from './titleScreen';

const custom: ScenarioDefinition = { ...maps[0]!, id: 'custom-a', name: 'Custom A' };
const dailyRecords: DailyRecords = {
  schemaVersion: 1,
  records: [{ date: '2026-04-30', generation: 'd1', ruleVersion: CURRENT_RULE_VERSION, bestTurns: 9, bestLosses: 2, updatedAt: '2026-04-30T00:00:00.000Z' }],
};

interface Harness {
  app: HTMLDivElement;
  screens: ScreenController;
  state: TitleState;
  deps: TitleEventDeps;
  focus: string[];
  message: { value: string };
  draw: () => void;
}

function harness(options: { resumable?: boolean; scenarios?: ScenarioDefinition[] } = {}): Harness {
  document.body.innerHTML = '<div id="app"></div>';
  const app = document.querySelector<HTMLDivElement>('#app')!;
  const screens = new ScreenController();
  screens.open('title');
  const state = new TitleState(screens);
  state.resumable = options.resumable ?? false;
  const focus: string[] = [];
  const message = { value: '' };
  let scenarios = options.scenarios ?? [...maps, custom];
  const deps: TitleEventDeps = {
    screens,
    state,
    render: vi.fn(),
    setFocus: vi.fn((selector: string) => {
      focus.push(selector);
    }),
    confirmReplaceMatch: vi.fn(() => true),
    scenarios: () => scenarios,
    scenarioExists: vi.fn((id: string) => scenarios.some((map) => map.id === id)),
    deleteCustomMap: vi.fn((id: string) => {
      scenarios = scenarios.filter((map) => map.id !== id);
      return { ok: true as const, value: undefined };
    }),
    saveGeneratedMap: vi.fn((generated: ScenarioDefinition) => ({ ok: true as const, value: generated })),
    startGeneratedMap: vi.fn(),
    startMap: vi.fn(),
    startDaily: vi.fn(),
    continueSave: vi.fn(() => true),
    message: () => message.value,
    openCampaign: vi.fn(),
    openEditor: vi.fn(),
    isCampaignRun: vi.fn(() => false),
    chooseReplayFile: vi.fn(),
    previewMusic: vi.fn(),
    operationRecords: { reset: vi.fn(), delete: vi.fn() },
    dailyRecords: { reset: vi.fn(), delete: vi.fn() },
  };
  const draw = () => {
    app.innerHTML = buildTitleOverlay({
      state,
      titleOpen: screens.titleOpen,
      replayMode: false,
      campaignMenuOpen: false,
      editorOpen: false,
      scenarios: () => scenarios,
      selectedMapId: maps[0]!.id,
      mapPreview: () => '',
      operationCatalog: undefined,
      operationNotice: '',
      dailyCatalog: dailyRecords,
      dailyNotice: '',
      dailyClock: () => new Date('2026-05-01T12:00:00Z'),
      savePicker: () => '',
      cpuSpeed: 1,
      boardZoom: { index: 0, automatic: true },
      musicSettings: defaultMusicSettings,
      canContinue: true,
      storagePersistent: true,
      hasStoredSave: () => false,
    });
    bindTitleEvents(app, deps);
  };
  draw();
  return { app, screens, state, deps, focus, message, draw };
}

const click = (selector: string, root: ParentNode = document) => root.querySelector<HTMLElement>(selector)!.click();
const change = (selector: string, value: string) => {
  const element = document.querySelector<HTMLSelectElement | HTMLInputElement>(selector)!;
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
};
const toggle = (selector: string, open: boolean) => {
  const details = document.querySelector<HTMLDetailsElement>(selector)!;
  details.open = open;
  details.dispatchEvent(new Event('toggle'));
};

beforeEach(() => setLocale('ja'));
afterEach(() => {
  setLocale('ja');
  document.body.innerHTML = '';
});

describe('title map cards', () => {
  it('starts the chosen map and leaves the title', () => {
    const h = harness({ resumable: true });
    click(`.title-map-card[data-map-id="${maps[1]!.id}"]`);
    expect(h.deps.confirmReplaceMatch).toHaveBeenCalledTimes(1);
    expect(h.deps.startMap).toHaveBeenCalledWith(maps[1]!.id);
    expect(h.screens.titleOpen).toBe(false);
    expect(h.state.resumable).toBe(false);
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the player keeps the running match', () => {
    const h = harness({ resumable: true });
    vi.mocked(h.deps.confirmReplaceMatch).mockReturnValue(false);
    click('.title-map-card');
    expect(h.deps.startMap).not.toHaveBeenCalled();
    expect(h.screens.titleOpen).toBe(true);
    expect(h.state.resumable).toBe(true);
    expect(h.deps.render).not.toHaveBeenCalled();
  });

  it('ignores a card that arrives after the title closed', () => {
    const h = harness();
    h.screens.titleOpen = false;
    click('.title-map-card');
    expect(h.deps.confirmReplaceMatch).not.toHaveBeenCalled();
    expect(h.deps.startMap).not.toHaveBeenCalled();
  });

  it('ignores a map that no longer exists', () => {
    const h = harness();
    vi.mocked(h.deps.scenarioExists).mockReturnValue(false);
    click('.title-map-card');
    expect(h.deps.confirmReplaceMatch).not.toHaveBeenCalled();
    expect(h.deps.startMap).not.toHaveBeenCalled();
    expect(h.screens.titleOpen).toBe(true);
  });
});

describe('custom map deletion', () => {
  it('reports the deletion and moves focus to the neighbouring card', () => {
    const h = harness();
    click('[data-delete-custom-map="custom-a"]');
    expect(h.deps.deleteCustomMap).toHaveBeenCalledWith('custom-a');
    expect(h.state.notice).toBe('「Custom A」をマップ一覧から削除しました。');
    expect(h.focus).toEqual([`.title-map-card[data-map-id="${maps[maps.length - 1]!.id}"]`]);
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the player declines', () => {
    const h = harness();
    vi.mocked(h.deps.deleteCustomMap).mockReturnValue(undefined);
    click('[data-delete-custom-map="custom-a"]');
    expect(h.state.notice).toBe('');
    expect(h.focus).toEqual([]);
    expect(h.deps.render).not.toHaveBeenCalled();
  });

  it('keeps focus on the delete button and shows the error when deletion fails', () => {
    const h = harness();
    vi.mocked(h.deps.deleteCustomMap).mockReturnValue({ ok: false, error: '削除できませんでした。' });
    click('[data-delete-custom-map="custom-a"]');
    expect(h.state.notice).toBe('削除できませんでした。');
    expect(h.focus).toEqual(['#title-delete-custom-a']);
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('ignores a deletion after the title closed', () => {
    const h = harness();
    h.screens.titleOpen = false;
    click('[data-delete-custom-map="custom-a"]');
    expect(h.deps.deleteCustomMap).not.toHaveBeenCalled();
  });
});

describe('map generator', () => {
  it('keeps the form values and open state the player sets', () => {
    const h = harness();
    toggle('#title-generator', true);
    change('#title-generator-size', '24');
    change('#title-generator-sea', 'ocean');
    change('#title-generator-preset', 'frontline');
    expect(h.state.generatorOpen).toBe(true);
    expect(h.state.generatorForm).toMatchObject({ size: 24, sea: 'ocean', preset: 'frontline' });
    toggle('#title-generator', false);
    expect(h.state.generatorOpen).toBe(false);
  });

  it('saves the generated map and starts it', () => {
    const h = harness({ resumable: true });
    h.state.generatorNotice = '前回のエラー';
    click('#title-generator-create');
    expect(h.deps.saveGeneratedMap).toHaveBeenCalledTimes(1);
    expect(h.deps.startGeneratedMap).toHaveBeenCalledTimes(1);
    expect(h.state.generatorOpen).toBe(true);
    expect(h.state.generatorNotice).toBe('');
    expect(h.screens.titleOpen).toBe(false);
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('shows the generator error and focuses the seed when the form is rejected', () => {
    const h = harness();
    h.state.generatorForm.seed = 'bad seed!';
    click('#title-generator-create');
    expect(h.state.generatorNotice).not.toBe('');
    expect(h.focus).toEqual(['#title-generator-seed']);
    expect(h.deps.saveGeneratedMap).not.toHaveBeenCalled();
    expect(h.deps.startGeneratedMap).not.toHaveBeenCalled();
    expect(h.screens.titleOpen).toBe(true);
    expect(h.state.generatorOpen).toBe(true);
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('shows the save error and focuses the create button when the map cannot be stored', () => {
    const h = harness();
    vi.mocked(h.deps.saveGeneratedMap).mockReturnValue({ ok: false, error: '保存領域が足りません。' });
    click('#title-generator-create');
    expect(h.state.generatorNotice).toBe('保存領域が足りません。');
    expect(h.focus).toEqual(['#title-generator-create']);
    expect(h.deps.startGeneratedMap).not.toHaveBeenCalled();
    expect(h.screens.titleOpen).toBe(true);
  });

  it('does nothing when the player keeps the running match', () => {
    const h = harness();
    vi.mocked(h.deps.confirmReplaceMatch).mockReturnValue(false);
    click('#title-generator-create');
    expect(h.deps.saveGeneratedMap).not.toHaveBeenCalled();
    expect(h.state.generatorOpen).toBe(false);
    expect(h.deps.render).not.toHaveBeenCalled();
  });

  it('ignores creation after the title closed', () => {
    const h = harness();
    h.screens.titleOpen = false;
    click('#title-generator-create');
    expect(h.deps.confirmReplaceMatch).not.toHaveBeenCalled();
    expect(h.deps.saveGeneratedMap).not.toHaveBeenCalled();
  });
});

describe('title actions', () => {
  it('resumes the match', () => {
    const h = harness({ resumable: true });
    click('#title-resume');
    expect(h.screens.titleOpen).toBe(false);
    expect(h.state.resumable).toBe(false);
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('leaves the title when the saved game loads', () => {
    const h = harness({ resumable: true });
    h.state.setNotice('古い通知');
    click('#title-continue');
    expect(h.screens.titleOpen).toBe(false);
    expect(h.state.notice).toBe('');
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('stays on the title and shows why when the saved game does not load', () => {
    const h = harness({ resumable: true });
    vi.mocked(h.deps.continueSave).mockReturnValue(false);
    h.message.value = 'セーブデータが壊れています。';
    click('#title-continue');
    expect(h.screens.titleOpen).toBe(true);
    expect(h.state.resumable).toBe(true);
    expect(h.state.notice).toBe('セーブデータが壊れています。');
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('opens the campaign and comes back to the title afterwards', () => {
    const h = harness({ resumable: true });
    click('#title-campaign');
    expect(h.deps.openCampaign).toHaveBeenCalledTimes(1);
    expect(h.screens.titleOpen).toBe(false);
    expect(h.state.returnsToTitle).toBe(true);
    h.state.backToTitleIfOpenedThere();
    expect(h.screens.titleOpen).toBe(true);
    expect(h.state.resumable).toBe(true);
  });

  it('opens the editor and comes back to the title afterwards', () => {
    const h = harness();
    click('#title-editor');
    expect(h.deps.openEditor).toHaveBeenCalledTimes(1);
    expect(h.screens.titleOpen).toBe(false);
    expect(h.state.returnsToTitle).toBe(true);
  });

  it('opens the replay file chooser and hands the chosen file on', () => {
    const h = harness();
    const input = document.querySelector<HTMLInputElement>('#title-replay-file')!;
    const picker = vi.spyOn(input, 'click');
    click('#title-import-replay');
    expect(picker).toHaveBeenCalledTimes(1);
    input.dispatchEvent(new Event('change'));
    expect(h.deps.chooseReplayFile).toHaveBeenCalledTimes(1);
  });

  it('starts the daily challenge', () => {
    const h = harness();
    click('#daily-start');
    expect(h.deps.startDaily).toHaveBeenCalledTimes(1);
  });

  it('plays the army preview and remembers which one', () => {
    const h = harness();
    click('#title-music-preview-blue');
    expect(h.deps.previewMusic).toHaveBeenCalledWith('blue');
    expect(h.state.musicPreviewArmy).toBe('blue');
    click('#title-music-preview-red');
    expect(h.deps.previewMusic).toHaveBeenLastCalledWith('red');
    expect(h.state.musicPreviewArmy).toBe('red');
  });

  it('remembers the sound panel being opened or closed', () => {
    const h = harness();
    toggle('#title-music-settings', true);
    expect(h.state.musicOpen).toBe(true);
    toggle('#title-music-settings', false);
    expect(h.state.musicOpen).toBe(false);
  });
});

describe('briefing back to the title', () => {
  function withBriefing(h: Harness): void {
    h.screens.open('briefing');
    const back = document.createElement('button');
    back.id = 'briefing-back-to-title';
    h.app.append(back);
    bindTitleEvents(h.app, h.deps);
  }

  it('returns to the title without a match to resume', () => {
    const h = harness({ resumable: true });
    withBriefing(h);
    h.state.setNotice('x');
    click('#briefing-back-to-title');
    expect(h.screens.titleOpen).toBe(true);
    expect(h.screens.briefingOpen).toBe(false);
    expect(h.state.resumable).toBe(false);
    expect(h.state.notice).toBe('');
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('stays in the briefing during a campaign operation', () => {
    const h = harness();
    withBriefing(h);
    vi.mocked(h.deps.isCampaignRun).mockReturnValue(true);
    click('#briefing-back-to-title');
    expect(h.screens.briefingOpen).toBe(true);
    expect(h.deps.render).not.toHaveBeenCalled();
  });
});

describe('record panels', () => {
  it('hands the operation record buttons to the owner of the records', () => {
    const h = harness();
    click('#operation-records-reset');
    expect(h.deps.operationRecords.reset).toHaveBeenCalledTimes(1);
    const button = document.createElement('button');
    button.dataset.recordDelete = '3';
    h.app.append(button);
    bindTitleEvents(h.app, h.deps);
    button.click();
    expect(h.deps.operationRecords.delete).toHaveBeenCalledWith(3);
    toggle('#operation-records', true);
    expect(h.state.operationRecordsOpen).toBe(true);
  });

  it('hands the daily record buttons on and remembers the panel', () => {
    const h = harness();
    click('#daily-records-reset');
    expect(h.deps.dailyRecords.reset).toHaveBeenCalledTimes(1);
    click('[data-daily-delete]');
    expect(h.deps.dailyRecords.delete).toHaveBeenCalledWith('2026-04-30');
    toggle('#daily-records', true);
    expect(h.state.dailyRecordsOpen).toBe(true);
    toggle('#daily-records', false);
    expect(h.state.dailyRecordsOpen).toBe(false);
  });
});

describe('binding after every redraw', () => {
  it('runs one handler per click however often the title is redrawn', () => {
    const h = harness({ resumable: true });
    h.draw();
    h.draw();
    click('#title-continue');
    h.screens.open('title');
    click('.title-map-card');
    h.screens.open('title');
    click('#title-generator-create');
    click('#title-music-preview-red');
    click('#daily-start');
    expect(h.deps.continueSave).toHaveBeenCalledTimes(1);
    expect(h.deps.startMap).toHaveBeenCalledTimes(1);
    expect(h.deps.saveGeneratedMap).toHaveBeenCalledTimes(1);
    expect(h.deps.previewMusic).toHaveBeenCalledTimes(1);
    expect(h.deps.startDaily).toHaveBeenCalledTimes(1);
  });

  it('draws every control inside the app so redraws replace them all', () => {
    const h = harness({ resumable: true });
    const selectors = [
      '#title-resume',
      '#title-continue',
      '#title-campaign',
      '#title-editor',
      '#title-import-replay',
      '#title-replay-file',
      '#title-generator-create',
      '#title-music-settings',
      '#daily-start',
      '#daily-records-reset',
      '#operation-records-reset',
      '.title-map-card',
      '[data-delete-custom-map]',
      '[data-daily-delete]',
    ];
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      expect(found.length, selector).toBeGreaterThan(0);
      for (const element of found) expect(h.app.contains(element), selector).toBe(true);
    }
  });

  it('binds nothing when the title is not drawn', () => {
    const h = harness();
    h.screens.titleOpen = false;
    h.draw();
    expect(h.app.innerHTML).toBe('');
    expect(h.deps.render).not.toHaveBeenCalled();
  });
});

describe('installTitleDelegation', () => {
  it('keeps the typed seed across redraws, updated once per input', () => {
    const h = harness();
    const writes: string[] = [];
    let seed = h.state.generatorForm.seed;
    Object.defineProperty(h.state.generatorForm, 'seed', {
      get: () => seed,
      set: (value: string) => {
        writes.push(value);
        seed = value;
      },
    });
    installTitleDelegation(h.app, h.state);
    h.draw();
    h.draw();
    const input = document.querySelector<HTMLInputElement>('#title-generator-seed')!;
    input.value = 'Alpha-2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(writes).toEqual(['Alpha-2']);
    h.draw();
    expect(document.querySelector<HTMLInputElement>('#title-generator-seed')?.value).toBe('Alpha-2');
  });

  it('ignores other inputs', () => {
    const h = harness();
    installTitleDelegation(h.app, h.state);
    const other = document.createElement('input');
    other.id = 'something-else';
    other.value = 'nope';
    h.app.append(other);
    other.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.state.generatorForm.seed).toBe('MiniStr-1');
    const select = document.querySelector<HTMLSelectElement>('#title-generator-size')!;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.state.generatorForm.seed).toBe('MiniStr-1');
  });
});
