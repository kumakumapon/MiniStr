import { distributedSource } from './distributedSource';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Optional JSDOM declarations are not required by this project.
import { JSDOM } from 'jsdom';
import { chooseCpuAction } from '../../src/ai/rules';
import { DAILY_RECORDS_KEY, dailyScenario } from '../../src/game/dailyChallenge';
import { applyGameCommand, createScenarioInitialState, MAX_CUSTOM_SCENARIOS, saveGame, type GameCommand, type StorageLike } from '../../src/game';
import { operationData } from '../../src/game/operations.fixture';

const source = distributedSource();
const catalogKey = 'ministr.scenarios.custom';
const saveKey = 'ministr.save.manual';
/** Frontline day on which the red hard CPU beats the easy CPU in 16 rounds (checked in dailyChallenge.test.ts). */
const DATE = '2026-02-03';
let dom: JSDOM;

function launch(options: { storage?: Record<string, string>; now?: string; locale?: string } = {}) {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window, { structuredClone, TextEncoder, TextDecoder });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.confirm = () => true;
  const RealDate = dom.window.Date;
  const fixed = Date.parse(options.now ?? `${DATE}T12:00:00Z`);
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(fixed);
      else super(...(args as [number]));
    }
    static override now() {
      return fixed;
    }
  }
  dom.window.Date = FixedDate;
  if (options.locale) dom.window.localStorage.setItem('ministr.locale', options.locale);
  for (const [key, value] of Object.entries(options.storage ?? {})) dom.window.localStorage.setItem(key, value);
  dom.window.eval(source);
  return dom.window.document;
}
function click(selector: string) {
  const element = dom.window.document.querySelector(selector);
  if (!element) throw Error(`Missing UI: ${selector}`);
  element.click();
}
function change(selector: string, value: string) {
  const element = dom.window.document.querySelector(selector) as HTMLSelectElement;
  if (!element) throw Error(`Missing UI: ${selector}`);
  element.value = value;
  element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}
const fullCatalog = () =>
  JSON.stringify({
    schemaVersion: 1,
    scenarios: Array.from({ length: MAX_CUSTOM_SCENARIOS }, (_, at) => operationData({ id: `custom-fill-${at}`, name: `fill ${at}` })),
    history: [],
  });
function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key) };
}
/** A finished, red-won save of the day's battlefield, as the app would have written it. */
function finishedDailySave(): string {
  const scenario = dailyScenario(DATE);
  if (!scenario.ok) throw Error(scenario.error);
  const initialState = createScenarioInitialState(scenario.value);
  let state = initialState;
  const commands: GameCommand[] = [];
  while (!state.winner && state.turn <= 40) {
    const command = chooseCpuAction(state, state.activePlayer === 'red' ? 'hard' : 'easy');
    const next = applyGameCommand(state, command);
    if (!next.ok) throw Error(next.error);
    commands.push(command);
    state = next.value;
  }
  if (state.winner !== 'red') throw Error('fixture must be a red victory');
  const storage = memory();
  const saved = saveGame(storage, saveKey, { mapId: scenario.value.id, difficulty: 'normal', initialState, commands, gameState: state });
  if (!saved.ok) throw Error(saved.error);
  return storage.data.get(saveKey)!;
}
afterEach(() => dom?.window.close());

