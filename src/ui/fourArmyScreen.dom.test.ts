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
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(download, 'downloadJson').mockImplementation(() => {});
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
      codec: new FourArmyFileCodec(() => {
        throw Error('no worker');
      }),
      createSession: (state, settings) =>
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
        ),
    });
    screen.open();
  });
  afterEach(() => {
    click('#four-close');
    screen.root.remove();
    vi.restoreAllMocks();
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
    expect(query('#four-replay-count').textContent).toBe('0/24');
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
});
