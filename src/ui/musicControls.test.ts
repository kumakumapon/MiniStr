import { afterEach, expect, it } from 'vitest';
import { defaultMusicSettings } from './music';
import { renderMusicControls, syncMusicControls } from './musicControls';
import { setLocale } from './locale';

afterEach(() => {
  setLocale('ja');
  document.body.innerHTML = '';
});

it.each(['ja', 'en'] as const)('renders both army choices and preview controls in %s', (locale) => {
  setLocale(locale);
  document.body.innerHTML = renderMusicControls(defaultMusicSettings, 'title-music', true);
  expect(document.querySelectorAll('#title-music-track option')).toHaveLength(7);
  expect(document.querySelectorAll('#title-music-blue-track option')).toHaveLength(7);
  expect(document.querySelector('#title-music-preview-blue')).not.toBeNull();
  expect(document.body.textContent).toContain(locale === 'en' ? 'Blaze (Rock' : '烈火（ロック');
});

it('synchronizes both surfaces without replacing a focused control', () => {
  document.body.innerHTML = renderMusicControls() + renderMusicControls(undefined, 'title-music');
  const select = document.querySelector<HTMLSelectElement>('#title-music-track')!;
  select.focus();
  syncMusicControls(document, { ...defaultMusicSettings, fieldTrack: 'rock-red', blueFieldTrack: 'drive', muted: true, volume: 0.4, armyTracks: false });
  expect(document.activeElement).toBe(select);
  for (const prefix of ['music', 'title-music']) {
    expect(document.querySelector<HTMLSelectElement>(`#${prefix}-track`)!.value).toBe('rock-red');
    expect(document.querySelector<HTMLSelectElement>(`#${prefix}-blue-track`)!.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>(`#${prefix}-volume`)!.value).toBe('40');
    expect(document.querySelector<HTMLInputElement>(`#${prefix}-muted`)!.checked).toBe(false);
  }
  expect(() => syncMusicControls(document.createElement('div'), defaultMusicSettings)).not.toThrow();
});