describe('daily challenge in the distributed app', () => {
  it('starts from the title card with a full custom catalog, fixing the conditions', () => {
    const document = launch({ storage: { [catalogKey]: fullCatalog() } });
    const card = document.querySelector('.daily-card');
    expect(card?.getAttribute('data-daily-date')).toBe(DATE);
    expect(card?.textContent).toContain('D1-20260203-v3');
    expect(document.querySelectorAll('.title-map-card').length).toBe(document.querySelectorAll('.title-map-entry').length);
    expect(document.querySelectorAll('.title-map-card[data-map-id^="generated-"]')).toHaveLength(0);
    const customBefore = dom.window.localStorage.getItem(catalogKey);

    click('#daily-start');
    expect(document.querySelector('#briefing-title')).not.toBeNull();
    expect(document.querySelector('.daily-briefing')?.textContent).toContain('D1-20260203-v3');
    expect(document.querySelector('.daily-briefing .daily-ok')).not.toBeNull();
    for (const selector of ['#briefing-supply-mode', 'input[name="match-mode"]', '#difficulty'])
      expect(document.querySelector(selector)?.hasAttribute('disabled'), selector).toBe(true);
    // The handlers refuse even a forged change event: the match still starts on Normal with finite supplies.
    change('#difficulty', 'hard');
    change('#briefing-supply-mode', 'unlimited');
    click('#begin-operation');
    expect(document.querySelector('.board')).not.toBeNull();
    click('#save');
    const forged = JSON.parse(dom.window.localStorage.getItem(saveKey)!);
    expect(forged.difficulty).toBe('normal');
    expect(forged.initialState.ruleVersion).toBe(11);
    expect(forged.mode ?? 'cpu').toBe('cpu');
    // Nothing was written to the custom catalog: a daily battlefield never uses a slot.
    expect(dom.window.localStorage.getItem(catalogKey)).toBe(customBefore);
    expect(document.querySelector('#map option[selected], #map option:checked')).not.toBeNull();
  });

  it('marks a changed deployment as not recorded', () => {
    const document = launch();
    click('#daily-start');
    expect(document.querySelector('.daily-briefing .daily-ok')).not.toBeNull();
    const slot = document.querySelector('[data-deployment-player="red"]') as HTMLSelectElement;
    const alternative = [...slot.options].find((option) => option.value !== slot.value);
    expect(alternative).toBeDefined();
    change(`#${slot.id}`, alternative!.value);
    expect(document.querySelector('.daily-briefing .daily-warning')?.textContent).toContain('記録されません');
    click('#briefing-deployment-reset');
    expect(document.querySelector('.daily-briefing .daily-ok')).not.toBeNull();
  });

  it('records a resumed red victory, offers the ID, and retries the identical definition', () => {
    const document = launch({ storage: { [saveKey]: finishedDailySave(), [catalogKey]: fullCatalog() } });
    click('#title-continue');
    expect(document.querySelector('#daily-code')?.textContent).toBe('D1-20260203-v3');
    const stored = JSON.parse(dom.window.localStorage.getItem(DAILY_RECORDS_KEY) ?? 'null');
    expect(stored.schemaVersion).toBe(1);
    expect(stored.records).toHaveLength(1);
    expect(stored.records[0]).toMatchObject({ date: DATE, generation: 'd1' });
    expect(document.querySelector('.daily-result')?.textContent).toContain('最良記録を更新しました');
    // Operation records are a separate key and stay untouched.
    expect(dom.window.localStorage.getItem('ministr.operations.records')).toBeNull();

    let copied = '';
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async (text: string) => void (copied = text) }, configurable: true });
    click('#daily-copy-id');
    expect(copied).toBe('D1-20260203-v3');

    const heading = document.querySelector('.battlefield-heading h2')?.textContent;
    click('#restart');
    expect(document.querySelector('#briefing-title')?.textContent).toBe(heading);
    expect(document.querySelector('.daily-briefing')?.textContent).toContain('D1-20260203-v3');
    expect(document.querySelector('#difficulty')?.hasAttribute('disabled')).toBe(true);
    click('#begin-operation');
    expect(document.querySelector('.battlefield-heading h2')?.textContent).toBe(heading);
    expect(document.querySelector('.game-over')).toBeNull();
    // The retry is the same match: its saved state is the canonical turn one.
    click('#save');
    const resumed = JSON.parse(dom.window.localStorage.getItem(saveKey)!);
    expect(resumed.mapId).toBe(dailyScenario(DATE).ok ? (dailyScenario(DATE) as { value: { id: string } }).value.id : '');
    expect(resumed.commands).toEqual([]);
  });

  it('gives the players own settings back when leaving the daily match', () => {
    const document = launch();
    click('.title-map-card[data-map-id="skirmish"]');
    change('#briefing-supply-mode', 'unlimited');
    click('#begin-operation');
    change('#difficulty', 'hard');
    click('#open-title');
    click('#daily-start');
    expect((document.querySelector('#difficulty') as HTMLSelectElement).value).toBe('normal');
    expect((document.querySelector('#briefing-supply-mode') as HTMLSelectElement).value).toBe('finite');
    click('#briefing-back-to-title');
    click('.title-map-card[data-map-id="skirmish"]');
    expect((document.querySelector('#difficulty') as HTMLSelectElement).value).toBe('hard');
    expect((document.querySelector('#briefing-supply-mode') as HTMLSelectElement).value).toBe('unlimited');
    expect(document.querySelector('#difficulty')?.hasAttribute('disabled')).toBe(false);
  });

  it('starts the campaign as a CPU match after a daily match, not in the format set aside', () => {
    const document = launch();
    click('.title-map-card[data-map-id="skirmish"]');
    click('input[name="match-mode"][value="hotseat"]');
    click('#begin-operation');
    click('#open-title');
    click('#daily-start');
    click('#briefing-back-to-title');
    click('#title-campaign');
    click('.campaign-start:not([disabled])');
    click('#begin-operation');
    click('#end');
    // A restored hotseat format would stop at the device handoff instead of letting the CPU play blue.
    expect(document.querySelector('#handoff-start')).toBeNull();
  });

  it('starts practice on easy after a daily match instead of the difficulty set aside', () => {
    const document = launch();
    click('.title-map-card[data-map-id="skirmish"]');
    click('#begin-operation');
    change('#difficulty', 'hard');
    click('#open-title');
    click('#daily-start');
    click('#briefing-back-to-title');
    click('#title-training');
    expect((document.querySelector('#difficulty') as HTMLSelectElement).value).toBe('easy');
  });

  it('keeps today and the list of records in English, and deletes or resets only daily records', () => {
    const records = JSON.stringify({
      schemaVersion: 1,
      records: [
        { date: DATE, generation: 'd1', ruleVersion: 10, bestTurns: 9, bestLosses: 1, updatedAt: '2026-02-03T00:00:00.000Z' },
        { date: '2026-02-02', generation: 'd1', ruleVersion: 10, bestTurns: 12, bestLosses: 0, updatedAt: '2026-02-02T00:00:00.000Z' },
      ],
    });
    const document = launch({ locale: 'en', storage: { [DAILY_RECORDS_KEY]: records, 'ministr.operations.records': JSON.stringify({ schemaVersion: 1, records: [] }) } });
    expect(document.querySelector('.daily-best')?.textContent).toBe('Fastest 9 rounds, 1 losses');
    expect(document.querySelector('#daily-start')?.textContent).toContain("Start today's battlefield");
    expect(document.querySelectorAll('[data-daily-delete]')).toHaveLength(2);
    click(`[data-daily-delete="${DATE}"]`);
    expect(JSON.parse(dom.window.localStorage.getItem(DAILY_RECORDS_KEY)!).records.map((record: { date: string }) => record.date)).toEqual(['2026-02-02']);
    click('#daily-records-reset');
    expect(dom.window.localStorage.getItem(DAILY_RECORDS_KEY)).toBeNull();
    expect(dom.window.localStorage.getItem('ministr.operations.records')).not.toBeNull();
  });

  it('shows a corrupt record store as unreadable, refuses to overwrite it, and recovers through reset', () => {
    const document = launch({ storage: { [DAILY_RECORDS_KEY]: '{broken', [saveKey]: finishedDailySave() } });
    expect(document.querySelector('.daily-notice')?.textContent).toContain('壊れています');
    click('#title-continue');
    expect(dom.window.localStorage.getItem(DAILY_RECORDS_KEY)).toBe('{broken');
    click('#open-title');
    click('#daily-records-reset');
    expect(dom.window.localStorage.getItem(DAILY_RECORDS_KEY)).toBeNull();
  });
});

it.each(['ja', 'en'])('reports a discarded old victory truthfully in %s', (locale) => {
  const records = Array.from({ length: 60 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 3, i + 1)).toISOString().slice(0, 10),
    generation: 'd1',
    ruleVersion: 11,
    bestTurns: 10,
    bestLosses: 0,
    updatedAt: '2026-06-01T00:00:00.000Z',
  }));
  const raw = JSON.stringify({ schemaVersion: 1, records });
  const document = launch({ locale, storage: { [saveKey]: finishedDailySave(), [DAILY_RECORDS_KEY]: raw } });
  click('#title-continue');
  const notice = document.querySelector('.daily-result')?.textContent ?? '';
  expect(notice).toContain(locale === 'en' ? 'result was not saved' : '記録は保存されませんでした');
  if (locale === 'en') expect(notice).not.toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
  expect(dom.window.localStorage.getItem(DAILY_RECORDS_KEY)).toBe(raw);
});
