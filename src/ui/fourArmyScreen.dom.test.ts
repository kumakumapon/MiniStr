import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FourArmyScreen } from './fourArmyScreen';
import { FourArmyCpuSession } from './fourArmyCpuSession';
import { FourArmyFileCodec } from './fourArmyFileCodec';
import { setLocale } from './locale';
import { fourArmySpectatorFixture } from '../game/fourArmySpectator.fixture';
import { handleFourArmyCpuRequest } from '../ai/fourArmyCpuProtocol';
import { FOUR_ARMY_SAVE_KEYS } from '../game/fourArmySpectatorSave';
import * as download from './download';

describe('four-army spectator controller', () => {
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
    await vi.waitFor(() => expect(JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!).cpuVersion).toBe('four-army-cpu-v3'));
    const saved = JSON.parse(values.get(FOUR_ARMY_SAVE_KEYS[0])!);
    expect(saved.archive.payload.commands.rows).toHaveLength(2);
    expect(saved.archive.payload.state).toEqual(JSON.parse(old).archive.payload.state);
  });
  let codec: FourArmyFileCodec;
  let screen: FourArmyScreen, values: Map<string, string>, writable: boolean, closed: () => void;
  const query = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const click = (s: string) => query<HTMLButtonElement>(s).click();
  const change = (s: string, value: string) => {
    const e = query<HTMLInputElement>(s);
    e.value = value;
    e.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const start = () => click('#four-start');
  beforeEach(() => {
    document.body.innerHTML = '';
    setLocale('en');
    values = new Map();
    writable = true;
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
      onLocale: setLocale,
      onGesture: vi.fn(),
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
  });
  afterEach(() => {
    screen.root.querySelector<HTMLButtonElement>('#four-close')?.click();
    screen.root.remove();
    vi.restoreAllMocks();
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
    expect(saved).toMatchObject({ format: 'ministr-four-army-match', humanArmy: 'army3', view: 'army3' });
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
});
