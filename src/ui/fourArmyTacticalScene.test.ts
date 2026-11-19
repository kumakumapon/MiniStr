import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FourArmyTacticalScene } from './fourArmyTacticalScene';
import { ACTION_SCENE_DURATION_MS, type ActionScene } from './actionScene';
import { setLocale } from './locale';
const scene: ActionScene = {
  kind: 'logistics',
  owner: 'army4',
  changes: [
    {
      unitId: 'u4',
      kind: 'tank',
      owner: 'army4',
      position: { x: 1, y: 1 },
      source: { type: 'facility', terrain: 'capital' },
      resources: [
        { resource: 'hp', before: 60, after: 80 },
        { resource: 'fuel', before: 5, after: 70 },
      ],
    },
  ],
};
describe('four-army action modal lifetime', () => {
  let root: HTMLDivElement, player: FourArmyTacticalScene;
  const sound = vi.fn(),
    disable = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    setLocale('en');
    root = document.createElement('div');
    root.innerHTML = '<button id="four-menu">Setup</button>';
    document.body.append(root);
    root.querySelector('button')!.focus();
    player = new FourArmyTacticalScene(root, {
      sound,
      disable: (kind) => {
        disable(kind);
        player.dismiss();
      },
      pause: () => player.dismiss(false),
      menu: () => player.dismiss(false),
    });
  });
  afterEach(() => {
    player.dismiss(false);
    root.remove();
    vi.clearAllMocks();
    vi.useRealTimers();
    setLocale('ja');
  });
  it('holds progress for the same action duration as two-army play and keeps battle audio separate', async () => {
    player.show(scene, false);
    const done = vi.fn();
    const wait = player.finished().then(done);
    expect(root.inert).toBe(true);
    expect(player.kind).toBe('action');
    expect(document.body.textContent).toContain('Army 4');
    expect(document.body.textContent).toContain('60 → 80');
    await vi.advanceTimersByTimeAsync(ACTION_SCENE_DURATION_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(done).toHaveBeenCalledOnce();
    expect(root.inert).toBe(false);
    expect(player.kind).toBeUndefined();
    expect(document.activeElement?.id).toBe('four-menu');
    expect(sound).not.toHaveBeenCalled();
  });
  it.each(['tactical-scene-skip', 'action-scenes-multiArmy-overlay', 'spectate-scene-pause', 'spectate-scene-menu', 'Escape'])(
    'settles once on %s without a stale timer',
    async (id) => {
      player.show(scene, true);
      const done = vi.fn();
      const wait = player.finished().then(done);
      const target = document.getElementById(id === 'Escape' ? 'tactical-scene-skip' : id)!;
      if (id === 'Escape') target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      else if (target instanceof HTMLInputElement) {
        target.checked = false;
        target.dispatchEvent(new Event('change'));
      } else target.click();
      await wait;
      player.dismiss();
      await vi.advanceTimersByTimeAsync(ACTION_SCENE_DURATION_MS * 2);
      expect(done).toHaveBeenCalledOnce();
      expect(player.active).toBe(false);
      expect(root.inert).toBe(false);
      if (id.includes('action-scenes')) expect(disable).toHaveBeenCalledWith('action');
      expect(document.querySelector('.four-action-scene')).toBeNull();
    },
  );
});
