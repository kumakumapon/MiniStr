import { afterEach, expect, it } from 'vitest';
import { createBoard, createGameState, type Unit } from '../game';
import { renderUnitBrief } from './unitBrief';
import { renderSpectatorCamera } from './spectatorCamera';

afterEach(() => {
  document.body.innerHTML = '';
});

it.each(['brief', 'spectator'] as const)('renders coordinates as numbers in %s even if a caller supplies malformed state', (view) => {
  const payload = '"><img data-injected="true" src="x">';
  const unit: Unit = {
    id: 'r1',
    kind: 'tank',
    owner: 'red',
    hp: 100,
    position: { x: payload as never, y: 0 },
    hasMoved: false,
    hasActed: false,
  };
  const state = { ...createGameState(createBoard(4, 4)), units: [unit] };
  const visible = new Set([`${payload},0`, 'NaN,0']);
  document.body.innerHTML = view === 'brief' ? renderUnitBrief(state, 'red', visible, 'r1', { x: 0, y: 0 }) : renderSpectatorCamera(state, visible, false);
  expect(document.querySelector('[data-injected]')).toBeNull();
  expect(document.body.textContent).toContain('(NaN, 1)');
  expect(document.body.innerHTML).not.toContain(payload);
});
