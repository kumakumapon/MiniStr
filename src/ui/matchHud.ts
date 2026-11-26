import { getLocale } from './locale';
import { escapeHtml } from './strings';

export function renderTurnProgress(title: string, options: { id?: string; hint?: string; action?: string; tone?: string } = {}): string {
  const label = getLocale() === 'en' ? 'Turn progress' : '手番の進行';
  return `<section class="map-turn-status ${escapeHtml(options.tone ?? '')}" aria-label="${label}"><div role="status"><strong${options.id ? ` id="${escapeHtml(options.id)}"` : ''}>${escapeHtml(title)}</strong>${options.hint ? `<p>${escapeHtml(options.hint)}</p>` : ''}</div>${options.action ?? ''}</section>`;
}

interface MatchAction {
  label: string;
  id?: string;
  command?: 'wait' | 'capture' | 'endTurn';
  enabled?: boolean;
  primary?: boolean;
  icon?: string;
  count?: number;
}

export function renderMatchActionBar(actions: readonly MatchAction[]): string {
  const label = getLocale() === 'en' ? 'Quick actions' : 'クイック操作';
  return `<nav class="mobile-action-bar" aria-label="${label}">${actions
    .map(
      (action) =>
        `<button type="button"${action.id ? ` id="${escapeHtml(action.id)}"` : ''}${action.command ? ` data-quick-action="${action.command}"` : ''} class="mobile-action${action.primary ? ' mobile-action-primary' : ''}"${action.enabled === false ? ' disabled' : ''}>${action.icon ? `<span aria-hidden="true">${escapeHtml(action.icon)}</span>` : ''}${escapeHtml(action.label)}${action.count === undefined ? '' : ` <strong>${action.count}</strong>`}</button>`,
    )
    .join('')}</nav>`;
}
