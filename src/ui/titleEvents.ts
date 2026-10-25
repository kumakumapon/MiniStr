import { generateSymmetricMap } from '../game/mapGenerator';
import type { GameResult, PlayerId } from '../game';
import { MAX_CUSTOM_SCENARIOS, type ScenarioDefinition } from '../game/maps';
import { isShareLinkCandidate, parseGeneratedShare, serializeGeneratedShare, shareGenerationOptions, shareMessages } from '../game/shareLink';
import { translateText } from './locale';
import { scenarioDisplayName } from './scenarioText';
import type { ScreenController } from './screenController';
import { uiText } from './strings';
import type { TitleState } from './titleScreen';

/** Everything a title control needs from the rest of the app, kept to what the handlers call. */
export interface TitleEventDeps {
  screens: ScreenController;
  state: TitleState;
  render: () => void;
  /** Remembers the control to focus after the next redraw. */
  setFocus: (selector: string) => void;
  confirmReplaceMatch: () => boolean;
  scenarios: () => readonly ScenarioDefinition[];
  scenarioExists: (mapId: string) => boolean;
  /** Confirms with the player, then deletes; undefined when the player declined. */
  deleteCustomMap: (id: string) => GameResult<void> | undefined;
  saveGeneratedMap: (generated: ScenarioDefinition) => GameResult<ScenarioDefinition>;
  /** Starts the saved map as a new match; the caller redraws. */
  startGeneratedMap: (saved: ScenarioDefinition) => void;
  /** Starts a listed map's briefing; the caller redraws. */
  startMap: (mapId: string) => void;
  startDaily: () => void;
  continueSave: () => boolean;
  /** The status line, which a failed load leaves explaining why. */
  message: () => string;
  /** Opens the campaign menu, which redraws. */
  openCampaign: () => void;
  /** Opens the editor, which redraws. */
  openEditor: () => void;
  isCampaignRun: () => boolean;
  chooseReplayFile: (event: Event) => void;
  previewMusic: (army: PlayerId) => void;
  operationRecords: { reset: () => void; delete: (id: number) => void };
  dailyRecords: { reset: () => void; delete: (date: string) => void };
  /** Where share links point: the page's origin and path, never its search or hash. */
  pageBase: () => { origin: string; pathname: string };
  clipboard: () => Pick<Clipboard, 'writeText'> | undefined;
  /** Removes the share link from the address bar without reloading or firing `hashchange`. */
  clearShareHash: () => void;
}

/** Installed once at startup; the seed field survives redraws as a draft. */
export function installTitleDelegation(app: HTMLElement, state: TitleState): void {
  app.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.id === 'title-generator-seed') {
      state.generatorForm.seed = input.value;
      resetLinkView(app, state);
    }
  });
}

/** A copy result belongs to the conditions it was made for, so editing them clears it in place. */
function resetLinkView(app: HTMLElement, state: TitleState): void {
  state.generatorLinkStatus = '';
  state.generatorLinkText = '';
  const status = app.querySelector('#title-generator-link-status');
  if (status) status.textContent = '';
  const field = app.querySelector<HTMLInputElement>('#title-generator-link-text');
  if (field) {
    field.value = '';
    field.hidden = true;
  }
}

type GeneratedCommit = { stage: 'declined' } | { stage: 'generate' | 'save'; error: string } | { stage: 'started' };

/**
 * The one path from a generated map to a started match, shared by the title
 * form and the share-link confirmation: keep-or-replace prompt, then generate,
 * save as a custom operation, leave the title and start. Nothing is written
 * before the prompt is accepted and generation has succeeded.
 */
function commitGeneratedMap(deps: TitleEventDeps, produce: () => GameResult<ScenarioDefinition>): GeneratedCommit {
  if (!deps.confirmReplaceMatch()) return { stage: 'declined' };
  const generated = produce();
  if (!generated.ok) return { stage: 'generate', error: generated.error };
  const saved = deps.saveGeneratedMap(generated.value);
  if (!saved.ok) return { stage: 'save', error: saved.error };
  deps.state.leaveTitle();
  deps.startGeneratedMap(saved.value);
  return { stage: 'started' };
}

