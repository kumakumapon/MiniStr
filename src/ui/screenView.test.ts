import { expect, it } from 'vitest';
import { updateScreen } from './screenView';
import { BoardView } from './boardView';

const markup = (label: string, theme = 'summer') =>
  `<main class="game-shell"><header><button>${label}</button></header><section class="battle-layout"><div class="battlefield-wrap ${theme}"><p>${label}</p><div class="battlefield-stage"><section>${label}</section><div id="board-viewport" tabindex="0"><div class="board" aria-label="${label}"></div></div></div><footer>${label}</footer></div><aside>${label}</aside></section></main>`;
const setup = () => {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  return host;
};

it('keeps every board ancestor connected, replaces surrounding controls, and removes overlays', () => {
  const host = setup();
  updateScreen(host, markup('before'), false);
  const board = host.querySelector<HTMLElement>('.board')!;
  board.innerHTML = '<button class="tile">unchanged</button>';
  const ancestors: Element[] = [];
  for (let node: Element | null = board; node !== host; node = node!.parentElement) ancestors.push(node!);
  const control = host.querySelector('header button')!;
  control.addEventListener('click', () => {
    throw Error('stale listener');
  });
  host.insertAdjacentHTML('beforeend', '<div role="dialog">old overlay</div>');
  const observer = new MutationObserver(() => {});
  observer.observe(host, { childList: true, subtree: true });
  updateScreen(host, markup('after', 'winter'), true);
  const removed = observer.takeRecords().flatMap((record) => [...record.removedNodes]);
  observer.disconnect();
  expect(ancestors.every((node) => node.isConnected && !removed.includes(node))).toBe(true);
  expect(host.querySelector('.tile')!.textContent).toBe('unchanged');
  expect(host.querySelector('header button')).not.toBe(control);
  host.querySelector<HTMLButtonElement>('header button')!.click();
  expect(host.querySelector('header')!.textContent).toBe('after');
  expect(host.querySelector('.battlefield-wrap')!.className).toBe('battlefield-wrap winter');
  expect(board.getAttribute('aria-label')).toBe('after');
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('aside')!.textContent).toBe('after');
});

it('falls back atomically when a path is missing or retention is disabled', () => {
  const host = setup();
  updateScreen(host, markup('before'), true);
  let board = host.querySelector('.board');
  updateScreen(host, markup('covered'), false);
  expect(host.querySelector('.board')).not.toBe(board);
  updateScreen(host, '<main class="game-shell" inert><p>handoff</p></main>', true);
  expect(host.textContent).toBe('handoff');
  expect(host.querySelector('.board')).toBeNull();
  updateScreen(host, markup('returned'), true);
  board = host.querySelector('.board');
  expect(board).not.toBeNull();
  expect(host.querySelector('main')!.hasAttribute('inert')).toBe(false);
  updateScreen(host, '<main class="game-shell"><p>no board</p></main>', true);
  expect(host.textContent).toBe('no board');
  expect(board!.isConnected).toBe(false);
});

it('composes with BoardView for unchanged tiles, fog changes, locale and geometry invalidation', () => {
  const host = setup();
  const view = new BoardView();
  const draw = (cells: string[], identity: string) => {
    updateScreen(host, markup(identity), true);
    view.update(host.querySelector('.board'), cells, identity);
  };
  const first = '<button class="tile">plain</button>';
  draw([first, '<button class="tile">enemy</button>'], 'ja:2');
  const board = host.querySelector('.board')!;
  const plain = board.firstElementChild;
  draw([first, '<button class="tile">fog</button>'], 'ja:2');
  expect(host.querySelector('.board')).toBe(board);
  expect(board.firstElementChild).toBe(plain);
  expect(board.textContent).toBe('plainfog');
  draw([first, '<button class="tile">fog</button>'], 'en:2');
  expect(board.firstElementChild).not.toBe(plain);
  draw([first], 'en:1');
  expect(board.children).toHaveLength(1);
});

const withRoster = (version: string, selected = 'r1') =>
  markup('screen').replace(
    '<aside>screen</aside>',
    '<aside id="command-panel"><p>fresh control</p><details open id="logistics-roster" data-logistics-view="' +
      version +
      '" data-logistics-selected="' +
      selected +
      '"><summary>Roster</summary><ul id="logistics-list"><li><input value="model"></li></ul></details></aside>',
  );

it('keeps an unchanged open roster connected with focus and native control state', () => {
  const host = setup();
  updateScreen(host, withRoster('one'), false);
  const roster = host.querySelector<HTMLElement>('#logistics-roster')!;
  const input = roster.querySelector('input')!;
  input.value = 'draft';
  input.focus();
  const observer = new MutationObserver(() => {});
  observer.observe(host, { childList: true, subtree: true });
  updateScreen(host, withRoster('one', 'r2'), true);
  const removed = observer.takeRecords().flatMap((record) => [...record.removedNodes]);
  observer.disconnect();
  expect(host.querySelector('#logistics-roster')).toBe(roster);
  expect(removed.includes(roster)).toBe(false);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('draft');
  expect(roster.dataset.logisticsSelected).toBe('r2');
});

it('refreshes roster controls when the model changes, the screen is concealed or peer order changes', () => {
  const host = setup();
  updateScreen(host, withRoster('one'), false);
  const oldRoster = host.querySelector('#logistics-roster')!;
  updateScreen(host, withRoster('two'), true);
  expect(oldRoster.isConnected).toBe(false);
  const current = host.querySelector('#logistics-roster')!;
  const reversed = withRoster('two').replace(/(<div class="battlefield-wrap[\s\S]*<\/div>)(<aside id="command-panel"[\s\S]*<\/aside>)/, '$2$1');
  updateScreen(host, reversed, true);
  expect(current.isConnected).toBe(false);
  expect(host.querySelector('#logistics-roster')).not.toBeNull();
  const next = host.querySelector('#logistics-roster')!;
  updateScreen(host, '<main class="game-shell" inert>handoff</main>', false);
  expect(next.isConnected).toBe(false);
  expect(host.querySelector('#logistics-list')).toBeNull();
});
