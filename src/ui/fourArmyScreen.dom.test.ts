import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FourArmyScreen } from './fourArmyScreen';
import { FourArmyCpuSession } from './fourArmyCpuSession';
import { FourArmyFileCodec } from './fourArmyFileCodec';
import { setLocale } from './locale';
import * as locale from './locale';
import { fourArmySpectatorFixture } from '../game/fourArmySpectator.fixture';
import { handleFourArmyCpuRequest } from '../ai/fourArmyCpuProtocol';
import { encodeFourArmySpectatorSave, FOUR_ARMY_SAVE_KEYS, FOUR_ARMY_AUTO_SAVE_KEY } from '../game/fourArmySpectatorSave';
import * as download from './download';
import { fourArmyActionFixture } from '../../tests/e2e/helpers/fourArmyActionFixture';
import { type MusicSettings } from './music';
import { FOUR_ARMY_MUSIC_KEY, loadFourArmyMusic } from '../game/musicSettings';
import { ACTION_SCENE_SETTINGS_KEY } from '../game/actionSceneSettings';

describe('four-army spectator controller', () => {
  it('disables an active capture independently of combat and preserves a single committed command', async () => {
    const fixture = fourArmyActionFixture('capture');
    values.set(FOUR_ARMY_SAVE_KEYS[0], fixture.text);
    values.set('ministr.battleScene.settings', '{"twoArmy":false,"multiArmy":true}');
    values.set(ACTION_SCENE_SETTINGS_KEY, '{"twoArmy":false,"multiArmy":true}');
    screen.open();
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    const unit = fixture.before.units.find((u) => fixture.command.type === 'capture' && u.id === fixture.command.unitId)!;
    click(`#four-board > [data-x="${unit.position!.x}"][data-y="${unit.position!.y}"]`);
    click('[data-human-action="capture"]');
    expect(query('.action-capture-progress').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.root.inert).toBe(true);
    const input = query<HTMLInputElement>('#action-scenes-multiArmy-overlay');
    input.checked = false;
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(screen.root.inert).toBe(false));
    expect(document.querySelector('.action-scene')).toBeNull();
    expect(query('#four-turn').textContent).toContain(`${fixture.count + 1} commands`);
    expect(values.get(ACTION_SCENE_SETTINGS_KEY)).toBe('{"twoArmy":false,"multiArmy":false}');
    expect(values.get('ministr.battleScene.settings')).toBe('{"twoArmy":false,"multiArmy":true}');
    expect(query<HTMLInputElement>('#battle-scenes-multiArmy').checked).toBe(true);
  });
  it('defers real supply until hotseat confirmation and clears it when leaving the match', async () => {
    const fixture = fourArmyActionFixture('logistics', 'hotseat');
    values.set(FOUR_ARMY_SAVE_KEYS[0], fixture.text);
    screen.open();
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(document.querySelector('#four-handoff-start')).not.toBeNull());
    click('#four-handoff-start');
    click('[data-human-action="endTurn"]');
    await vi.waitFor(() => expect(document.querySelector('#four-handoff-start')).not.toBeNull());
    expect(document.querySelector('.action-scene')).toBeNull();
    expect(document.querySelector('#four-board')).toBeNull();
    click('#four-handoff-start');
    expect(query('.action-scene-logistics').textContent).toContain('63 → 70');
    click('#tactical-scene-skip');
    await vi.waitFor(() => expect(screen.root.inert).toBe(false));
    click('#four-menu');
    expect(document.querySelector('.action-scene')).toBeNull();
    expect(query('#four-start')).not.toBeNull();
  });
  it('preserves a legacy save and prefix until explicitly switching the future CPU and saving again', async () => {
    const old = JSON.stringify(fourArmySpectatorFixture(2));
    values.set(FOUR_ARMY_SAVE_KEYS[0], old);
    screen.open();
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    click('#four-export');
    await vi.waitFor(() => expect(download.downloadJson).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(download.downloadJson).mock.calls.at(-1)![1]).cpuVersion).toBe('four-army-cpu-v1');
    click('#four-upgrade-cpu');
    expect(query('#four-turn').textContent).toContain('2 commands');
    expect(query('#four-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(values.get(FOUR_ARMY_SAVE_KEYS[0])).toBe(old);
    expect(document.querySelector('#four-upgrade-cpu')).toBeNull();
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!).cpuVersion).toBe('four-army-cpu-v7'));
    const saved = JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!);
    expect(saved.archive.payload.commands.rows).toHaveLength(2);
    expect(saved.archive.payload.state).toEqual(JSON.parse(old).archive.payload.state);
  });
  let codec: FourArmyFileCodec;
  const music = vi.fn<(settings: MusicSettings) => void>();
  let screen: FourArmyScreen, values: Map<string, string>, writable: boolean, closed: () => void;
  const query = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const click = (s: string) => query<HTMLButtonElement>(s).click();
  const change = (s: string, value: string) => {
    const e = query<HTMLInputElement>(s);
    e.value = value;
    e.dispatchEvent(new Event('change', { bubbles: true }));
  };
  it('uses only participating armies to summarize detailed setup and starts the reviewed controllers', () => {
    const details = () => query<HTMLDetailsElement>('#four-setup-options');
    expect(details().open).toBe(false);
    query('#four-setup-summary').click();
    change('#four-map', 'compact');
    change('#four-mode', 'custom');
    for (const army of ['army1', 'army2']) {
      const input = query<HTMLInputElement>(`[data-active-army="${army}"]`);
      input.click();
    }
    expect(details().open).toBe(true);
    expect(query('#four-start-summary').textContent).toContain('Watch 2 CPUs');
    expect(query('#four-start').textContent).toBe('Open CPU observation');
    change('#four-controller-army3', 'human');
    expect(query('#four-start-summary').textContent).toContain('Play as Army 3 · 1 CPU');
    click('#four-setup-confirm');
    expect(details().open).toBe(false);
    expect(document.activeElement?.id).toBe('four-start');
    start();
    expect(query<HTMLSelectElement>('#four-view').value).toBe('army3');
    expect(query('#four-army-info').children).toHaveLength(2);
  });
  it.each([3, 4] as const)('starts compact %i-army play with a real roster and schema6 autosave', async (count) => {
    change('#four-map', 'compact');
    change('#four-count', String(count));
    change('#four-mode', 'human');
    expect(query('#four-heading').textContent).toContain(`${count}-army`);
    expect(query('#four-count').closest('label')?.textContent).toContain('Armies');
    start();
    expect(query('#four-board').children).toHaveLength(252);
    expect(query('#four-turn').textContent).toContain(count === 3 ? '/21' : '/20');
    expect(query('#four-army-info').children).toHaveLength(count);
    expect(query('#four-army-info').textContent).toContain('4/8');
    if (count === 3) expect(query('#four-army-info').textContent).not.toContain('Army 4');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(true));
    const raw = JSON.parse(values.get(FOUR_ARMY_AUTO_SAVE_KEY)!);
    expect(raw).toMatchObject({ schemaVersion: 6, cpuVersion: 'four-army-cpu-v7', archive: { payload: { map: { match: { ending: 'short' } } } } });
    click(count === 3 ? '#four-board > [data-x="7"][data-y="2"]' : '#four-board > [data-x="2"][data-y="4"]');
    click('[data-human-action="wait"]');
    expect(query('#four-turn').textContent).toContain('1 commands');
    click('#four-undo');
    expect(query('#four-turn').textContent).toContain('0 commands');
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    expect(JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!).schemaVersion).toBe(6);
    click('#four-menu');
    change('#four-map', 'wide');
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    expect(query('#four-board').children).toHaveLength(252);
    expect(query('#four-toggle').hidden).toBe(true);
  });
  it('keeps unlimited small settings separate from the wide four-army map', () => {
    change('#four-map', 'compact');
    change('#four-count', '3');
    change('#four-ending', 'unlimited');
    expect(query('.four-brief').textContent).toContain('No round-limit decision');
    start();
    expect(query('#four-turn').textContent).not.toContain('/20');
    click('#four-menu');
    change('#four-map', 'wide');
    expect(query<HTMLSelectElement>('#four-count').disabled).toBe(true);
    expect(query<HTMLSelectElement>('#four-count').value).toBe('4');
    start();
    expect(query('#four-board').children).toHaveLength(1024);
  });
  it('starts arbitrary two-army identities and retains controller changes across verified reload', async () => {
    change('#four-map', 'outpost');
    change('#four-mode', 'human');
    for (const army of ['army1', 'army3']) {
      const e = query<HTMLInputElement>(`[data-active-army="${army}"]`);
      e.checked = false;
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect(query<HTMLSelectElement>('#four-count').value).toBe('2');
    start();
    expect(query('#four-army-info').children).toHaveLength(2);
    expect(query<HTMLSelectElement>('#four-view').value).toBe('army2');
    change('[data-live-controller="army2"]', 'cpu');
    expect(query('#four-turn').textContent).toContain('0 commands');
    change('[data-live-controller="army2"]', 'human');
    expect(document.querySelector('#four-board')).toBeNull();
    click('#four-handoff-start');
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    const raw = JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!);
    expect(raw.controlHistory.events).toEqual([
      { at: 0, army: 'army2', from: 'human', to: 'cpu' },
      { at: 0, army: 'army2', from: 'cpu', to: 'human' },
    ]);
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    expect(query('#four-turn').textContent).toContain('0 commands');
  });
  it('shows allied naval vision, oriented bridges and only personally controlled logistics', () => {
    change('#four-map', 'strait');
    change('#four-mode', 'human');
    const team = query<HTMLInputElement>('#four-team-mode');
    team.checked = true;
    team.dispatchEvent(new Event('change', { bubbles: true }));
    start();
    expect(query('#four-board').children).toHaveLength(255);
    expect(document.querySelectorAll('#four-board .bridge-marker.vertical')).toHaveLength(2);
    expect(query('#four-army-info').textContent).toContain('Team A');
    expect(query('#four-logistics-roster').textContent).toContain('Units and logistics (4)');
    change('[data-live-controller="army3"]', 'human');
    expect(document.querySelector('#four-board')).toBeNull();
    click('#four-handoff-start');
    expect(query('#four-turn').textContent).toContain('0 commands');
  });
  const start = () => click('#four-start');
  beforeEach(() => {
    document.body.innerHTML = '';
    setLocale('en');
    values = new Map();
    writable = true;
    music.mockClear();
    closed = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(download, 'downloadJson').mockImplementation(() => {});
    codec = new FourArmyFileCodec(() => {
      throw Error('no worker');
    });
    screen = new FourArmyScreen({
      storage: {
        get length() {
          return values.size;
        },
        key: (i) => [...values.keys()][i] ?? null,
        getItem: (k) => values.get(k) ?? null,
        setItem: (k, v) => {
          values.set(k, v);
        },
        removeItem: (k) => {
          values.delete(k);
        },
      },
      persistent: () => true,
      writable: () => writable,
      conflicted: () => false,
      writerState: () => 'owned',
      retrySaving: vi.fn(),
      onOpen: vi.fn(),
      onClose: closed,
      onTitle: vi.fn(),
      allowClassicMap: () => true,
      onLocale: setLocale,
      onGesture: vi.fn(),
      onMusic: music,
      codec,
      createSession: (state, settings, cpuVersion, humanArmy) =>
        new FourArmyCpuSession(
          state,
          () => {
            const w = {
              onmessage: null as ((e: MessageEvent) => void) | null,
              onerror: null,
              terminate: vi.fn(),
              postMessage: (data: unknown) => queueMicrotask(() => w.onmessage?.({ data: handleFourArmyCpuRequest(data) } as MessageEvent)),
            };
            return w as unknown as Worker;
          },
          settings,
          cpuVersion,
          humanArmy,
        ),
    });
    screen.open();
    expect(query<HTMLSelectElement>('#four-mode').value).toBe('human');
    change('#four-map', 'wide');
    change('#four-mode', 'spectator');
  });
  afterEach(() => {
    screen.root.querySelector<HTMLButtonElement>('#four-close')?.click();
    screen.root.remove();
    vi.restoreAllMocks();
  });
  it('switches between map variants and returns to the standard briefing', () => {
    screen.open({ map: 'outpost', count: 3, mode: 'cpu' });
    expect(query('#four-start-map').textContent).toBe('Outpost Assault');
    expect(query('#four-start-summary').textContent).toContain('21-round decision');
    change('#four-variants', '2');
    expect(query('#four-start-summary').textContent).toContain('20-round decision');
    change('#four-variants', 'standard');
    expect(closed).toHaveBeenCalledWith('outpost');
    expect(screen.active).toBe(false);
    expect(screen.canReturnFromTitle).toBe(false);
  });

  it('keeps a suspended match and the concealed handoff when returning from the title', async () => {
    const fixture = fourArmyActionFixture('logistics', 'hotseat');
    values.set(FOUR_ARMY_SAVE_KEYS[0], fixture.text);
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-handoff-start')).toBeTruthy());
    click('#four-title');
    expect(screen.canReturnFromTitle).toBe(true);
    expect(screen.root.children).toHaveLength(0);
    screen.resumeFromTitle();
    expect(query('#four-handoff-start')).toBeTruthy();
    expect(document.querySelector('#four-board')).toBeNull();
    click('#four-handoff-start');
    expect(query('#four-board')).toBeTruthy();
  });

  it('renders translated BGM track labels as literal text in shared and army options', () => {
    const label = 'Evening <live> & "studio"';
    vi.spyOn(locale, 'translateText').mockReturnValue(label);
    screen.open();
    for (const selector of ['#four-music-shared', '#four-music-army4']) {
      const option = query<HTMLOptionElement>(`${selector} option[value="dawn"]`);
      expect(option.textContent).toBe(label);
      expect(option.children).toHaveLength(0);
    }
  });
  it('switches the actual playback selection for each recorded turn and keeps the shared track in setup', async () => {
    const saved = fourArmySpectatorFixture(4);
    values.set(FOUR_ARMY_SAVE_KEYS[0], JSON.stringify(saved));
    screen.open();
    const checkbox = query<HTMLInputElement>('#four-music-by-army');
    expect(checkbox.checked).toBe(false);
    checkbox.click();
    change('#four-music-shared', 'mist');
    change('#four-music-army1', 'dawn');
    change('#four-music-army2', 'drive');
    change('#four-music-army3', 'rock-blue');
    change('#four-music-army4', 'wasteland');
    expect(music).toHaveBeenLastCalledWith(expect.objectContaining({ fieldTrack: 'mist', armyTracks: false }));
    expect(values.has('ministr.music.settings')).toBe(false);
    expect(JSON.parse(values.get(FOUR_ARMY_MUSIC_KEY)!).tracks).toEqual({ army1: 'dawn', army2: 'drive', army3: 'rock-blue', army4: 'wasteland' });
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    click('#four-replay');
    for (const [position, track] of ['dawn', 'drive', 'rock-blue', 'wasteland'].entries()) {
      await vi.waitFor(() => expect(query('#four-replay-count').textContent).toBe(`${position}/4`));
      expect(music).toHaveBeenLastCalledWith(expect.objectContaining({ fieldTrack: track }));
      if (position < 3) click('#four-step');
    }
  });
  it('rejects restored BGM settings with an unknown army track', () => {
    values.set(FOUR_ARMY_MUSIC_KEY, JSON.stringify({ muted: false, volume: 0.5, fieldTrack: 'mist', armyTracks: true, tracks: { army1: 'bad' } }));
    const bad = loadFourArmyMusic({
      get length() {
        return values.size;
      },
      key: (i) => [...values.keys()][i] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    });
    expect(bad).toMatchObject({ fieldTrack: 'march', armyTracks: false });
  });
  it('autosaves the initial human turn separately and rewinds an own wait together with history', async () => {
    change('#four-mode', 'human');
    values.set(FOUR_ARMY_SAVE_KEYS[1], 'manual original');
    start();
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(true));
    const original = values.get(FOUR_ARMY_AUTO_SAVE_KEY)!;
    expect(JSON.parse(original).archive.payload.commands.rows).toHaveLength(0);
    click('#four-board > [data-x="4"][data-y="4"]');
    click('[data-human-action="wait"]');
    expect(query<HTMLButtonElement>('#four-undo').disabled).toBe(false);
    expect(query('#four-events').textContent).toContain('waited');
    click('#four-undo');
    expect(query('#four-turn').textContent).toContain('0 commands');
    expect(query('#four-events').textContent).not.toContain('waited');
    expect(query<HTMLButtonElement>('#four-undo').disabled).toBe(true);
    click('[data-human-action="wait"]');
    click('#four-recon');
    click('#four-board > [data-x="16"][data-y="16"]');
    expect(query<HTMLButtonElement>('#four-undo').disabled).toBe(true);
    expect(values.get(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(original);
    click('#four-auto-load');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    expect(query('#four-turn').textContent).toContain('0 commands');
    expect(values.get(FOUR_ARMY_SAVE_KEYS[1])).toBe('manual original');
  });
  it('preserves and exports an unknown autosave and deletes only that slot', async () => {
    const raw = '{"schemaVersion":999}';
    values.set(FOUR_ARMY_AUTO_SAVE_KEY, raw);
    values.set(FOUR_ARMY_SAVE_KEYS[0], 'manual original');
    change('#four-mode', 'human');
    start();
    await vi.waitFor(() => expect(query('#four-auto-status').textContent).toContain('Existing autosave could not be verified'));
    expect(values.get(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(raw);
    click('#four-auto-export');
    expect(download.downloadJson).toHaveBeenCalledWith('ministr-four-army-autosave-original.json', raw);
    click('#four-auto-delete');
    expect(values.has(FOUR_ARMY_AUTO_SAVE_KEY)).toBe(false);
    expect(query('#four-auto-status').textContent).toBe('No autosave yet.');
    expect(values.get(FOUR_ARMY_SAVE_KEYS[0])).toBe('manual original');
  });
  it('rechecks an autosave original after the deletion confirmation', async () => {
    values.set(FOUR_ARMY_AUTO_SAVE_KEY, '{');
    change('#four-mode', 'human');
    start();
    await vi.waitFor(() => expect(query('#four-auto-status').textContent).toContain('Existing autosave could not be verified'));
    vi.mocked(window.confirm).mockImplementationOnce(() => {
      values.set(FOUR_ARMY_AUTO_SAVE_KEY, 'new original');
      return true;
    });
    click('#four-auto-delete');
    expect(values.get(FOUR_ARMY_AUTO_SAVE_KEY)).toBe('new original');
    expect(query('#four-notice').textContent).toContain('deletion was cancelled');
  });
  it('locks a selected human army across forged view changes, pending setup changes and replay', async () => {
    change('#four-mode', 'human');
    change('#four-human-army', 'army3');
    change('#four-order-0', 'army3');
    change('#four-order-2', 'army1');
    start();
    expect(query('#four-turn').textContent).toContain('Your turn');
    expect(query<HTMLSelectElement>('#four-view').disabled).toBe(true);
    expect(query<HTMLSelectElement>('#four-view').value).toBe('army3');
    expect(query<HTMLButtonElement>('#four-toggle').disabled).toBe(true);
    expect(query('#four-unit').children).toHaveLength(8);
    change('#four-view', 'all');
    expect(query<HTMLSelectElement>('#four-view').value).toBe('army3');
    click('#four-menu');
    change('#four-mode', 'spectator');
    click('#four-return');
    expect(query('#four-turn').textContent).toContain('Your turn');
    click('#four-replay');
    expect(query('#four-human-panel').textContent).toContain('disabled during replay');
    expect(query('[data-human-action]')).toBeNull();
    expect(query<HTMLSelectElement>('#four-view').disabled).toBe(true);
    click('#four-replay-close');
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    const saved = JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!);
    expect(saved).toMatchObject({ format: 'ministr-four-army-configurable', controllers: { army1: 'cpu', army2: 'cpu', army3: 'human', army4: 'cpu' }, view: 'army3' });
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    expect(query('#four-turn').textContent).toContain('Your turn');
  });
  it('restores the saved view when switching between a live human match and an old spectator record', async () => {
    change('#four-mode', 'human');
    change('#four-human-army', 'army3');
    start();
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    const legacy = fourArmySpectatorFixture();
    legacy.view = 'army4';
    values.set(FOUR_ARMY_SAVE_KEYS[1], JSON.stringify(legacy));
    screen.refreshStorage();
    screen.open();
    click('[data-load-slot="1"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    expect(query<HTMLSelectElement>('#four-view').value).toBe('army4');
    expect(query<HTMLSelectElement>('#four-view').disabled).toBe(false);
    expect(query('#four-human-panel').hidden).toBe(true);
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-human-panel').hidden).toBe(false));
    expect(query<HTMLSelectElement>('#four-view').value).toBe('army3');
    vi.mocked(window.confirm).mockClear();
    click('#four-close');
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it('uses the two-army keyboard flow, cancels selection without a command and retains the moved unit', async () => {
    change('#four-mode', 'human');
    start();
    const key = (key: string) => query('#four-board').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    expect(query('#four-board').style.gridAutoRows).toBe('44px');
    expect(query('#four-board').children).toHaveLength(1024);
    key('ArrowRight');
    key('ArrowDown');
    key('Enter');
    const original = query('#four-board > [data-x="4"][data-y="4"]');
    expect(query('#four-unit-brief').dataset.unitId).toBe('u1');
    key('ArrowLeft');
    expect(query('#four-unit-brief').dataset.unitId).toBe('u1');
    key('Escape');
    expect(query('#four-turn').textContent).toContain('0 commands');
    expect(query('#four-board .selected')).toBeNull();
    key('ArrowRight');
    key('Enter');
    key('ArrowLeft');
    key(' ');
    expect(query('#four-turn').textContent).toContain('1 commands');
    expect(query('#four-unit-brief').dataset.unitId).toBe('u1');
    expect(query('#four-board > [data-x="4"][data-y="4"]')).toBe(original);
    expect(query('#four-board > [data-x="3"][data-y="4"] .unit')).not.toBeNull();
    click('[data-human-action="wait"]');
    expect(query('#four-turn').textContent).toContain('2 commands');
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    expect(JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!).archive.payload.commands.rows).toHaveLength(2);
  });
  it('confirms the end of a human turn and preserves an enemy turn when backgrounded and reloaded', async () => {
    change('#four-mode', 'human');
    start();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    click('[data-human-action="endTurn"]');
    expect(query('#four-turn').textContent).toContain('0 commands');
    click('[data-human-action="endTurn"]');
    expect(query('#four-turn').textContent).toContain('Army 2');
    expect(query('#four-turn').textContent).toContain('1 commands');
    expect(query('[data-human-action]')).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toBe('Loaded and paused.'));
    expect(query('#four-turn').textContent).toContain('Army 2');
    expect(query<HTMLSelectElement>('#four-view').value).toBe('army1');
    expect(query('#four-toggle').getAttribute('aria-pressed')).toBe('false');
  });
  it('opens facility production, closes without a command and produces directly without ending the turn', () => {
    change('#four-mode', 'human');
    start();
    const key = (key: string) => query('#four-board').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    key('ArrowRight');
    key('ArrowRight');
    key('Enter');
    expect(query('#four-production-dialog')).not.toBeNull();
    key('Escape');
    expect(query('#four-production-dialog')).toBeNull();
    expect(query('#four-turn').textContent).toContain('0 commands');
    expect(document.activeElement).toBe(query('#four-board > [data-x="5"][data-y="3"]'));
    key('Enter');
    click('[data-production-kind="infantry"]');
    expect(query('#four-production-dialog')).toBeNull();
    expect(query('#four-unit').children).toHaveLength(9);
    expect(query('#four-turn').textContent).toContain('1 commands');
    expect(query('#four-turn').textContent).toContain('Your turn');
  });
  it('defers pointer focus rendering until click so the target cannot shift under the pointer', () => {
    change('#four-mode', 'human');
    start();
    const tile = query<HTMLButtonElement>('#four-board > [data-x="4"][data-y="4"]');
    tile.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    tile.focus();
    expect(query('#four-unit-brief').dataset.unitId).toBeUndefined();
    tile.dispatchEvent(new Event('pointerup', { bubbles: true }));
    tile.click();
    expect(query('#four-unit-brief').dataset.unitId).toBe('u1');
    expect(query('#four-board .selected')).toBe(tile);
    expect(query('#four-board .reachable')).not.toBeNull();
  });
  it('cycles ready units with N and ignores invalid destinations without consuming history', () => {
    change('#four-mode', 'human');
    start();
    click('#four-next-unit');
    expect(query('#four-unit-brief').dataset.unitId).toBe('u1');
    query('#four-board').dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    expect(query('#four-unit-brief').dataset.unitId).toBe('u2');
    click('#four-board > [data-x="31"][data-y="31"]');
    expect(query('#four-turn').textContent).toContain('0 commands');
    expect(query('#four-unit-brief').dataset.unitId).toBe('u2');
    expect(query('#four-board > [data-x="31"][data-y="31"] .unit')).toBeNull();
    expect(query('#four-board > [data-x="31"][data-y="31"]').classList.contains('fog')).toBe(true);
  });
  it('validates seed and duplicate turn order before starting, and supports keyboard selection and zoom', () => {
    change('#four-seed', 'bad');
    query('#four-seed').dispatchEvent(new Event('input', { bubbles: true }));
    start();
    expect(query('#four-notice').textContent).toContain('integer');
    change('#four-seed', '42');
    query('#four-seed').dispatchEvent(new Event('input', { bubbles: true }));
    change('#four-order-1', 'army1');
    start();
    expect(query('#four-notice').textContent).toContain('exactly once');
    change('#four-order-1', 'army2');
    start();
    expect(screen.root.tagName).toBe('DIV');
    expect(screen.root.getAttribute('role')).toBe('main');
    expect(query('#four-turn').textContent).toContain('0 commands');
    const label = query('#four-toggle').firstChild,
      unit = query('#four-unit').firstChild;
    screen.refreshStorage();
    expect(query('#four-toggle').firstChild).toBe(label);
    expect(query('#four-unit').firstChild).toBe(unit);
    query('#four-board').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(query('#four-selection').textContent).toContain('(5, 4)');
    click('#four-zoom-in');
    click('#four-zoom-out');
    click('#four-fit');
    click('#four-locate');
  });
  it('steps one CPU command, pauses for settings/view changes and changes language without replacing the match', async () => {
    start();
    click('#four-step');
    await vi.waitFor(() => expect(query('#four-turn').textContent).toContain('1 commands'));
    change('#four-view', 'army2');
    expect(query('#four-army-info').textContent).toContain('Funds hidden');
    change('#four-speed', '4');
    change('#four-difficulty-army3', 'hard');
    change('#four-policy-army3', 'defensive');
    expect(query('#four-notice').textContent).toContain('Settings changed');
    change('#four-locale', 'ja');
    expect(query('#four-turn').textContent).toContain('1 命令');
    change('#four-locale', 'en');
    click('#four-menu');
    click('#four-return');
    expect(query('#four-turn').textContent).toContain('1 commands');
  });
  it('plays and cancels scheduled work on background, escape and setup transitions', async () => {
    start();
    click('#four-toggle');
    expect(query('#four-toggle').getAttribute('aria-pressed')).toBe('true');
    window.dispatchEvent(new Event('pagehide'));
    expect(query('#four-toggle').getAttribute('aria-pressed')).toBe('false');
    click('#four-toggle');
    query('#four-board').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(query('#four-turn').textContent).toContain('0 commands');
    click('#four-toggle');
    click('#four-menu');
    expect(query('#four-return')).toBeTruthy();
    click('#four-return');
    expect(query('#four-toggle').getAttribute('aria-pressed')).toBe('false');
  });
  it('round trips a named dedicated save and exports while keeping existing normal data', async () => {
    values.set('ministr.save', 'legacy');
    start();
    change('#four-name', '<record>');
    query('#four-name').dispatchEvent(new Event('input', { bubbles: true }));
    change('#four-view', 'army4');
    change('#four-speed', '2');
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    expect(values.get('ministr.save')).toBe('legacy');
    expect(query('#four-slots').textContent).toContain('<record>');
    expect(query('#four-slots').querySelector('record')).toBeNull();
    change('#four-view', 'all');
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query<HTMLSelectElement>('#four-view').value).toBe('army4'));
    expect(query<HTMLSelectElement>('#four-speed').value).toBe('2');
    click('#four-export');
    await vi.waitFor(() => expect(download.downloadJson).toHaveBeenCalledWith('ministr-four-army.json', expect.any(String)));
    click('[data-delete-slot="0"]');
    expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(false);
  });
  it('leaves the live state unchanged when seeking or closing its replay', async () => {
    values.set(FOUR_ARMY_SAVE_KEYS[0], JSON.stringify(fourArmySpectatorFixture(24)));
    screen.open();
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-turn').textContent).toContain('24 commands'));
    click('#four-replay');
    await vi.waitFor(() => expect(query('#four-replay-count').textContent).toBe('0/24'));
    click('#four-replay-end');
    await vi.waitFor(() => expect(query('#four-replay-count').textContent).toBe('24/24'));
    click('#four-previous');
    await vi.waitFor(() => expect(query('#four-replay-count').textContent).toBe('23/24'));
    click('#four-replay-start');
    await vi.waitFor(() => expect(query('#four-replay-count').textContent).toBe('0/24'));
    change('#four-position', '12');
    await vi.waitFor(() => expect(query('#four-replay-count').textContent).toBe('12/24'));
    click('#four-replay-close');
    expect(query('#four-turn').textContent).toContain('24 commands');
  });
  it('rejects corrupt slots and prevents writes when the tab is not the storage owner', async () => {
    values.set(FOUR_ARMY_SAVE_KEYS[0], '{');
    start();
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(query('#four-notice').textContent).toContain('Could not load'));
    expect(query('#four-turn').textContent).toContain('0 commands');
    expect(values.get(FOUR_ARMY_SAVE_KEYS[0])).toBe('{');
    writable = false;
    screen.refreshStorage();
    expect(query<HTMLButtonElement>('[data-save-slot="1"]').disabled).toBe(true);
    click('#four-export');
    await vi.waitFor(() => expect(download.downloadJson).toHaveBeenCalled());
  });
  it('requires confirmation before discarding unsaved play and returns to the title', () => {
    start();
    vi.mocked(window.confirm).mockReturnValue(false);
    click('#four-close');
    expect(screen.active).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    click('#four-close');
    expect(screen.active).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('discards a slow file read when returning from setup to the current match', async () => {
    start();
    click('#four-menu');
    let finish!: (raw: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const input = query<HTMLInputElement>('#four-file');
    Object.defineProperty(input, 'files', { value: [{ size: 100, text: () => pending }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    click('#four-return');
    finish(JSON.stringify(fourArmySpectatorFixture(24)));
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(query('#four-turn').textContent).toContain('0 commands');
    expect(query('#four-notice').textContent).not.toContain('Loaded');
  });

  it('reuses unchanged verified output and invalidates it on match replacement or rename', async () => {
    start();
    const run = vi.spyOn(codec, 'run');
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    click('#four-export');
    await vi.waitFor(() => expect(download.downloadJson).toHaveBeenCalled());
    expect(run).toHaveBeenCalledTimes(1);
    click('#four-menu');
    change('#four-seed', '42');
    query('#four-seed').dispatchEvent(new Event('input', { bubbles: true }));
    start();
    click('#four-export');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(vi.mocked(download.downloadJson).mock.calls.at(-1)?.[1]).toContain('"seed":42'));
    change('#four-name', 'Renamed');
    query('#four-name').dispatchEvent(new Event('input', { bubbles: true }));
    click('#four-export');
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(vi.mocked(download.downloadJson).mock.calls.at(-1)?.[1]).toContain('Renamed'));
  });
  it('conceals both human handoffs and preserves the full controller allocation on save', async () => {
    change('#four-mode', 'custom');
    change('#four-controller-army1', 'human');
    change('#four-controller-army2', 'human');
    start();
    expect(document.querySelector('.tile')).toBeNull();
    expect(query('#four-handoff-title').textContent).toContain('Army 1');
    click('#four-handoff-start');
    expect(document.querySelectorAll('#four-board > button')).toHaveLength(1024);
    click('#four-human-panel [data-human-action="endTurn"]');
    expect(document.querySelector('.tile')).toBeNull();
    expect(document.querySelector('#four-unit-brief')).toBeNull();
    expect(document.querySelector('.mobile-action-bar')).toBeNull();
    expect(query('#four-handoff-title').textContent).toContain('Army 2');
    click('#four-menu');
    click('[data-save-slot="0"]');
    await vi.waitFor(() => expect(values.has(FOUR_ARMY_SAVE_KEYS[0])).toBe(true));
    const saved = JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!);
    expect(saved.format).toBe('ministr-four-army-configurable');
    expect(saved.controllers).toEqual({ army1: 'human', army2: 'human', army3: 'cpu', army4: 'cpu' });
    click('[data-load-slot="0"]');
    await vi.waitFor(() => expect(document.querySelector('#four-handoff-start')).not.toBeNull());
    expect(document.querySelector('.tile')).toBeNull();
    click('#four-handoff-start');
    expect(query('#four-human-panel').textContent).toContain('Army 2');
  });
  it('refuses ongoing multiplayer replay imports without replacing the current match or saved original', async () => {
    start();
    const incoming = encodeFourArmySpectatorSave({
      ...fourArmySpectatorFixture(4),
      format: 'ministr-four-army-configurable',
      schemaVersion: 3,
      controllers: { army1: 'human', army2: 'human', army3: 'cpu', army4: 'cpu' },
      view: 'army1',
    });
    if (!incoming.ok) throw Error(incoming.error);
    values.set(FOUR_ARMY_SAVE_KEYS[0], incoming.value);
    vi.mocked(window.confirm).mockClear();
    click('#four-import-replay');
    const input = query<HTMLInputElement>('#four-file');
    Object.defineProperty(input, 'files', { value: [{ size: incoming.value.length, text: async () => incoming.value }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(query('#four-notice').textContent).toContain('Import as a match to resume'));
    expect(screen.root.dataset.recordCount).toBe('0');
    expect(screen.root.dataset.mode).toBe('spectator');
    expect(document.querySelector('#four-replay-close')).toBeNull();
    expect(values.get(FOUR_ARMY_SAVE_KEYS[0])).toBe(incoming.value);
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it('opens a completed multiplayer record as a read-only replay', async () => {
    const { fourArmyHumanFinishedFixture } = await import('../game/fourArmyHuman.fixture');
    const encoded = encodeFourArmySpectatorSave(fourArmyHumanFinishedFixture('army4', true));
    if (!encoded.ok) throw Error(encoded.error);
    const file = JSON.parse(encoded.value);
    file.format = 'ministr-four-army-configurable';
    file.schemaVersion = 3;
    delete file.humanArmy;
    file.controllers = { army1: 'human', army2: 'human', army3: 'cpu', army4: 'cpu' };
    file.view = 'all';
    start();
    click('#four-import-replay');
    const input = query<HTMLInputElement>('#four-file');
    const raw = JSON.stringify(file);
    Object.defineProperty(input, 'files', { value: [{ size: raw.length, text: async () => raw }] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('#four-replay-close')).not.toBeNull());
    expect(document.querySelector('[data-human-action]')).toBeNull();
    expect(query<HTMLSelectElement>('#four-view').disabled).toBe(false);
  });
});
