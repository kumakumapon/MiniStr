import { afterEach, describe, expect, it, vi } from 'vitest';
import { maps } from '../game';
import type { DailyRecords } from '../game/dailyChallenge';
import { setLocale } from './locale';
import { defaultMusicSettings } from './music';
import { ScreenController } from './screenController';
import { uiText } from './strings';
import { buildTitleOverlay, TitleState, type TitleOverlayContext } from './titleScreen';

afterEach(() => setLocale('ja'));

function openTitle(): { screens: ScreenController; state: TitleState } {
  const screens = new ScreenController();
  screens.open('title');
  return { screens, state: new TitleState(screens) };
}

describe('TitleState transitions', () => {
  it('leaving the title clears the way back to the match and the notice', () => {
    const { screens, state } = openTitle();
    state.resumable = true;
    state.setNotice('読み込めませんでした。');
    state.leaveTitle();
    expect(screens.titleOpen).toBe(false);
    expect(state.resumable).toBe(false);
    expect(state.notice).toBe('');
  });

  it('opening from a match offers to resume it and drops an old notice', () => {
    const screens = new ScreenController();
    screens.open('battle');
    const state = new TitleState(screens);
    state.setNotice('古い通知');
    state.openFromMatch();
    expect(screens.titleOpen).toBe(true);
    expect(state.resumable).toBe(true);
    expect(state.notice).toBe('');
  });

  it('opening from the briefing closes it and has no match to resume', () => {
    const screens = new ScreenController();
    screens.open('briefing');
    const state = new TitleState(screens);
    state.resumable = true;
    state.openFromBriefing();
    expect(screens.briefingOpen).toBe(false);
    expect(screens.titleOpen).toBe(true);
    expect(state.resumable).toBe(false);
  });

  it('returns to the title with the resume option restored after a screen opened from it closes', () => {
    const { screens, state } = openTitle();
    state.resumable = true;
    state.leaveTitleAndReturn();
    expect(screens.titleOpen).toBe(false);
    expect(state.resumable).toBe(false);
    expect(state.returnsToTitle).toBe(true);
    screens.editorOpen = true;
    screens.editorOpen = false;
    state.backToTitleIfOpenedThere();
    expect(screens.titleOpen).toBe(true);
    expect(state.resumable).toBe(true);
    expect(state.returnsToTitle).toBe(false);
  });

  it('restores a title that had no match to resume as it was', () => {
    const { state } = openTitle();
    state.leaveTitleAndReturn();
    state.backToTitleIfOpenedThere();
    expect(state.resumable).toBe(false);
  });

  it('shows the title only once when the closing handler runs twice', () => {
    const { screens, state } = openTitle();
    state.resumable = true;
    state.leaveTitleAndReturn();
    state.backToTitleIfOpenedThere();
    state.leaveTitle();
    // A second close, say a duplicate Escape, must not pull the player back.
    state.backToTitleIfOpenedThere();
    expect(screens.titleOpen).toBe(false);
    expect(state.resumable).toBe(false);
  });

  it('does nothing when the screen was not opened from the title', () => {
    const screens = new ScreenController();
    screens.open('editor');
    const state = new TitleState(screens);
    state.backToTitleIfOpenedThere();
    expect(screens.current).toBe('editor');
    expect(state.resumable).toBe(false);
  });

  it('does not come back to the title once a match started from the screen it opened', () => {
    const { screens, state } = openTitle();
    state.resumable = true;
    state.leaveTitleAndReturn();
    state.clearReturn();
    state.backToTitleIfOpenedThere();
    expect(screens.titleOpen).toBe(false);
    expect(state.resumable).toBe(false);
  });

  it('lets a later return forget the resume option of an earlier one', () => {
    const { state } = openTitle();
    state.resumable = true;
    state.leaveTitleAndReturn();
    state.backToTitleIfOpenedThere();
    state.leaveTitle();
    state.leaveTitleAndReturn();
    state.backToTitleIfOpenedThere();
    expect(state.resumable).toBe(false);
  });
});

function context(state: TitleState, screens: ScreenController, overrides: Partial<TitleOverlayContext> = {}): TitleOverlayContext {
  return {
    state,
    titleOpen: screens.titleOpen,
    replayMode: false,
    campaignMenuOpen: false,
    editorOpen: false,
    scenarios: () => maps,
    selectedMapId: maps[0]!.id,
    mapPreview: () => '<svg class="stub-preview"></svg>',
    operationCatalog: undefined,
    operationNotice: '',
    dailyCatalog: undefined,
    dailyNotice: '',
    dailyClock: () => new Date('2026-05-01T12:00:00Z'),
    savePicker: () => '<section id="stub-save-picker"></section>',
    cpuSpeed: 1,
    boardZoom: { index: 0, automatic: true },
    musicSettings: defaultMusicSettings,
    canContinue: true,
    storagePersistent: true,
    hasStoredSave: () => false,
    ...overrides,
  };
}

