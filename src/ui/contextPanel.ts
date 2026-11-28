import { getLocale } from './locale';

const pageNames = {
  objectives: ['作戦目標', 'Objectives'],
  units: ['部隊', 'Units'],
  production: ['生産', 'Production'],
  info: ['情報', 'Intel'],
  menu: ['メニュー', 'Menu'],
} as const;

type Section = keyof typeof pageNames;
type Sections = Record<Section, string>;
const sections = Object.keys(pageNames) as Section[];
const name = (key: Section) => pageNames[key][getLocale() === 'en' ? 1 : 0];

export function renderContextPanel(prefix: string, pinned: string, content: Sections): string {
  const title = getLocale() === 'en' ? 'Match information' : '対局情報';
  return `<div class="hud-sheet-heading"><strong>${title}</strong><button type="button" data-hud-close>${getLocale() === 'en' ? 'Close' : '閉じる'}</button></div>
    <div class="hud-selection">${pinned}</div>
    <nav class="hud-tabs" aria-label="${title}">${sections
      .filter((key) => key !== 'menu')
      .map((key) => `<button type="button" data-hud-page="${key}" aria-controls="${prefix}-hud-${key}">${name(key)}</button>`)
      .join('')}</nav>
    <div class="hud-pages">${sections.map((key) => `<section class="hud-page" data-hud-section="${key}" id="${prefix}-hud-${key}" tabindex="-1" aria-label="${name(key)}">${content[key]}</section>`).join('')}</div>`;
}

export function readContextPanel(root: ParentNode, reset = false) {
  const panel = reset ? null : root.querySelector<HTMLElement>('.hud-panel');
  const section = panel?.querySelector<HTMLElement>('.hud-page[aria-current="true"]');
  const focused = panel?.ownerDocument.activeElement;
  const pageButton = focused instanceof HTMLButtonElement && panel?.contains(focused) ? focused.dataset.hudPage : undefined;
  return { section: (section?.dataset.hudSection ?? 'objectives') as Section, top: section?.scrollTop ?? 0, sheet: panel?.dataset.sheet === 'open', pageButton };
}

export function bindContextPanel(root: HTMLElement, state: ReturnType<typeof readContextPanel>): void {
  const panel = root.querySelector<HTMLElement>('.hud-panel');
  const pages = panel?.querySelector<HTMLElement>('.hud-pages');
  if (!panel || !pages) return;
  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-hud-page]'));
  const regions = Array.from(pages.querySelectorAll<HTMLElement>('.hud-page'));
  const sheetTrigger = root.querySelector<HTMLElement>('#mobile-panel, #four-mobile-panel');
  const sheet = (open: boolean) => {
    panel.dataset.sheet = open ? 'open' : 'closed';
    sheetTrigger?.setAttribute('aria-expanded', String(open));
  };
  const mark = (section: string) => {
    for (const region of regions) region.setAttribute('aria-current', String(region.dataset.hudSection === section));
    for (const button of buttons) button.setAttribute('aria-current', String(button.dataset.hudPage === section));
  };
  const activate = (section: string, focus = false) => {
    const index = regions.findIndex((region) => region.dataset.hudSection === section);
    if (index < 0) return;
    pages.scrollLeft = pages.clientWidth * index;
    mark(section);
    if (focus) (regions[index]!.querySelector<HTMLElement>('#match-options') ?? regions[index])?.focus({ preventScroll: true });
  };
  sheet(state.sheet);
  activate(state.section);
  const active = regions.find((region) => region.dataset.hudSection === state.section);
  if (active) active.scrollTop = state.top;
  if (state.pageButton && document.activeElement === document.body) buttons.find((button) => button.dataset.hudPage === state.pageButton)?.focus({ preventScroll: true });
  pages.onscroll = () => {
    const index = Math.round(pages.scrollLeft / (pages.clientWidth || 1));
    if (regions[index]) mark(regions[index]!.dataset.hudSection!);
  };
  for (const [index, button] of buttons.entries()) {
    button.onclick = () => activate(button.dataset.hudPage!);
    button.onkeydown = (event) => {
      const next =
        event.key === 'ArrowRight'
          ? (index + 1) % buttons.length
          : event.key === 'ArrowLeft'
            ? (index + buttons.length - 1) % buttons.length
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : undefined;
      if (next === undefined) return;
      event.preventDefault();
      buttons[next]!.focus({ preventScroll: true });
      activate(buttons[next]!.dataset.hudPage!);
    };
  }
  const showInfo = root.querySelector<HTMLButtonElement>('[data-hud-open]');
  if (showInfo)
    showInfo.onclick = () => {
      sheet(true);
      activate('objectives', true);
    };
  const menu = root.querySelector<HTMLButtonElement>('[data-hud-menu]');
  if (menu)
    menu.onclick = () => {
      sheet(true);
      activate('menu', true);
    };
  const close = panel.querySelector<HTMLButtonElement>('[data-hud-close]');
  const dismiss = () => {
    sheet(false);
    (root.querySelector<HTMLElement>('#mobile-panel, #four-mobile-panel') ?? showInfo ?? menu)?.focus({ preventScroll: true });
  };
  if (close) close.onclick = dismiss;
  panel.onkeydown = (event) => {
    if (event.key === 'Escape' && panel.dataset.sheet === 'open') {
      event.stopPropagation();
      dismiss();
    }
  };
}

export function openContextSheet(panel: HTMLElement | null): void {
  if (!panel) return;
  panel.dataset.sheet = 'open';
  panel.focus({ preventScroll: true });
  document.querySelector<HTMLElement>(panel.id.startsWith('four-') ? '#four-mobile-panel' : '#mobile-panel')?.setAttribute('aria-expanded', 'true');
}
