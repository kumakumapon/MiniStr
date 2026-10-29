import { distributedSource } from './distributedSource';
import { afterEach, describe, expect, it } from 'vitest';
// jsdom is intentionally instantiated per test: startup listeners/timers cannot leak between apps.
// @ts-expect-error The runtime is a dev dependency; production/test source does not require its optional declaration package.
import { JSDOM } from 'jsdom';
import { applyGameCommand, createScenarioInitialState, maps, saveGameToSlot, type GameState, type StorageLike } from '../../src/game';
import { operation, operationData, valueOf } from '../../src/game/operations.fixture';
import type { GameCommand } from '../../src/game/session';

const source = distributedSource();
let dom: JSDOM;
function launch(options: { storage?: Record<string, string>; denied?: boolean } = {}) {
  dom = new JSDOM('<!doctype html><html lang="ja"><body><div id="app"></div></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = () => true;
  dom.window.prompt = () => 'test save';
  for (const [key, value] of Object.entries(options.storage ?? {})) dom.window.localStorage.setItem(key, value);
  if (options.denied)
    Object.defineProperty(dom.window, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
  dom.window.eval(source);
  return dom.window.document;
}
function click(selector: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw Error(`Missing UI: ${selector}`);
  element.click();
}
function change(selector: string, value: string) {
  const element = dom.window.document.querySelector(selector) as HTMLSelectElement | HTMLTextAreaElement;
  if (!element) throw Error(`Missing UI: ${selector}`);
  element.value = value;
  element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
function input(selector: string, value: string) {
  const element = dom.window.document.querySelector(selector) as HTMLInputElement;
  if (!element) throw Error(`Missing UI: ${selector}`);
  element.value = value;
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
afterEach(() => dom?.window.close());

describe('distributed application boundaries', () => {
  it('shares title zoom with operations, resume and board buttons, rejecting invalid values', () => {
    const document = launch();
    const titleZoom = () => (document.querySelector('#title-board-zoom') as HTMLSelectElement).value;
    const boardZoom = () => document.querySelector('.board')!.getAttribute('data-zoom');
    expect(titleZoom()).toBe('auto');
    change('#title-board-zoom', '50');
    expect(titleZoom()).toBe('50');
    for (const value of ['80', 'Infinity']) {
      const option = document.createElement('option');
      option.value = value;
      document.querySelector('#title-board-zoom')!.append(option);
      change('#title-board-zoom', value);
      expect(titleZoom()).toBe('50');
    }
    const previousTitleSelect = document.querySelector('#title-board-zoom') as HTMLSelectElement;
    click('#title-training');
    click('#begin-operation');
    previousTitleSelect.value = '200';
    previousTitleSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    expect(boardZoom()).toBe('50');
    click('#save');
    click('#board-zoom-in');
    click('#open-title');
    expect(titleZoom()).toBe('75');
    change('#title-board-zoom', '200');
    click('#title-resume');
    expect(boardZoom()).toBe('200');
    click('#open-title');
    click('#title-continue');
    expect(boardZoom()).toBe('200');
    click('#open-title');
    click('.title-map-card[data-map-id="skirmish"]');
    click('#begin-operation');
    expect(boardZoom()).toBe('200');
    click('#open-title');
    change('#title-board-zoom', 'auto');
    expect(titleZoom()).toBe('auto');
    click('#title-resume');
    expect(Number(boardZoom())).toBeGreaterThanOrEqual(100);
    expect(Number(boardZoom())).toBeLessThanOrEqual(150);
  });
  it('shares CPU speed between title and game and rejects unsupported form values', () => {
    const document = launch();
    const speed = (selector: string) => (document.querySelector(selector) as HTMLSelectElement).value;
    expect(speed('#title-cpu-speed')).toBe('1');
    change('#title-cpu-speed', '4');
    expect(speed('#title-cpu-speed')).toBe('4');
    change('#title-cpu-speed', '3');
    expect(speed('#title-cpu-speed')).toBe('4');
    click('#title-training');
    click('#begin-operation');
    expect(speed('#cpu-speed')).toBe('4');
    change('#cpu-speed', '2');
    change('#cpu-speed', 'Infinity');
    expect(speed('#cpu-speed')).toBe('2');
    click('#open-title');
    expect(speed('#title-cpu-speed')).toBe('2');
    change('#title-cpu-speed', '0.5');
    click('#title-resume');
    expect(speed('#cpu-speed')).toBe('0.5');
  });
  it('reconstructs recon and analysis at the selected replay position without future samples', () => {
    const initial = createScenarioInitialState(
      operation({
        id: 'distributed-replay-history',
        initialUnits: [
          { kind: 'infantry', owner: 'red', x: 0, y: 1 },
          { kind: 'tank', owner: 'blue', x: 2, y: 1 },
        ],
        victoryConditions: [{ type: 'survive', untilTurn: 2 }],
        defeatConditions: [{ type: 'survive', untilTurn: 3 }],
      }),
    );
    const commands: GameCommand[] = [{ type: 'move', unitId: 'r1', destination: { x: 0, y: 3 } }, { type: 'endTurn' }, { type: 'endTurn' }];
    let final = initial;
    for (const command of commands) final = valueOf(applyGameCommand(final, command));
    expect(final.winner).toBe('red');
    const storage: Record<string, string> = {};
    const store: StorageLike = {
      getItem: (key) => storage[key] ?? null,
      setItem: (key, value) => {
        storage[key] = value;
      },
      removeItem: (key) => {
        delete storage[key];
      },
    };
    valueOf(saveGameToSlot(store, 'replay-history', 'Replay', { mapId: initial.scenarioId!, initialState: initial, gameState: final, commands, difficulty: 'normal' }));
    const document = launch({ storage });
    click('.load-save-slot[data-save-slot="replay-history"]');
    click('#view-replay');
    expect(document.querySelector('.recon-contact')).toBeNull();
    change('#replay-seek', '1');
    expect(document.querySelector('.recon-contact')).not.toBeNull();
    change('#replay-viewpoint', 'all');
    expect(document.querySelector('#battle-analysis')).not.toBeNull();
    change('#replay-seek', '3');
    expect(document.querySelectorAll('#battle-analysis tbody tr')).toHaveLength(2);
    change('#replay-seek', '0');
    expect(document.querySelectorAll('#battle-analysis tbody tr')).toHaveLength(1);
    change('#replay-viewpoint', 'red');
    expect(document.querySelector('#battle-analysis')).toBeNull();
    expect(document.querySelector('.recon-contact')).toBeNull();
    change('#replay-seek', '1');
    expect(document.querySelector('.recon-contact')).not.toBeNull();
  });
  it('generates a custom map and persists, applies and deletes its deployment preset across startup', () => {
    let document = launch();
    change('#title-generator-size', '16');
    change('#title-generator-sea', 'ocean');
    input('#title-generator-seed', 'distributed-1');
    click('#title-generator-create');
    expect(document.querySelector('#briefing-title')?.textContent).toContain('distributed-1');
    change('#briefing-deployment-red-2', 'infantry');
    input('#briefing-preset-red-0-name', '機動部隊');
    click('#briefing-preset-red-0-save');
    click('#briefing-deployment-reset');
    expect(document.querySelector<HTMLSelectElement>('#briefing-deployment-red-2')?.value).toBe('tank');
    click('#briefing-preset-red-0-apply');
    expect(document.querySelector<HTMLSelectElement>('#briefing-deployment-red-2')?.value).toBe('infantry');
    click('#begin-operation');
    click('#save');
    const saved = JSON.parse(dom.window.localStorage.getItem('ministr.save.manual')!) as { initialState: GameState };
    expect(saved.initialState.units.find((unit) => unit.id === 'r3')?.kind).toBe('infantry');
    expect(saved.initialState.board.width).toBe(16);
    const storage: Record<string, string> = {};
    for (let index = 0; index < dom.window.localStorage.length; index++) {
      const key = dom.window.localStorage.key(index)!;
      storage[key] = dom.window.localStorage.getItem(key)!;
    }
    dom.window.close();
    document = launch({ storage });
    click('.title-map-card[data-map-id="generated-v2-16-ocean-distributed-1"]');
    expect(document.querySelector<HTMLInputElement>('#briefing-preset-red-0-name')?.value).toBe('機動部隊');
    click('#briefing-preset-red-0-apply');
    expect(document.querySelector<HTMLSelectElement>('#briefing-deployment-red-2')?.value).toBe('infantry');
    click('#briefing-preset-red-0-delete');
    expect(document.querySelector<HTMLButtonElement>('#briefing-preset-red-0-apply')?.disabled).toBe(true);
  });

  it('reconstructs stale observations after undo and save/resume without exposing full analysis', () => {
    const document = launch();
    click('#title-editor');
    change(
      '#editor-json',
      JSON.stringify(
        operationData({
          id: 'distributed-recon',
          initialUnits: [
            { kind: 'infantry', owner: 'red', x: 0, y: 1 },
            { kind: 'tank', owner: 'blue', x: 2, y: 1 },
          ],
          victoryConditions: [{ type: 'survive', untilTurn: 100 }],
          defeatConditions: [{ type: 'survive', untilTurn: 101 }],
        }),
      ),
    );
    click('#editor-import');
    click('#editor-start');
    click('#begin-operation');
    click('.tile[data-x="0"][data-y="1"]');
    click('.tile[data-x="0"][data-y="3"]');
    expect(document.querySelector('.tile[data-x="2"][data-y="1"] .recon-contact')?.textContent).toContain('最終 T1');
    expect(document.querySelector('#battle-analysis')).toBeNull();
    click('#undo');
    expect(document.querySelector('.recon-contact')).toBeNull();
    click('.tile[data-x="0"][data-y="1"]');
    click('.tile[data-x="0"][data-y="3"]');
    click('#save');
    click('#open-title');
    click('.load-save-slot[data-save-slot="manual"]');
    expect(document.querySelector('.recon-contact')?.textContent).toContain('最終 T1');
    click('#recon-markers');
    expect(document.querySelector('.recon-contact')).toBeNull();
    expect(document.querySelector('[data-recon-x]')?.textContent).toContain('現在位置は不明');
  });

  it('shows analysis only for the explicit whole-board spectator view', () => {
    const document = launch();
    click('.title-map-card[data-map-id="frontier-defense"]');
    click('input[name="match-mode"][value="spectate"]');
    click('#begin-operation');
    click('#spectate-toggle');
    expect(document.querySelector('#battle-analysis')).toBeNull();
    click('#spectate-whole-board');
    expect(document.querySelector('#battle-analysis')).not.toBeNull();
    change('#analysis-metric', 'losses');
    expect(document.querySelector('.analysis-chart')?.getAttribute('data-analysis-metric')).toBe('losses');
    click('#spectate-whole-board');
    expect(document.querySelector('#battle-analysis')).toBeNull();
  });

  it('rejects invalid seeds and recovers corrupt presets without deleting match saves', () => {
    const document = launch({ storage: { 'ministr.deployment.presets': '{bad', 'ministr.save.manual': 'retained' } });
    input('#title-generator-seed', 'bad seed');
    click('#title-generator-create');
    expect(document.querySelector('#title-generator [role=alert]')?.textContent).toContain('seed');
    expect(dom.window.localStorage.getItem('ministr.scenarios.custom')).toBeNull();
    input('#title-generator-seed', 'recovery');
    click('#title-generator-create');
    expect(document.querySelector('[data-presets-reset]')).not.toBeNull();
    click('[data-presets-reset]');
    expect(document.querySelector<HTMLButtonElement>('#briefing-preset-red-0-save')?.disabled).toBe(false);
    expect(dom.window.localStorage.getItem('ministr.save.manual')).toBe('retained');
  });
  it('deploys a custom force and preserves evacuation progress through undo, save and resume', () => {
    const document = launch();
    click('#title-editor');
    change('#editor-json', JSON.stringify(operationData({ id: 'distributed-withdrawal' })));
    click('#editor-import');
    expect(document.querySelector('#editor-notice')?.textContent).toContain('JSONを反映しました');
    click('#editor-start');
    change('#briefing-deployment-red-1', 'heavyTank');
    expect(document.querySelector<HTMLButtonElement>('#begin-operation')?.disabled).toBe(true);
    expect(document.querySelector('.deployment-error')?.textContent).toContain('予算');
    click('#briefing-deployment-reset');
    change('#briefing-deployment-red-1', 'infantry');
    click('#begin-operation');
    expect(document.querySelector('.tile[data-x="1"][data-y="2"]')?.textContent).toContain('歩');
    click('.tile[data-x="0"][data-y="1"]');
    expect(document.querySelector<HTMLButtonElement>('#evacuate-unit')?.disabled).toBe(true);
    click('.tile[data-x="3"][data-y="1"]');
    expect(document.querySelector<HTMLButtonElement>('#evacuate-unit')?.disabled).toBe(false);
    click('#evacuate-unit');
    expect(document.querySelector('.tile[data-x="3"][data-y="1"]')?.textContent).not.toContain('歩');
    click('#undo');
    expect(document.querySelector('.tile[data-x="3"][data-y="1"]')?.textContent).toContain('歩');
    click('.tile[data-x="3"][data-y="1"]');
    click('#evacuate-unit');
    click('#save');
    const saved = JSON.parse(dom.window.localStorage.getItem('ministr.save.manual')!) as { initialState: GameState; gameState: GameState };
    expect(saved.initialState.players.red.gold).toBe(6000);
    expect(saved.initialState.units.find((unit) => unit.id === 'r2')?.kind).toBe('infantry');
    expect(saved.gameState.evacuatedUnits?.map((unit) => unit.id)).toEqual(['r1']);
    click('#open-title');
    click('.load-save-slot[data-save-slot="manual"]');
    expect(document.querySelector('.title-overlay')).toBeNull();
    click('.tile[data-x="1"][data-y="2"]');
    click('.tile[data-x="3"][data-y="1"]');
    click('#evacuate-unit');
    expect(document.querySelector('#result-title')?.textContent).toContain('勝利');
  });

  it('validates both hotseat loadouts and ignores blue edits after returning to CPU mode', () => {
    const document = launch();
    click('.title-map-card[data-map-id="convoy-escort"]');
    expect(document.querySelector<HTMLSelectElement>('#briefing-deployment-red-0')?.disabled).toBe(true);
    click('input[name="match-mode"][value="hotseat"]');
    change('#briefing-deployment-blue-0', 'heavyTank');
    expect(document.querySelector<HTMLButtonElement>('#begin-operation')?.disabled).toBe(true);
    click('input[name="match-mode"][value="cpu"]');
    expect(document.querySelector('#briefing-deployment-blue-0')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('#begin-operation')?.disabled).toBe(false);
    click('#begin-operation');
    click('.tile[data-x="1"][data-y="5"]');
    expect(document.querySelector('#evacuate-unit')).not.toBeNull();
    expect(document.querySelector<HTMLButtonElement>('#evacuate-unit')?.disabled).toBe(true);
  });

  it('starts with unavailable storage and can play a practice operation', () => {
    const document = launch({ denied: true });
    expect(document.body.textContent).toContain('保存領域を利用できません');
    click('#title-training');
    click('#begin-operation');
    expect((document.querySelector('#map') as HTMLSelectElement).value).toBe('training');
    expect(document.querySelector('.board')).not.toBeNull();
    expect(document.querySelector('#learning-panel')?.hasAttribute('open')).toBe(true);
    click('.tile[data-x="0"][data-y="1"]');
    click('.tile[data-x="0"][data-y="2"]');
    expect(document.querySelector('.status-message')?.textContent).toContain('移動');
    click('#save');
    expect(document.querySelector('.status-message')?.textContent).toContain('セーブ');
  });

  it('offers named-only saves on startup and resumes the selected one', () => {
    const data: Record<string, string> = {};
    const storage: StorageLike = {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => {
        data[key] = value;
      },
      removeItem: (key) => {
        delete data[key];
      },
    };
    const initialState = createScenarioInitialState(maps[0]!);
    saveGameToSlot(storage, 'named', 'Only named', {
      mapId: maps[0]!.id,
      difficulty: 'normal',
      initialState,
      gameState: initialState,
      commands: [],
    });
    const document = launch({ storage: data });
    expect(document.querySelector('#title-continue')?.hasAttribute('disabled')).toBe(false);
    click('.load-save-slot[data-save-slot="named"]');
    expect(document.querySelector('.title-overlay')).toBeNull();
    expect(document.querySelector('.board')).not.toBeNull();
    expect(document.querySelector('.resource-row.enemy')?.textContent).toContain('不明');
  });

  it('keeps the board when loading fails and exposes invalid entries for deletion', () => {
    const document = launch();
    click('.title-map-card[data-map-id="skirmish"]');
    click('#begin-operation');
    click('.tile[data-x="0"][data-y="1"]');
    click('.tile[data-x="0"][data-y="2"]');
    // Movement feedback now survives the first render. Compare every persistent
    // board node while allowing its temporary presentation overlay to expire.
    const boardMarkup = () => {
      const board = document.querySelector('.board')!.cloneNode(true) as HTMLElement;
      board.querySelectorAll('.presentation-effect').forEach((effect) => effect.remove());
      return board.innerHTML;
    };
    const before = boardMarkup();
    expect(document.querySelector('.tile[data-x="0"][data-y="2"] .unit.red')).not.toBeNull();
    dom.window.localStorage.setItem('ministr.save.manual', '{broken');
    // Invoke the guarded menu handler even though the continue button reflects valid-save presence.
    document.querySelector('#continue')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(boardMarkup()).toBe(before);
    click('#open-title');
    expect(document.querySelector('.load-save-slot[data-save-slot="manual"]')?.hasAttribute('disabled')).toBe(true);
    click('.delete-save-slot[data-save-slot="manual"]');
    expect(dom.window.localStorage.getItem('ministr.save.manual')).toBeNull();
    click('#title-resume');
    expect(boardMarkup()).toBe(before);
  });

  it('opens editor, blocks empty operation, paints and undoes without losing the draft', () => {
    const document = launch();
    click('#title-editor');
    click('#editor-start');
    expect(document.querySelector('.editor-overlay')).not.toBeNull();
    expect(document.querySelector('.editor-notice')?.textContent).toContain('司令部');
    const terrain = document.querySelector('#editor-terrain') as HTMLSelectElement;
    terrain.value = 'forest';
    terrain.dispatchEvent(new dom.window.Event('change'));
    click('.editor-tile[data-editor-x="1"][data-editor-y="1"]');
    expect(document.querySelector('.editor-tile[data-editor-x="1"][data-editor-y="1"]')?.classList.contains('forest')).toBe(true);
    click('#editor-undo');
    expect(document.querySelector('.editor-tile[data-editor-x="1"][data-editor-y="1"]')?.classList.contains('plain')).toBe(true);
    click('#editor-redo');
    click('#editor-save');
    expect(dom.window.localStorage.getItem('ministr.scenarios.custom')).toContain('forest');
    click('#editor-close');
    expect(document.querySelector('.title-overlay')).not.toBeNull();
  });

  it('preserves an active match when replacement is cancelled, and closes the editor with Escape', () => {
    const document = launch();
    click('#title-training');
    click('#begin-operation');
    click('.tile[data-x="0"][data-y="1"]');
    click('.tile[data-x="0"][data-y="2"]');
    dom.window.confirm = () => false;
    click('#open-title');
    click('.title-map-card[data-map-id="canyon"]');
    expect(document.querySelector('.title-overlay')).not.toBeNull();
    click('#title-resume');
    expect(document.querySelector('.tile[data-x="0"][data-y="2"]')?.textContent).toContain('歩');
    click('#open-editor');
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.editor-overlay')).toBeNull();
  });

  it('switches primary screens and persists English without changing scenario identifiers', () => {
    const document = launch();
    const locale = document.querySelector('.title-overlay [data-locale]') as HTMLSelectElement;
    locale.value = 'en';
    locale.dispatchEvent(new dom.window.Event('change'));
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('#title-training')?.textContent).toBe('Practice the basics');
    expect(dom.window.localStorage.getItem('ministr.locale')).toBe('en');
    click('.title-map-card[data-map-id="skirmish"]');
    expect(document.querySelector('#begin-operation')?.textContent).toContain('Start');
  });

  it('stops writes on changes from another tab', () => {
    const document = launch();
    click('.title-map-card[data-map-id="skirmish"]');
    click('#begin-operation');
    dom.window.dispatchEvent(
      new dom.window.StorageEvent('storage', {
        key: 'ministr.save.manual',
        newValue: 'changed externally',
      }),
    );
    click('#save');
    expect(document.body.textContent).toContain('別のタブ');
    expect(dom.window.localStorage.getItem('ministr.save.manual')).toBeNull();
  });
});
