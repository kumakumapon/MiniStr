import { describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../game';
import { BackgroundMusicPlayer, defaultMusicSettings, loadMusicSettings, MUSIC_SETTINGS_KEY, saveMusicSettings } from './music';

function storage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

class FakeAudio {
  loop = false;
  preload = '';
  volume = 1;
  readonly play = vi.fn(async () => {});
  readonly pause = vi.fn();
}

describe('music settings', () => {
  it('uses safe defaults for missing or malformed values', () => {
    expect(loadMusicSettings(storage())).toEqual(defaultMusicSettings);
    expect(loadMusicSettings(storage({ [MUSIC_SETTINGS_KEY]: '{broken' }))).toEqual(defaultMusicSettings);
    expect(loadMusicSettings(storage({ [MUSIC_SETTINGS_KEY]: '{"muted":false,"volume":2}' }))).toEqual(defaultMusicSettings);
  });

  it('persists valid settings and rejects invalid values', () => {
    const target = storage();
    const settings = { muted: true, volume: 0.35 };
    expect(saveMusicSettings(target, settings)).toBe(true);
    expect(loadMusicSettings(target)).toEqual(settings);
    expect(saveMusicSettings(target, { muted: false, volume: -0.1 })).toBe(false);
  });
});

describe('BackgroundMusicPlayer', () => {
  it('starts only after unlock, loops, and responds to mute and volume settings', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    expect(audio.loop).toBe(true);
    expect(audio.preload).toBe('none');
    expect(audio.volume).toBe(defaultMusicSettings.volume);
    expect(audio.play).not.toHaveBeenCalled();

    await player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);

    player.setSettings({ muted: true, volume: 0.6 });
    expect(audio.volume).toBe(0.6);
    expect(audio.pause).toHaveBeenCalledTimes(1);

    player.setSettings({ muted: false, volume: 0.4 });
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('keeps the app usable when playback is denied', async () => {
    const audio = new FakeAudio();
    audio.play.mockRejectedValueOnce(new Error('autoplay denied'));
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    await expect(player.unlock()).resolves.toBeUndefined();
  });

  it('pauses when volume reaches zero', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    await player.unlock();
    player.setSettings({ muted: false, volume: 0 });
    expect(audio.pause).toHaveBeenCalled();
  });
});