describe('buildTitleOverlay', () => {
  it('builds nothing, and none of the costly parts, while another screen shows', () => {
    const scenarios = vi.fn(() => maps);
    const mapPreview = vi.fn(() => '');
    const savePicker = vi.fn(() => '');
    const dailyClock = vi.fn(() => new Date());
    const hidden = [{ titleOpen: false }, { replayMode: true }, { campaignMenuOpen: true }, { editorOpen: true }];
    for (const override of hidden) {
      const { screens, state } = openTitle();
      const html = buildTitleOverlay(context(state, screens, { scenarios, mapPreview, savePicker, dailyClock, ...override }));
      expect(html).toBe('');
    }
    expect(scenarios).not.toHaveBeenCalled();
    expect(mapPreview).not.toHaveBeenCalled();
    expect(savePicker).not.toHaveBeenCalled();
    expect(dailyClock).not.toHaveBeenCalled();
  });

  it('lists every map, marks the selected one, and renders the save picker, daily card and generator', () => {
    const { screens, state } = openTitle();
    const html = buildTitleOverlay(context(state, screens, { selectedMapId: maps[1]!.id }));
    document.body.innerHTML = html;
    expect(document.querySelectorAll('.title-map-card')).toHaveLength(maps.length);
    expect(document.querySelectorAll('.title-map-card[aria-current="true"]')).toHaveLength(1);
    expect(document.querySelector('.title-map-card[aria-current="true"]')?.getAttribute('data-map-id')).toBe(maps[1]!.id);
    expect(document.querySelector('#stub-save-picker')).not.toBeNull();
    expect(document.querySelector('#daily-start')).not.toBeNull();
    expect(document.querySelector('#title-generator')).not.toBeNull();
    expect(document.querySelector('#operation-records')).not.toBeNull();
  });

  it('offers resume only when the title was opened from a match', () => {
    const { screens, state } = openTitle();
    document.body.innerHTML = buildTitleOverlay(context(state, screens));
    expect(document.querySelector('#title-resume')).toBeNull();
    state.resumable = true;
    document.body.innerHTML = buildTitleOverlay(context(state, screens));
    expect(document.querySelector('#title-resume')).not.toBeNull();
  });

  it('prefers the title notice, then the missing storage warning, then an invalid save', () => {
    const { screens, state } = openTitle();
    const invalid = { canContinue: false, hasStoredSave: () => true };
    const text = (overrides: Partial<TitleOverlayContext>) => {
      document.body.innerHTML = buildTitleOverlay(context(state, screens, overrides));
      return document.querySelector('.title-screen')?.textContent ?? '';
    };
    const storage = 'ブラウザーの保存領域を利用できません';
    state.setNotice('別タブの変更を検知しました。');
    const all = text({ ...invalid, storagePersistent: false });
    expect(all).toContain('別タブの変更を検知しました。');
    expect(all).not.toContain(storage);
    expect(all).not.toContain(uiText.titleInvalidSave);
    state.setNotice('');
    const storageOnly = text({ ...invalid, storagePersistent: false });
    expect(storageOnly).toContain(storage);
    expect(storageOnly).not.toContain(uiText.titleInvalidSave);
    expect(text(invalid)).toContain(uiText.titleInvalidSave);
    expect(text({ canContinue: true, hasStoredSave: () => true })).not.toContain(uiText.titleInvalidSave);
    expect(text({ canContinue: false, hasStoredSave: () => false })).not.toContain(uiText.titleInvalidSave);
  });

  it('does not look for a stored save when a notice already explains the title', () => {
    const { screens, state } = openTitle();
    const hasStoredSave = vi.fn(() => true);
    state.setNotice('理由');
    buildTitleOverlay(context(state, screens, { canContinue: false, hasStoredSave }));
    expect(hasStoredSave).not.toHaveBeenCalled();
  });

  it('keeps the generator, music and record panels as the player left them', () => {
    const { screens, state } = openTitle();
    const records: DailyRecords = { schemaVersion: 1, records: [] };
    const render = () => {
      document.body.innerHTML = buildTitleOverlay(context(state, screens, { dailyCatalog: records }));
    };
    render();
    for (const selector of ['#title-generator', '#title-music-settings', '#daily-records', '#operation-records']) {
      expect(document.querySelector<HTMLDetailsElement>(selector)?.open).toBe(false);
    }
    state.generatorOpen = true;
    state.musicOpen = true;
    state.dailyRecordsOpen = true;
    state.operationRecordsOpen = true;
    render();
    for (const selector of ['#title-generator', '#title-music-settings', '#daily-records', '#operation-records']) {
      expect(document.querySelector<HTMLDetailsElement>(selector)?.open).toBe(true);
    }
  });

  it('shows the generator form values and notice', () => {
    const { screens, state } = openTitle();
    state.generatorForm.seed = 'Seed-9';
    state.generatorForm.size = 24;
    state.generatorNotice = 'seedが不正です。';
    document.body.innerHTML = buildTitleOverlay(context(state, screens));
    expect(document.querySelector<HTMLInputElement>('#title-generator-seed')?.value).toBe('Seed-9');
    expect(document.querySelector<HTMLSelectElement>('#title-generator-size')?.value).toBe('24');
    expect(document.querySelector('#title-generator [role="alert"]')?.textContent).toBe('seedが不正です。');
  });

  it('marks maps outside the built-in list as custom so they can be deleted', () => {
    const { screens, state } = openTitle();
    const custom = { ...maps[0]!, id: 'custom-x', name: 'Custom X' };
    document.body.innerHTML = buildTitleOverlay(context(state, screens, { scenarios: () => [...maps, custom] }));
    expect(document.querySelector('#title-delete-custom-x')).not.toBeNull();
    expect(document.querySelectorAll('[data-delete-custom-map]')).toHaveLength(1);
  });
});