/** Binds the title's controls in the DOM just drawn. Called after every redraw. */
export function bindTitleEvents(app: HTMLElement, deps: TitleEventDeps): void {
  const { screens, state, render, setFocus } = deps;
  app.querySelector<HTMLDetailsElement>('#operation-records')?.addEventListener('toggle', (event) => {
    state.operationRecordsOpen = (event.currentTarget as HTMLDetailsElement).open;
  });
  app.querySelector<HTMLButtonElement>('#operation-records-reset')?.addEventListener('click', () => deps.operationRecords.reset());
  app
    .querySelectorAll<HTMLButtonElement>('[data-record-delete]')
    .forEach((button) => button.addEventListener('click', () => deps.operationRecords.delete(Number(button.dataset.recordDelete))));
  app.querySelector<HTMLButtonElement>('#daily-start')?.addEventListener('click', deps.startDaily);
  app.querySelector<HTMLDetailsElement>('#daily-records')?.addEventListener('toggle', (event) => {
    state.dailyRecordsOpen = (event.currentTarget as HTMLDetailsElement).open;
  });
  app.querySelector<HTMLButtonElement>('#daily-records-reset')?.addEventListener('click', () => deps.dailyRecords.reset());
  app
    .querySelectorAll<HTMLButtonElement>('[data-daily-delete]')
    .forEach((button) => button.addEventListener('click', () => deps.dailyRecords.delete(button.dataset.dailyDelete ?? '')));
  app.querySelector<HTMLDetailsElement>('#title-generator')?.addEventListener('toggle', (event) => {
    state.generatorOpen = (event.currentTarget as HTMLDetailsElement).open;
  });
  app.querySelector<HTMLSelectElement>('#title-generator-size')?.addEventListener('change', (event) => {
    state.generatorForm.size = Number((event.currentTarget as HTMLSelectElement).value);
    resetLinkView(app, state);
  });
  app.querySelector<HTMLSelectElement>('#title-generator-sea')?.addEventListener('change', (event) => {
    state.generatorForm.sea = (event.currentTarget as HTMLSelectElement).value;
    resetLinkView(app, state);
  });
  app.querySelector<HTMLSelectElement>('#title-generator-preset')?.addEventListener('change', (event) => {
    state.generatorForm.preset = (event.target as HTMLSelectElement).value;
    resetLinkView(app, state);
  });
  app.querySelector<HTMLButtonElement>('#title-generator-create')?.addEventListener('click', () => {
    if (!screens.titleOpen) return;
    const outcome = commitGeneratedMap(deps, () => {
      state.generatorOpen = true;
      return generateSymmetricMap(state.generatorForm);
    });
    if (outcome.stage === 'declined') return;
    if (outcome.stage !== 'started') {
      state.generatorNotice = outcome.error;
      setFocus(outcome.stage === 'generate' ? '#title-generator-seed' : '#title-generator-create');
      render();
      return;
    }
    state.generatorNotice = '';
    render();
  });
  app.querySelector<HTMLButtonElement>('#title-generator-copy-link')?.addEventListener('click', () => {
    if (!screens.titleOpen) return;
    state.generatorOpen = true;
    const hash = serializeGeneratedShare(state.generatorForm);
    const { origin, pathname } = deps.pageBase();
    const validBase = /^https?:\/\/[^/?#]+$/.test(origin) && pathname.startsWith('/');
    if (!hash.ok || !validBase) {
      state.generatorNotice = hash.ok ? shareMessages.invalidOrigin : hash.error;
      setFocus(hash.ok ? '#title-generator-copy-link' : '#title-generator-seed');
      render();
      return;
    }
    state.generatorNotice = '';
    const link = origin + pathname + hash.value;
    // The result is written into the page in place so the button keeps focus.
    const signature = (form: typeof state.generatorForm) => [form.size, form.sea, form.preset ?? '', form.seed].join('|');
    const pressed = signature(state.generatorForm);
    const announce = (copied: boolean) => {
      // Copying finishes later; a result for conditions the player has since changed is dropped.
      if (signature(state.generatorForm) !== pressed) return;
      state.generatorLinkStatus = copied ? '共有リンクをコピーしました。' : 'コピーできませんでした。下の欄のリンクを選択してコピーしてください。';
      state.generatorLinkText = copied ? '' : link;
      const status = app.querySelector('#title-generator-link-status');
      if (status) status.textContent = translateText(state.generatorLinkStatus);
      const field = app.querySelector<HTMLInputElement>('#title-generator-link-text');
      if (field) {
        field.value = state.generatorLinkText;
        field.hidden = !state.generatorLinkText;
      }
    };
    const clipboard = deps.clipboard();
    if (!clipboard) {
      announce(false);
      return;
    }
    try {
      clipboard.writeText(link).then(
        () => announce(true),
        () => announce(false),
      );
    } catch {
      announce(false);
    }
  });
  app.querySelector<HTMLButtonElement>('#share-link-cancel')?.addEventListener('click', () => {
    const returnFocus = state.shareReturnFocus;
    state.pendingShare = undefined;
    state.shareReturnFocus = undefined;
    state.shareNotice = '';
    deps.clearShareHash();
    if (returnFocus) setFocus(returnFocus);
    render();
  });
  app.querySelector<HTMLButtonElement>('#share-link-confirm')?.addEventListener('click', () => {
    const pending = state.pendingShare;
    if (!pending || !screens.titleOpen) return;
    const outcome = commitGeneratedMap(deps, () => ({ ok: true, value: pending.scenario }));
    if (outcome.stage === 'declined') {
      setFocus('#share-link-confirm');
      render();
      return;
    }
    if (outcome.stage !== 'started') {
      // Kept open with the link still in the address bar, so the player can free space and try again.
      pending.status = outcome.error === `カスタムシナリオは${MAX_CUSTOM_SCENARIOS}件までです。` ? shareMessages.libraryFull : outcome.error;
      setFocus('#share-link-confirm');
      render();
      return;
    }
    state.pendingShare = undefined;
    state.shareReturnFocus = undefined;
    state.generatorNotice = '';
    deps.clearShareHash();
    render();
  });
  for (const army of ['red', 'blue'] as const)
    app.querySelector<HTMLButtonElement>(`#title-music-preview-${army}`)?.addEventListener('click', () => {
      state.musicPreviewArmy = army;
      deps.previewMusic(army);
    });
  app.querySelector<HTMLDetailsElement>('#title-music-settings')?.addEventListener('toggle', (event) => {
    state.musicOpen = (event.currentTarget as HTMLDetailsElement).open;
  });
  app.querySelectorAll<HTMLButtonElement>('[data-delete-custom-map]').forEach((button) =>
    button.addEventListener('click', () => {
      if (!screens.titleOpen) return;
      const id = button.dataset.deleteCustomMap ?? '';
      const catalog = deps.scenarios();
      const index = catalog.findIndex((map) => map.id === id);
      const map = catalog[index];
      const result = deps.deleteCustomMap(id);
      if (!result) return;
      state.notice = result.ok ? uiText.customMapDeleted(map ? scenarioDisplayName(map) : id) : translateText(result.error);
      const remaining = deps.scenarios();
      const next = remaining[Math.min(Math.max(0, index), remaining.length - 1)];
      setFocus(result.ok && next ? `.title-map-card[data-map-id="${next.id}"]` : `#title-delete-${id}`);
      render();
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('.title-map-card').forEach((card) =>
    card.addEventListener('click', () => {
      const mapId = card.dataset.mapId ?? '';
      if (!screens.titleOpen || !deps.scenarioExists(mapId) || !deps.confirmReplaceMatch()) return;
      state.leaveTitle();
      deps.startMap(mapId);
      render();
    }),
  );
  document.querySelector<HTMLButtonElement>('#title-resume')?.addEventListener('click', () => {
    state.leaveTitle();
    render();
  });
  document.querySelector<HTMLButtonElement>('#title-continue')?.addEventListener('click', () => {
    if (deps.continueSave()) state.leaveTitle();
    else state.notice = deps.message();
    render();
  });
  document.querySelector<HTMLButtonElement>('#title-campaign')?.addEventListener('click', () => {
    state.leaveTitleAndReturn();
    screens.briefingOpen = false;
    deps.openCampaign();
  });
  document.querySelector<HTMLButtonElement>('#title-editor')?.addEventListener('click', () => {
    state.leaveTitleAndReturn();
    deps.openEditor();
  });
  document.querySelector<HTMLButtonElement>('#title-import-replay')?.addEventListener('click', () => {
    document.querySelector<HTMLInputElement>('#title-replay-file')?.click();
  });
  document.querySelector<HTMLInputElement>('#title-replay-file')?.addEventListener('change', deps.chooseReplayFile);
  document.querySelector<HTMLButtonElement>('#briefing-back-to-title')?.addEventListener('click', () => {
    if (deps.isCampaignRun()) return;
    state.openFromBriefing();
    render();
  });
}

/** Where a share link comes from: the browser's address bar, kept behind a seam for tests. */
export interface ShareLinkEnv {
  readHash: () => string;
  /** Removes the hash without reloading or firing `hashchange`. */
  clearHash: () => void;
  /** Subscribes to hash changes made after startup. */
  onHashChange: (listener: () => void) => void;
}

/**
 * Looks at one address-bar hash. An unrelated hash is ignored. A valid link
 * is generated in memory only and held as the pending share (replacing an
 * older one), without touching storage. A refused link leaves a notice and is
 * removed from the address bar, but never discards a pending valid one.
 * Returns whether anything changed that needs a redraw.
 */
export function receiveShareHash(state: TitleState, hash: string, env: Pick<ShareLinkEnv, 'clearHash'>): boolean {
  if (!isShareLinkCandidate(hash)) return false;
  const refuse = (message: string) => {
    state.shareNotice = message;
    env.clearHash();
    return true;
  };
  const parsed = parseGeneratedShare(hash);
  if (!parsed.ok) return refuse(parsed.error);
  const generated = generateSymmetricMap(shareGenerationOptions(parsed.value));
  if (!generated.ok) return refuse(shareMessages.unplayable);
  state.shareNotice = '';
  state.pendingShare = { share: parsed.value, scenario: generated.value, status: '' };
  return true;
}

/**
 * Reads the hash at startup and on every later change. Call it before the
 * first draw; the caller draws, so a pending share appears as soon as nothing
 * else is on screen.
 */
export function installShareLink(state: TitleState, env: ShareLinkEnv, render: () => void): void {
  receiveShareHash(state, env.readHash(), env);
  env.onHashChange(() => {
    if (receiveShareHash(state, env.readHash(), env)) render();
  });
}
