import { bindContextPanel, readContextPanel, renderContextPanel } from './contextPanel';
import { getLocale } from './locale';
import { buildInfo } from './buildInfo';
import { escapeHtml } from './strings';

export function arrangeFourArmyHud(root: HTMLElement, state: ReturnType<typeof readContextPanel>): void {
  const panel = root.querySelector<HTMLElement>('#four-command-panel')!;
  const header = root.querySelector<HTMLElement>('.four-header')!;
  const map = root.querySelector<HTMLElement>('.four-map-panel')!;
  const english = getLocale() === 'en';
  function move(target: Element, selector: string) {
    for (const el of root.querySelectorAll(selector)) target.append(el);
  }
  // Take the existing controls with their IDs; the game binds events and paints the board after the shell is assembled.
  const old = Array.from(panel.children);
  const selection = panel.querySelector('#four-selection')!.parentElement!;
  const undo = panel.querySelector('#four-undo-controls')!;
  const objectives = panel.querySelector('.four-objectives')!;
  const human = panel.querySelector('#four-human-panel')!;
  const history = Array.from(panel.querySelectorAll('.four-history'));
  const settings = old.filter((child) => ![selection, undo, objectives, human, ...history].includes(child));
  panel.classList.add('hud-panel');
  panel.innerHTML = renderContextPanel('four', '', {
    objectives: '',
    units: '<div id="four-ready-roster"></div>',
    production: `<button id="four-open-production" class="save-action">${english ? 'Production' : '生産メニュー'}</button>`,
    info: '',
    menu: `<div class="build-info">v${escapeHtml(buildInfo.version)} · ${escapeHtml(buildInfo.sha.slice(0, 12))} <button id="four-diagnostics">${english ? 'Save diagnostics' : '診断情報を保存'}</button></div>`,
  });
  const pinned = panel.querySelector('.hud-selection')!;
  const menu = panel.querySelector('#four-hud-menu')!;
  move(pinned, '#four-brief');
  pinned.append(selection.querySelector('h2')!, selection.querySelector('#four-selection')!, human);
  move(pinned, '#four-tile-info');
  const unitSection = panel.querySelector('#four-hud-units')!;
  unitSection.prepend(selection, undo);
  panel.querySelector('#four-hud-objectives')!.append(objectives);
  panel.querySelector('#four-hud-info')!.append(...history);
  menu.append(...settings);
  move(menu, '.four-playback-options, .four-header > label, #four-title, #four-close');
  header.classList.add('hud-status');
  move(panel.querySelector('#four-hud-info')!, '.four-turn');
  move(pinned, '#four-notice, #four-action-feedback');
  move(header, '#four-toggle');
  header.insertAdjacentHTML(
    'beforeend',
    `<strong id="four-hud-current" class="hud-current"></strong><span id="four-hud-funds" class="hud-funds"></span><button type="button" data-hud-menu aria-controls="four-hud-menu">${english ? 'Menu' : 'メニュー'}</button><button id="four-hud-end" class="end-turn" hidden>${english ? 'End turn' : 'ターン終了'} →</button>`,
  );
  move(header, '.four-armies');
  root.querySelector('.four-playback-row')?.remove();
  root.querySelector('.four-layout')?.classList.add('hud-layout');
  const keyboard = Array.from(map.children).find((el) => el.matches('p.four-hint:not([id])'));
  if (keyboard) {
    const help = document.createElement('details');
    help.className = 'hud-help';
    help.innerHTML = `<summary aria-label="${english ? 'Keyboard controls' : 'キー操作'}">?</summary>`;
    help.append(keyboard);
    const controls = map.querySelector('.four-map-heading')!;
    controls.insertAdjacentHTML('beforeend', `<button type="button" data-hud-open aria-controls="four-command-panel">${english ? 'Info' : '作戦情報'}</button>`);
    controls.append(help);
  }
  bindContextPanel(root, state);
}
