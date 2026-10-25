import { generateSymmetricMap } from '../game/mapGenerator';
import type { GameResult, PlayerId } from '../game';
import type { ScenarioDefinition } from '../game/maps';
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
}

/** Installed once at startup; the seed field survives redraws as a draft. */
export function installTitleDelegation(app: HTMLElement, state: TitleState): void {
  app.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (input.id === 'title-generator-seed') state.generatorForm.seed = input.value;
  });
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
  });
  app.querySelector<HTMLSelectElement>('#title-generator-sea')?.addEventListener('change', (event) => {
    state.generatorForm.sea = (event.currentTarget as HTMLSelectElement).value;
  });
  app.querySelector<HTMLSelectElement>('#title-generator-preset')?.addEventListener('change', (event) => {
    state.generatorForm.preset = (event.target as HTMLSelectElement).value;
  });
  app.querySelector<HTMLButtonElement>('#title-generator-create')?.addEventListener('click', () => {
    if (!screens.titleOpen || !deps.confirmReplaceMatch()) return;
    state.generatorOpen = true;
    const generated = generateSymmetricMap(state.generatorForm);
    if (!generated.ok) {
      state.generatorNotice = generated.error;
      setFocus('#title-generator-seed');
      render();
      return;
    }
    const saved = deps.saveGeneratedMap(generated.value);
    if (!saved.ok) {
      state.generatorNotice = saved.error;
      setFocus('#title-generator-create');
      render();
      return;
    }
    state.generatorNotice = '';
    state.leaveTitle();
    deps.startGeneratedMap(saved.value);
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
