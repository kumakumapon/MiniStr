import { afterEach, describe, expect, it } from 'vitest';
import { researchReplayFixture } from '../game/research.fixture';
import { valueOf } from '../game/operations.fixture';
import { RESEARCH_AUTO_KEY, RESEARCH_MANUAL_KEY } from '../game/research';
import { setLocale } from './locale';
import { createReplayRuntime } from './replayRuntime';
import { renderResearchFork, renderResearchSaves, renderResearchStatus } from './research';

afterEach(() => setLocale('ja'));
describe('research controls', () => {
  it.each(['ja', 'en'])('shows branch eligibility, chosen policy and separate save controls in %s', (language) => {
    setLocale(language);
    const replay = createReplayRuntime(researchReplayFixture());
    document.body.innerHTML = renderResearchFork(replay, 'defensive');
    expect(document.querySelector<HTMLButtonElement>('#research-fork')?.disabled).toBe(false);
    expect(document.querySelector<HTMLSelectElement>('#research-policy')?.value).toBe('defensive');
    replay.index = 1;
    replay.state = valueOf(replay.timeline.seek(1));
    document.body.innerHTML = renderResearchFork(replay, 'balanced');
    expect(document.querySelector<HTMLButtonElement>('#research-fork')?.disabled).toBe(true);
    replay.index = 3;
    replay.state = valueOf(replay.timeline.seek(3));
    replay.playing = true;
    document.body.innerHTML = renderResearchFork(replay, 'balanced');
    expect(document.querySelector<HTMLButtonElement>('#research-fork')?.disabled).toBe(true);
    replay.playing = false;
    document.body.innerHTML = renderResearchFork(replay, 'balanced', true);
    expect(document.querySelector<HTMLButtonElement>('#research-fork')?.disabled).toBe(true);
    const storage = { getItem: (key: string) => (key === RESEARCH_AUTO_KEY ? 'raw' : null), setItem: () => {}, removeItem: () => {} };
    document.body.innerHTML = renderResearchSaves(storage);
    expect(document.querySelector<HTMLButtonElement>(`[data-research-resume="${RESEARCH_AUTO_KEY}"]`)?.disabled).toBe(false);
    expect(document.querySelector<HTMLButtonElement>(`[data-research-resume="${RESEARCH_MANUAL_KEY}"]`)?.disabled).toBe(true);
    expect(document.body.textContent).toContain(language === 'en' ? 'Research saves' : '研究用セーブ');
  });
  it('locks legacy policy, escapes origin text and distinguishes result/retry controls', () => {
    document.body.innerHTML = renderResearchFork(createReplayRuntime(researchReplayFixture(7)), 'balanced');
    expect(document.querySelector<HTMLSelectElement>('#research-policy')?.disabled).toBe(true);
    const origin = { replaySha256: '<img src=x onerror=alert(1)>', branchIndex: 3 };
    document.body.innerHTML = renderResearchStatus(origin, false, false);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('[data-research-retry]')?.disabled).toBe(true);
    document.body.innerHTML = renderResearchStatus(origin, true);
    expect(document.querySelector('[data-research-retry]')).toBeNull();
    expect(document.querySelector('[data-research-export]')).not.toBeNull();
    expect(document.body.textContent).toContain('分岐前の履歴');
    expect(renderResearchSaves({ getItem: () => null, setItem: () => {}, removeItem: () => {} })).toBe('');
    expect(
      renderResearchSaves({
        getItem: () => {
          throw Error();
        },
        setItem: () => {},
        removeItem: () => {},
      }),
    ).toBe('');
  });
});
