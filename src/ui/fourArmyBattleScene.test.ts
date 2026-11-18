import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FourArmyBattleScene } from './fourArmyBattleScene';
import { BATTLE_SCENE_DURATION_MS, type BattleScene } from './battleScene';
import { setLocale } from './locale';
const scene: BattleScene = {
  attacker: { owner: 'army3', kind: 'tank', position: { x: 1, y: 1 }, hpBefore: 100, hpAfter: 75 },
  defender: { owner: 'army4', kind: 'tank', position: { x: 2, y: 1 }, hpBefore: 100, hpAfter: 45 },
  terrain: 'plain',
};
describe('four-army battle modal lifecycle', () => {
  let root: HTMLDivElement, player: FourArmyBattleScene;
  const stop = vi.fn(),
    pause = vi.fn(),
    menu = vi.fn(),
    disable = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    setLocale('en');
    root = document.createElement('div');
    root.innerHTML = '<button id="four-menu">Setup</button>';
    document.body.append(root);
    root.querySelector<HTMLButtonElement>('button')!.focus();
    player = new FourArmyBattleScene(root, {
      sound: () => stop,
      pause: () => {
        pause();
        player.dismiss();
      },
      menu: () => {
        menu();
        player.dismiss(false);
      },
      disable: () => {
        disable();
        player.dismiss();
      },
    });
  });
  afterEach(() => {
    player.dismiss(false);
    root.remove();
    vi.clearAllMocks();
    vi.useRealTimers();
  });
  it('holds progress until the timer expires, keeps redraws below an inert backdrop and restores focus', async () => {
    player.show(scene, false);
    let resumed = false;
    const wait = player.finished().then(() => {
      resumed = true;
    });
    expect(root.inert).toBe(true);
    expect(document.activeElement?.id).toBe('battle-scene-skip');
    root.insertAdjacentHTML('beforeend', '<p>Updated board</p>');
    await vi.advanceTimersByTimeAsync(BATTLE_SCENE_DURATION_MS - 1);
    expect(resumed).toBe(false);
    expect(player.active).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(resumed).toBe(true);
    expect(root.inert).toBe(false);
    expect(document.activeElement?.id).toBe('four-menu');
    expect(stop).toHaveBeenCalledOnce();
  });
  it.each(['battle-scene-skip', 'spectate-scene-pause', 'spectate-scene-menu', 'battle-scenes-multiArmy-overlay'])('settles once and cancels audio when using %s', async (id) => {
    player.show(scene, true);
    const settled = vi.fn();
    const wait = player.finished().then(settled);
    const button = document.getElementById(id)!;
    if (button instanceof HTMLInputElement) {
      button.checked = false;
      button.dispatchEvent(new Event('change'));
    } else button.click();
    await wait;
    player.dismiss();
    await vi.advanceTimersByTimeAsync(BATTLE_SCENE_DURATION_MS * 2);
    expect(settled).toHaveBeenCalledOnce();
    expect(player.active).toBe(false);
    expect(root.inert).toBe(false);
    expect(stop).toHaveBeenCalledOnce();
    if (id.includes('pause')) expect(pause).toHaveBeenCalledOnce();
    if (id.includes('menu')) expect(menu).toHaveBeenCalledOnce();
    if (id.includes('overlay')) expect(disable).toHaveBeenCalledOnce();
  });
  it('cancels without a stale focus restore when the screen is hidden or the viewer changes', async () => {
    player.show(scene, true);
    const wait = player.finished();
    root.hidden = true;
    player.dismiss(false);
    await wait;
    await vi.advanceTimersByTimeAsync(BATTLE_SCENE_DURATION_MS);
    expect(document.querySelector('.four-battle-scene')).toBeNull();
    expect(root.inert).toBe(false);
    expect(stop).toHaveBeenCalledOnce();
  });
  it('allows Escape to skip without leaking a board command', async () => {
    const key = vi.fn();
    root.addEventListener('keydown', key);
    player.show(scene, false);
    const wait = player.finished();
    document.getElementById('battle-scene-skip')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait;
    expect(key).not.toHaveBeenCalled();
    expect(player.active).toBe(false);
  });
});
