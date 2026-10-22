import { afterEach, expect, it } from 'vitest';
import { buildBridge, createBoard, createGameState, type GameState } from '../game';
import { force, valueOf } from '../game/operations.fixture';
import { bridgeMarker, renderBridgeControls } from './bridges';
import { inspectTile } from './tileInspector';
import { setLocale } from './locale';
import { renderMapGenerator } from './standaloneSystems';

function field(): GameState {
  const board = createBoard(7, 5);
  for (let y = 0; y < 5; y++) board.terrain[y]![3] = { kind: 'sea' };
  return { ...createGameState(board), ruleVersion: 9, units: [force('e', 'engineer', 2, 2)], players: { red: { gold: 2000, income: 0 }, blue: { gold: 0, income: 0 } } };
}
afterEach(() => setLocale('ja'));
it('offers construction, target selection, confirmation and cancellation in both locales', () => {
  for (const locale of ['ja', 'en'] as const) {
    setLocale(locale);
    const state = field();
    document.body.innerHTML = renderBridgeControls(state, 'red', 'e', true);
    expect((document.querySelector('#bridge-unit') as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.textContent).toContain('1000G');
    document.body.innerHTML = renderBridgeControls(state, 'red', 'e', true, { unitId: 'e' });
    expect(document.querySelector('#bridge-cancel')).not.toBeNull();
    expect(document.querySelector('#bridge-confirm')).toBeNull();
    document.body.innerHTML = renderBridgeControls(state, 'red', 'e', true, { unitId: 'e', destination: { x: 3, y: 2 } });
    expect((document.querySelector('#bridge-confirm') as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.textContent).toContain('(4, 3)');
    document.body.innerHTML = renderBridgeControls(state, 'red', 'e', false, { unitId: 'e', destination: { x: 3, y: 2 } });
    expect((document.querySelector('#bridge-confirm') as HTMLButtonElement).disabled).toBe(true);
  }
});
it('hides enemy and old-rule controls, disables impossible building and shows owned limits', () => {
  const state = field();
  expect(renderBridgeControls({ ...state, ruleVersion: 8 }, 'red', 'e', true)).toBe('');
  expect(renderBridgeControls(state, 'blue', 'e', true)).toBe('');
  expect(renderBridgeControls(state, 'red', undefined, true)).toBe('');
  for (const blocked of [
    { ...state, players: { ...state.players, red: { gold: 0, income: 0 } } },
    { ...state, board: createBoard(7, 5) },
    valueOf(buildBridge(state, 'e', { x: 3, y: 2 })),
  ]) {
    document.body.innerHTML = renderBridgeControls(blocked, 'red', 'e', true);
    expect((document.querySelector('#bridge-unit') as HTMLButtonElement).disabled).toBe(true);
  }
  expect(renderBridgeControls(valueOf(buildBridge(state, 'e', { x: 3, y: 2 })), 'red', 'e', true)).toContain('1 / 2');
  document.body.innerHTML = renderBridgeControls(state, 'red', 'e', true, { unitId: 'e', destination: { x: 0, y: 0 } });
  expect((document.querySelector('#bridge-confirm') as HTMLButtonElement).disabled).toBe(true);
});
it('shows the public bridge under fog without revealing its occupant', () => {
  const state = valueOf(buildBridge(field(), 'e', { x: 3, y: 2 }));
  state.units = [force('secret', 'tank', 3, 2, { owner: 'blue' })];
  expect(bridgeMarker(state, { x: 3, y: 2 })).toContain('horizontal');
  expect(bridgeMarker(state, { x: 0, y: 0 })).toBe('');
  const shown = inspectTile(state, { x: 3, y: 2 }, 'red', new Set(), 'tank')!;
  expect(shown.unit).toBeUndefined();
  expect(shown.rows.find((row) => row.label === '仮設橋')?.value).toContain('公開');
  expect(shown.rows.find((row) => row.label === '移動コスト')?.value).toBe('1');
  const vertical = { ...state, board: createBoard(7, 5) };
  for (let x = 0; x < 7; x++) vertical.board.terrain[2]![x] = { kind: 'sea' };
  setLocale('en');
  expect(bridgeMarker(vertical, { x: 3, y: 2 })).toContain('vertical');
  expect(bridgeMarker(vertical, { x: 3, y: 2 })).toContain('>B<');
});
it('renders the selected generation preset and escapes seed input', () => {
  document.body.innerHTML = renderMapGenerator({ size: 16, sea: 'coast', seed: '<script>', preset: 'frontline' }, '', true);
  expect((document.querySelector('#title-generator-preset') as HTMLSelectElement).value).toBe('frontline');
  expect(document.querySelector('script')).toBeNull();
});
