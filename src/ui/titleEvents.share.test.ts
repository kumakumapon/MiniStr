import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maps } from '../game';
import type { ScenarioDefinition } from '../game/maps';
import { MAX_CUSTOM_SCENARIOS } from '../game/maps';
import { shareMessages } from '../game/shareLink';
import { setLocale } from './locale';
import { defaultMusicSettings } from './music';
import { ScreenController } from './screenController';
import { renderShareLinkDialog } from './shareLinkDialog';
import { bindTitleEvents, installShareLink, installTitleDelegation, receiveShareHash, type ShareLinkEnv, type TitleEventDeps } from './titleEvents';
import { buildTitleOverlay, TitleState } from './titleScreen';

const generation = vi.hoisted(() => ({ fail: undefined as string | undefined, calls: 0 }));
vi.mock('../game/mapGenerator', async (importOriginal) => {
  const original = await importOriginal<typeof import('../game/mapGenerator')>();
  return {
    ...original,
    generateSymmetricMap: (input: unknown) => {
      generation.calls++;
      return generation.fail ? { ok: false as const, error: generation.fail } : original.generateSymmetricMap(input);
    },
  };
});

const valid = '#ministr-gen1/2/20/coast/standard/MiniStr-1';
const other = '#ministr-gen1/3/16/none/frontline/Other-2';

interface Harness {
  app: HTMLDivElement;
  screens: ScreenController;
  state: TitleState;
  deps: TitleEventDeps;
  focus: string[];
  clear: ReturnType<typeof vi.fn>;
  writeText: ReturnType<typeof vi.fn>;
  draw: () => void;
}

