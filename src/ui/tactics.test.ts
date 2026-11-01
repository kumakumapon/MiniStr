import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from './locale';
import { renderTacticalControls, renderTacticalPreset } from './tactics';
import { renderUnitBrief } from './unitBrief';
import { inspectTile } from './tileInspector';
import { decodeCpuResponse } from './cpuResponse';
import { battleSceneForCommand, renderBattleScene } from './battleScene';
import { playBattleSceneAudio } from './battleAudio';
import { renderGameOverOverlay } from './overlays';
import { tacticalUnit as unit, tacticalState as state, tacticalOk as ok } from '../game/tactics.fixture';
import { createBoard } from '../game/state';
import { attackUnit, moveUnit } from '../game/commands';
import { prepareAmbush } from '../game/tacticalActions';
import { visiblePositions, observedCommand } from '../game/fog';

afterEach(() => {
  setLocale('ja');
  vi.useRealTimers();
});
describe('tactical controls and contact privacy', () => {
  it('renders the opt-in title control and localized rule explanations', () => {
    expect(renderTacticalPreset(false)).not.toContain('checked');
    expect(renderTacticalPreset(true)).toContain('checked');
    setLocale('en');
    expect(renderTacticalPreset(true)).toContain('Combined tactics');
    const s = state([unit('infantry', 'red', 1, 2)]);
    const html = renderTacticalControls(s, 'red', 'r1', true);
    expect(html).toContain('Prepare ambush');
    expect(html).toContain('Next round');
    expect(html).not.toMatch(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
    expect(renderTacticalControls({ ...s, tactics: undefined }, 'red', undefined, false)).toBe('');
  });
  it('shows dive readiness, reservation expiry and terminal draws', () => {
    const s = state([unit('submarine', 'red', 1, 2)]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    expect(renderTacticalControls(s, 'red', 'r1', true)).toContain('潜航');
    s.units[0]!.submerged = true;
    expect(renderTacticalControls(s, 'red', 'r1', false)).toContain('浮上');
    s.units = [{ ...unit('infantry', 'red', 1, 2), ambush: 0, hasMoved: true, hasActed: true }];
    expect(renderTacticalControls(s, 'red', 'r1', true)).toContain('準備中');
    s.draw = true;
    expect(renderTacticalControls(s, 'red', undefined, false)).toContain('引き分け');
  });
  it('does not show a submerged contact through tile details, unit brief or event presentation', () => {
    const s = state([unit('fighter', 'red', 1, 2), { ...unit('submarine', 'blue', 3, 2), submerged: true }]);
    s.board = createBoard(9, 6, { kind: 'sea' });
    const visible = new Set(visiblePositions(s, 'red').map((p) => `${p.x},${p.y}`));
    expect(inspectTile(s, { x: 3, y: 2 }, 'red', visible)?.unit).toBeUndefined();
    expect(renderUnitBrief(s, 'red', visible, 'b1', { x: 3, y: 2 })).not.toContain('潜水艦');
    expect(observedCommand({ ...s, activePlayer: 'blue' }, s, { type: 'move', unitId: 'b1', destination: { x: 4, y: 2 } }, 'red')).toBe(false);
  });
  it('preserves new worker commands and their selected weapon', () => {
    const s = state([unit('infantry', 'red', 1, 2)]);
    expect(decodeCpuResponse({ type: 'ambush', unitId: 'r1', weaponSlot: 1 }, s)).toEqual({ type: 'ambush', unitId: 'r1', weaponSlot: 1 });
    expect(decodeCpuResponse({ type: 'ambush', unitId: 'r1' }, s)).toEqual({ type: 'ambush', unitId: 'r1' });
    expect(decodeCpuResponse({ type: 'dive', unitId: 'r1' }, s)).toEqual({ type: 'dive', unitId: 'r1' });
  });
  it('shows lethal return fire and synchronizes simultaneous visual and audio cues', () => {
    vi.useFakeTimers();
    const s = state([
      { ...unit('infantry', 'red', 1, 2), hp: 1 },
      { ...unit('infantry', 'blue', 2, 2), hp: 1 },
    ]);
    const after = ok(attackUnit(s, 'r1', 'b1'));
    const scene = battleSceneForCommand(s, { type: 'attack', unitId: 'r1', targetId: 'b1' }, after)!;
    expect(scene.simultaneous).toBe(true);
    expect(scene.defender.weapon).toBe('rifle');
    expect(renderBattleScene(scene)).toContain('同時射撃');
    expect(renderBattleScene(scene)).toContain('両部隊が相討ち');
    expect(renderBattleScene(scene)).not.toContain('class="battle-phase-counter"');
    const play = vi.fn();
    const stop = playBattleSceneAudio(scene, play);
    vi.advanceTimersByTime(750);
    expect(play).toHaveBeenCalledTimes(2);
    stop();
  });
  it('builds the ambush scene at the actual stop tile with no return fire', () => {
    let s = state([unit('tank', 'red', 0, 2), unit('infantry', 'blue', 5, 2)]);
    s = { ...ok(prepareAmbush({ ...s, activePlayer: 'blue' }, 'b1')), activePlayer: 'red' };
    const command = { type: 'move' as const, unitId: 'r1', destination: { x: 5, y: 2 } },
      after = ok(moveUnit(s, 'r1', command.destination));
    const scene = battleSceneForCommand(s, command, after)!;
    expect(scene.ambush).toBe(true);
    expect(scene.defender.position).toEqual({ x: 4, y: 2 });
    expect(scene.defender.weapon).toBeUndefined();
    expect(renderBattleScene(scene)).toContain('待伏せ射撃');
  });
  it('renders a real draw result in both languages', () => {
    for (const locale of ['ja', 'en']) {
      setLocale(locale);
      const html = renderGameOverOverlay({
        visible: true,
        winner: 'draw',
        summary: { winner: 'draw', turns: 4, kills: { red: 1, blue: 1 }, captures: { red: 0, blue: 0 } },
        mapName: 'Map',
        difficultyName: 'Normal',
        campaignResult: '',
        campaignActions: '',
      });
      expect(html).toContain(locale === 'ja' ? '引き分け' : 'Draw');
      expect(html).toContain('export-replay');
    }
  });
});
