import { getLocale } from './locale';
import { escapeHtml } from './strings';

interface BriefingShell {
  mapName: string;
  variants?: string;
  preview: string;
  overview: string;
  settings?: string;
  actions: string;
  describedBy?: string;
}

/** Both match controllers supply trusted sections and keep ownership of their setup state. */
export function renderBriefingShell({ mapName, variants, preview, overview, settings, actions, describedBy }: BriefingShell): string {
  return `<div class="briefing-overlay" role="dialog" aria-modal="true" aria-labelledby="briefing-title"${describedBy ? ` aria-describedby="${escapeHtml(describedBy)}"` : ''}>
    <section class="briefing-card">
      <div class="briefing-content">
        <h2 id="briefing-title" tabindex="-1" data-user-content>${escapeHtml(mapName)}</h2>
        ${variants ?? ''}
        <div class="briefing-columns">${preview}<div class="briefing-overview">${overview}</div></div>
        ${settings ?? ''}
      </div>
      <footer class="briefing-actions">${actions}</footer>
    </section></div>`;
}

function zoomLabel(zoomed: boolean): string {
  return getLocale() === 'en' ? (zoomed ? 'Fit map' : 'Enlarge map') : zoomed ? '全体を表示' : '地図を拡大';
}

export function renderBriefingPreview(content: string, zoomed: boolean): string {
  return `<section class="briefing-preview" data-zoomed="${zoomed}">
    <div class="briefing-preview-heading"><h3>${getLocale() === 'en' ? 'Battlefield map' : '戦域図'}</h3>
      <button type="button" class="save-action" data-briefing-zoom aria-pressed="${zoomed}">${zoomLabel(zoomed)}</button></div>
    ${content}</section>`;
}

export function toggleBriefingPreview(button: HTMLButtonElement): void {
  const preview = button.closest<HTMLElement>('.briefing-preview');
  if (!preview) return;
  const zoomed = preview.dataset.zoomed !== 'true';
  preview.dataset.zoomed = String(zoomed);
  button.setAttribute('aria-pressed', String(zoomed));
  button.textContent = zoomLabel(zoomed);
}