function harness(options: { clipboard?: 'ok' | 'reject' | 'missing'; origin?: string } = {}): Harness {
  document.body.innerHTML = '<div id="app"></div>';
  const app = document.querySelector<HTMLDivElement>('#app')!;
  const screens = new ScreenController();
  screens.open('title');
  const state = new TitleState(screens);
  const focus: string[] = [];
  const clear = vi.fn();
  const writeText = vi.fn(() => (options.clipboard === 'reject' ? Promise.reject(new Error('denied')) : Promise.resolve()));
  const deps: TitleEventDeps = {
    screens,
    state,
    render: vi.fn(),
    setFocus: vi.fn((selector: string) => void focus.push(selector)),
    confirmReplaceMatch: vi.fn(() => true),
    scenarios: () => maps,
    scenarioExists: vi.fn(() => true),
    deleteCustomMap: vi.fn(() => ({ ok: true as const, value: undefined })),
    saveGeneratedMap: vi.fn((generated: ScenarioDefinition) => ({ ok: true as const, value: generated })),
    startGeneratedMap: vi.fn(),
    startMap: vi.fn(),
    startDaily: vi.fn(),
    continueSave: vi.fn(() => true),
    message: () => '',
    openCampaign: vi.fn(),
    openEditor: vi.fn(),
    isCampaignRun: vi.fn(() => false),
    chooseReplayFile: vi.fn(),
    previewMusic: vi.fn(),
    operationRecords: { reset: vi.fn(), delete: vi.fn() },
    dailyRecords: { reset: vi.fn(), delete: vi.fn() },
    pageBase: () => ({ origin: options.origin ?? 'https://example.test', pathname: '/MiniStr/' }),
    clipboard: () => (options.clipboard === 'missing' ? undefined : { writeText }),
    clearShareHash: clear,
  };
  installTitleDelegation(app, state);
  const draw = () => {
    const pending = state.pendingShare;
    app.innerHTML = pending
      ? renderShareLinkDialog({ share: pending.share, name: pending.scenario.name, status: pending.status })
      : buildTitleOverlay({
          state,
          titleOpen: screens.titleOpen,
          replayMode: false,
          campaignMenuOpen: false,
          editorOpen: false,
          scenarios: () => maps,
          selectedMapId: maps[0]!.id,
          mapPreview: () => '',
          operationCatalog: undefined,
          operationNotice: '',
          dailyCatalog: undefined,
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
  return { app, screens, state, deps, focus, clear, writeText, draw };
}

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = (selector: string) => document.querySelector(selector)?.textContent;

beforeEach(() => {
  setLocale('ja');
  generation.fail = undefined;
  generation.calls = 0;
});
afterEach(() => {
  setLocale('ja');
  document.body.innerHTML = '';
});

describe('copy share link', () => {
  it('copies origin, path and the hash of the current form, nothing else', async () => {
    const h = harness();
    h.state.generatorForm.size = 24;
    h.state.generatorForm.sea = 'ocean';
    h.state.generatorForm.preset = 'frontline';
    h.state.generatorForm.seed = 'Zeta-1';
    click('#title-generator-copy-link');
    await flush();
    expect(h.writeText).toHaveBeenCalledTimes(1);
    expect(h.writeText).toHaveBeenCalledWith('https://example.test/MiniStr/#ministr-gen1/3/24/ocean/frontline/Zeta-1');
    expect(text('#title-generator-link-status')).toBe('共有リンクをコピーしました。');
    expect(document.querySelector<HTMLInputElement>('#title-generator-link-text')!.hidden).toBe(true);
    // Updated in place: no redraw, so the button keeps focus.
    expect(h.deps.render).not.toHaveBeenCalled();
    expect(h.deps.saveGeneratedMap).not.toHaveBeenCalled();
  });

  it('shows the link in a read-only field when the clipboard refuses', async () => {
    const h = harness({ clipboard: 'reject' });
    click('#title-generator-copy-link');
    await flush();
    const field = document.querySelector<HTMLInputElement>('#title-generator-link-text')!;
    expect(field.hidden).toBe(false);
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe('https://example.test/MiniStr/#ministr-gen1/2/20/coast/standard/MiniStr-1');
    expect(text('#title-generator-link-status')).toContain('コピーできませんでした');
    expect(h.deps.render).not.toHaveBeenCalled();
    // A redraw keeps showing the same fallback.
    h.draw();
    expect(document.querySelector<HTMLInputElement>('#title-generator-link-text')!.value).toBe(field.value);
    expect(text('#title-generator-link-status')).toContain('コピーできませんでした');
  });

  it('falls back the same way when there is no clipboard API', () => {
    harness({ clipboard: 'missing' });
    click('#title-generator-copy-link');
    expect(document.querySelector<HTMLInputElement>('#title-generator-link-text')!.hidden).toBe(false);
  });

  it('refuses invalid conditions without copying, with a fixed message', () => {
    const h = harness();
    h.state.generatorForm.seed = 'bad seed!';
    click('#title-generator-copy-link');
    expect(h.writeText).not.toHaveBeenCalled();
    expect(h.state.generatorNotice).toBe(shareMessages.invalidSeed);
    expect(h.focus).toEqual(['#title-generator-seed']);
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('refuses daily-style seeds', () => {
    const h = harness();
    h.state.generatorForm.seed = 'D20260501';
    click('#title-generator-copy-link');
    expect(h.writeText).not.toHaveBeenCalled();
    expect(h.state.generatorNotice).toBe(shareMessages.dailySeed);
  });

  for (const origin of ['null', 'file://', 'ftp://example.test', 'https://', 'javascript:alert(1)', 'https://a.test/x?y']) {
    it(`does not copy from a non-web origin (${origin})`, () => {
      const h = harness({ origin });
      click('#title-generator-copy-link');
      expect(h.writeText).not.toHaveBeenCalled();
      expect(h.state.generatorNotice).toBe(shareMessages.invalidOrigin);
    });
  }

  it('drops a copy result that finishes after the conditions changed', async () => {
    const h = harness();
    let finish: () => void = () => {};
    h.writeText.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    click('#title-generator-copy-link');
    const seed = document.querySelector<HTMLInputElement>('#title-generator-seed')!;
    seed.value = 'Changed-2';
    seed.dispatchEvent(new Event('input', { bubbles: true }));
    finish();
    await flush();
    expect(text('#title-generator-link-status')).toBe('');
    expect(h.state.generatorLinkStatus).toBe('');
  });

  it('drops a failed copy for old conditions instead of showing its link', async () => {
    const h = harness();
    let fail: (reason: Error) => void = () => {};
    h.writeText.mockImplementationOnce(() => new Promise<void>((_, reject) => (fail = reject)));
    click('#title-generator-copy-link');
    const sea = document.querySelector<HTMLSelectElement>('#title-generator-sea')!;
    sea.value = 'ocean';
    sea.dispatchEvent(new Event('change', { bubbles: true }));
    fail(new Error('denied'));
    await flush();
    expect(document.querySelector<HTMLInputElement>('#title-generator-link-text')!.hidden).toBe(true);
    expect(h.state.generatorLinkText).toBe('');
  });

  it('shows the fallback field when writeText throws synchronously', () => {
    const h = harness();
    h.writeText.mockImplementationOnce(() => {
      throw new Error('sync');
    });
    click('#title-generator-copy-link');
    expect(document.querySelector<HTMLInputElement>('#title-generator-link-text')!.hidden).toBe(false);
    expect(text('#title-generator-link-status')).toContain('コピーできませんでした');
  });

  it('clears a stale result as soon as the conditions change', async () => {
    const h = harness({ clipboard: 'reject' });
    click('#title-generator-copy-link');
    await flush();
    const sea = document.querySelector<HTMLSelectElement>('#title-generator-sea')!;
    sea.value = 'ocean';
    sea.dispatchEvent(new Event('change', { bubbles: true }));
    expect(text('#title-generator-link-status')).toBe('');
    expect(document.querySelector<HTMLInputElement>('#title-generator-link-text')!.hidden).toBe(true);
    expect(h.state.generatorLinkText).toBe('');
  });
});

describe('receiving a share link', () => {
  it('ignores unrelated hashes without any notice', () => {
    const h = harness();
    for (const hash of ['', '#', '#foo', '#/x']) expect(receiveShareHash(h.state, hash, { clearHash: h.clear })).toBe(false);
    expect(h.state.pendingShare).toBeUndefined();
    expect(h.state.shareNotice).toBe('');
    expect(h.clear).not.toHaveBeenCalled();
    expect(generation.calls).toBe(0);
  });

  it('holds a valid link as pending after generating it once in memory, keeping the hash', () => {
    const h = harness();
    expect(receiveShareHash(h.state, valid, { clearHash: h.clear })).toBe(true);
    expect(h.state.pendingShare?.share).toEqual({ gen: 2, size: 20, sea: 'coast', preset: 'standard', seed: 'MiniStr-1' });
    expect(h.state.pendingShare?.scenario.id).toBe('generated-v2-20-coast-MiniStr-1');
    expect(generation.calls).toBe(1);
    expect(h.clear).not.toHaveBeenCalled();
    expect(h.deps.saveGeneratedMap).not.toHaveBeenCalled();
  });

  it('refuses an invalid link with a notice and removes it from the address bar', () => {
    const h = harness();
    expect(receiveShareHash(h.state, '#ministr-gen1/9/20/coast/standard/a', { clearHash: h.clear })).toBe(true);
    expect(h.state.pendingShare).toBeUndefined();
    expect(h.state.shareNotice).toBe(shareMessages.unsupportedGeneration);
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(generation.calls).toBe(0);
  });

  it('refuses a link whose map cannot be generated, without a dialog', () => {
    const h = harness();
    generation.fail = '補給所の配置場所を確保できませんでした。別のseedを指定してください。';
    receiveShareHash(h.state, '#ministr-gen1/3/20/coast/frontline/NoDepot', { clearHash: h.clear });
    expect(h.state.pendingShare).toBeUndefined();
    expect(h.state.shareNotice).toBe(shareMessages.unplayable);
    expect(h.clear).toHaveBeenCalledTimes(1);
  });

  it('replaces an older pending link with the newest valid one', () => {
    const h = harness();
    receiveShareHash(h.state, valid, { clearHash: h.clear });
    receiveShareHash(h.state, other, { clearHash: h.clear });
    expect(h.state.pendingShare?.share.seed).toBe('Other-2');
    expect(h.state.pendingShare?.scenario.id).toBe('generated-v3-frontline-16-none-Other-2');
  });

  it('keeps a pending valid link when a later link is invalid, and only notifies', () => {
    const h = harness();
    receiveShareHash(h.state, valid, { clearHash: h.clear });
    receiveShareHash(h.state, '#ministr-gen1/2/20/coast/standard/bad seed', { clearHash: h.clear });
    expect(h.state.pendingShare?.share.seed).toBe('MiniStr-1');
    expect(h.state.shareNotice).toBe(shareMessages.invalidSeed);
    expect(h.clear).toHaveBeenCalledTimes(1);
  });

  it('shows the refusal on the title and drops it once the title is left', () => {
    const h = harness();
    receiveShareHash(h.state, '#ministr-gen1/2/20/coast/standard/%41', { clearHash: h.clear });
    h.draw();
    expect(text('.title-notice')).toBe(shareMessages.invalidSeed);
    h.state.leaveTitle();
    expect(h.state.shareNotice).toBe('');
  });
});

describe('installing the listener', () => {
  function env(initial: string) {
    const listeners: (() => void)[] = [];
    const hash = { value: initial };
    const shareEnv: ShareLinkEnv = {
      readHash: () => hash.value,
      clearHash: vi.fn(() => void (hash.value = '')),
      onHashChange: (listener) => void listeners.push(listener),
    };
    return { hash, listeners, shareEnv };
  }

  it('reads the startup hash without redrawing, then redraws on later links only', () => {
    const h = harness();
    const { hash, listeners, shareEnv } = env(valid);
    const render = vi.fn();
    installShareLink(h.state, shareEnv, render);
    expect(h.state.pendingShare?.share.seed).toBe('MiniStr-1');
    expect(render).not.toHaveBeenCalled();
    hash.value = '#unrelated';
    listeners[0]!();
    expect(render).not.toHaveBeenCalled();
    hash.value = other;
    listeners[0]!();
    expect(render).toHaveBeenCalledTimes(1);
    expect(h.state.pendingShare?.share.seed).toBe('Other-2');
    hash.value = '#ministr-gen1/x';
    listeners[0]!();
    expect(render).toHaveBeenCalledTimes(2);
    expect(shareEnv.clearHash).toHaveBeenCalledTimes(1);
    expect(h.state.pendingShare?.share.seed).toBe('Other-2');
  });
});

describe('share confirmation', () => {
  function pending(options?: Parameters<typeof harness>[0]) {
    const h = harness(options);
    receiveShareHash(h.state, valid, { clearHash: h.clear });
    h.state.shareReturnFocus = '#title-generator-create';
    h.draw();
    return h;
  }

  it('saves and starts the already generated map exactly once, then clears the hash', () => {
    const h = pending();
    const scenario = h.state.pendingShare!.scenario;
    expect(generation.calls).toBe(1);
    click('#share-link-confirm');
    expect(h.deps.confirmReplaceMatch).toHaveBeenCalledTimes(1);
    expect(h.deps.saveGeneratedMap).toHaveBeenCalledTimes(1);
    expect(h.deps.saveGeneratedMap).toHaveBeenCalledWith(scenario);
    expect(h.deps.startGeneratedMap).toHaveBeenCalledTimes(1);
    expect(generation.calls).toBe(1);
    expect(h.state.pendingShare).toBeUndefined();
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.screens.titleOpen).toBe(false);
    expect(h.deps.render).toHaveBeenCalledTimes(1);
  });

  it('cancel writes nothing, clears the hash and returns focus to the title control', () => {
    const h = pending();
    click('#share-link-cancel');
    expect(h.deps.saveGeneratedMap).not.toHaveBeenCalled();
    expect(h.deps.startGeneratedMap).not.toHaveBeenCalled();
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.state.pendingShare).toBeUndefined();
    expect(h.focus).toEqual(['#title-generator-create']);
    expect(h.screens.titleOpen).toBe(true);
  });

  it('cancel clears an older refusal notice so it does not reappear on the title', () => {
    const h = pending();
    receiveShareHash(h.state, '#ministr-gen1/9/16/none/standard/a', { clearHash: h.clear });
    expect(h.state.shareNotice).not.toBe('');
    click('#share-link-cancel');
    expect(h.state.shareNotice).toBe('');
  });

  it('keeps the dialog and the link when saving fails, and does not start the match', () => {
    const h = pending();
    vi.mocked(h.deps.saveGeneratedMap).mockReturnValue({ ok: false, error: 'カスタムシナリオを書き込めませんでした。' });
    click('#share-link-confirm');
    expect(h.deps.startGeneratedMap).not.toHaveBeenCalled();
    expect(h.clear).not.toHaveBeenCalled();
    expect(h.state.pendingShare?.status).toBe('カスタムシナリオを書き込めませんでした。');
    expect(h.focus).toEqual(['#share-link-confirm']);
    expect(h.screens.titleOpen).toBe(true);
    h.draw();
    expect(text('#share-link-status')).toBe('カスタムシナリオを書き込めませんでした。');
  });

  it('explains that an existing custom operation must be deleted when the library is full, and allows a retry', () => {
    const h = pending();
    vi.mocked(h.deps.saveGeneratedMap).mockReturnValueOnce({ ok: false, error: `カスタムシナリオは${MAX_CUSTOM_SCENARIOS}件までです。` });
    click('#share-link-confirm');
    expect(h.state.pendingShare?.status).toBe(shareMessages.libraryFull);
    h.draw();
    click('#share-link-confirm');
    expect(h.deps.saveGeneratedMap).toHaveBeenCalledTimes(2);
    expect(h.deps.startGeneratedMap).toHaveBeenCalledTimes(1);
    expect(h.clear).toHaveBeenCalledTimes(1);
  });

  it('leaves everything in place when the player keeps the running match', () => {
    const h = pending();
    vi.mocked(h.deps.confirmReplaceMatch).mockReturnValue(false);
    click('#share-link-confirm');
    expect(h.deps.saveGeneratedMap).not.toHaveBeenCalled();
    expect(h.clear).not.toHaveBeenCalled();
    expect(h.state.pendingShare).toBeDefined();
    expect(h.screens.titleOpen).toBe(true);
  });

  it('does nothing once the title is no longer open', () => {
    const h = pending();
    h.screens.titleOpen = false;
    click('#share-link-confirm');
    expect(h.deps.confirmReplaceMatch).not.toHaveBeenCalled();
    expect(h.deps.saveGeneratedMap).not.toHaveBeenCalled();
  });

  it('binds one handler per redraw', () => {
    const h = pending();
    h.draw();
    h.draw();
    click('#share-link-confirm');
    expect(h.deps.saveGeneratedMap).toHaveBeenCalledTimes(1);
  });
});
