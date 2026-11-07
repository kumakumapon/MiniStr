import { afterEach, expect, it } from 'vitest';
// @ts-expect-error Optional JSDOM declarations are not required by this project.
import { JSDOM } from 'jsdom';
import { distributedSource } from './distributedSource';
import { createScenarioInitialState, maps, saveGame } from '../../src/game';
import { combinedTactics } from '../../src/game/tactics';
import { valueOf } from '../../src/game/operations.fixture';
const source = distributedSource();
const saveKey = 'ministr.save.manual';
let dom: JSDOM;
function launch(saved?: string) {
  dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = () => true;
  dom.window.prompt = () => 'Default tactics';
  if (saved) dom.window.localStorage.setItem(saveKey, saved);
  dom.window.eval(source);
  return dom.window.document;
}
function click(selector: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw Error(`Missing ${selector}`);
  element.click();
}
function snapshot() {
  click('#save');
  return JSON.parse(dom.window.localStorage.getItem(saveKey)!);
}
afterEach(() => dom?.window.close());
it.each(['cpu', 'hotseat', 'spectate'])('starts a fresh %s match with default tactics and the revised layout', (mode) => {
  const document = launch();
  expect(document.querySelector('#title-tactical-preset').checked).toBe(true);
  click('.title-map-card[data-map-id="skirmish"]');
  click(`input[name="match-mode"][value="${mode}"]`);
  expect(document.querySelector('#briefing-supply-mode option[value="unlimited"]').disabled).toBe(true);
  click('#begin-operation');
  const saved =
    mode === 'spectate'
      ? (() => {
          click('#spectate-toggle');
          click('#save');
          return JSON.parse(
            dom.window.localStorage.getItem(
              [...Array(dom.window.localStorage.length)].map((_, i) => dom.window.localStorage.key(i)).find((key) => key.startsWith('ministr.save.slot.'))!,
            )!,
          );
        })()
      : snapshot();
  expect(saved.mode ?? 'cpu').toBe(mode);
  expect(saved.initialState.ruleVersion).toBe(14);
  expect(saved.initialState.scenarioSnapshot.tacticalOptions).toEqual(combinedTactics);
  expect(saved.initialState.scenarioSnapshot.name).toContain('/ Tactical v2');
  expect(maps[0]!.tacticalOptions).toBeUndefined();
  expect(maps[0]!.name).not.toContain('/ Tactical');
});
it('offers original rules and unlimited supplies when explicitly switched OFF', () => {
  const document = launch();
  click('#title-tactical-preset');
  click('.title-map-card[data-map-id="skirmish"]');
  const supply = document.querySelector('#briefing-supply-mode');
  supply.value = 'unlimited';
  supply.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  click('#begin-operation');
  const saved = snapshot();
  expect(saved.initialState.ruleVersion).toBe(9);
  expect(saved.initialState.tactics).toBeUndefined();
  expect(saved.initialState.scenarioSnapshot.tacticalOptions).toBeUndefined();
});
it('loads an old OFF save unchanged while the new-match title remains ON', () => {
  const initialState = createScenarioInitialState(maps[0]!);
  let raw = '';
  valueOf(
    saveGame(
      {
        getItem: () => null,
        setItem: (_key, value) => {
          raw = value;
        },
        removeItem: () => {},
      },
      saveKey,
      {
        mapId: maps[0]!.id,
        difficulty: 'normal',
        initialState,
        gameState: initialState,
        commands: [],
      },
    ),
  );
  const document = launch(raw);
  expect(document.querySelector('#title-tactical-preset').checked).toBe(true);
  click('#title-continue');
  const saved = snapshot();
  expect(saved.initialState).toEqual(JSON.parse(raw).initialState);
  expect(saved.gameState.tactics).toBeUndefined();
});
it('keeps basic training outside the new standalone default', () => {
  launch();
  click('#title-training');
  click('#begin-operation');
  expect(snapshot().initialState.tactics).toBeUndefined();
});
