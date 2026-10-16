import { describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../game';
import {
  BackgroundMusicPlayer,
  defaultMusicSettings,
  FIELD_TRACKS,
  FIELD_TRACK_FILES,
  FIELD_TRACK_LABELS,
  type FieldTrack,
  loadMusicSettings,
  MUSIC_SETTINGS_KEY,
  saveMusicSettings,
} from './music';

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
  currentTime = 0;
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
    const settings = { ...defaultMusicSettings, muted: true, volume: 0.35 };
    expect(saveMusicSettings(target, settings)).toBe(true);
    expect(loadMusicSettings(target)).toEqual(settings);
    expect(saveMusicSettings(target, { ...defaultMusicSettings, muted: false, volume: -0.1 })).toBe(false);
  });
});

describe('field track setting', () => {
  it('reads settings saved before the track choice as the default march', () => {
    const old = storage({ [MUSIC_SETTINGS_KEY]: '{"muted":true,"volume":0.5}' });
    expect(loadMusicSettings(old)).toEqual({ muted: true, volume: 0.5, fieldTrack: 'march' });
  });

  it('keeps a valid chosen track and falls back for unknown ones', () => {
    const target = storage();
    expect(saveMusicSettings(target, { ...defaultMusicSettings, fieldTrack: 'drive' })).toBe(true);
    expect(loadMusicSettings(target).fieldTrack).toBe('drive');
    expect(loadMusicSettings(storage({ [MUSIC_SETTINGS_KEY]: '{"muted":false,"volume":0.3,"fieldTrack":"jazz"}' }))).toEqual(defaultMusicSettings);
    expect(loadMusicSettings(storage({ [MUSIC_SETTINGS_KEY]: '{"muted":false,"volume":0.3,"fieldTrack":7}' }))).toEqual(defaultMusicSettings);
    expect(saveMusicSettings(target, { ...defaultMusicSettings, fieldTrack: 'jazz' as never })).toBe(false);
  });

  it('ships an audio file for every selectable track', () => {
    for (const track of FIELD_TRACKS) {
      expect(FIELD_TRACK_FILES[track]).toMatch(/-theme$/);
      expect(FIELD_TRACK_LABELS[track]).not.toBe('');
    }
    expect(new Set(FIELD_TRACKS.map((track) => FIELD_TRACK_FILES[track])).size).toBe(FIELD_TRACKS.length);
  });
});

describe('BackgroundMusicPlayer', () => {
  it('switches to battle music and restores the normal position while respecting mute and volume', async () => {
    const normal = new FakeAudio();
    const battle = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, normal, battle);
    await player.unlock();
    normal.currentTime = 12;
    battle.currentTime = 4;
    player.setBattle(true);
    expect(normal.pause).toHaveBeenCalled();
    expect(battle.loop).toBe(false);
    expect(battle.currentTime).toBe(0);
    expect(battle.volume).toBe(defaultMusicSettings.volume);
    const plays = battle.play.mock.calls.length;
    player.setBattle(true);
    expect(battle.play).toHaveBeenCalledTimes(plays);

    player.setSettings({ ...defaultMusicSettings, muted: true, volume: 0.4 });
    expect(battle.pause).toHaveBeenCalled();
    expect(battle.volume).toBe(0.4);
    player.setSettings({ ...defaultMusicSettings, muted: false, volume: 0.4 });
    expect(battle.play).toHaveBeenCalledTimes(plays + 1);
    player.setBattle(false);
    expect(normal.currentTime).toBe(12);
    expect(normal.play).toHaveBeenCalledTimes(2);
    player.setBattle(true);
    player.setSettings({ ...defaultMusicSettings, muted: false, volume: 0 });
    expect(battle.volume).toBe(0);
    const silentPlays = battle.play.mock.calls.length;
    player.setBattle(false);
    player.setBattle(true);
    expect(battle.play).toHaveBeenCalledTimes(silentPlays);
  });

  it('cannot restart skipped battle music when a pending play resolves late', async () => {
    const normal = new FakeAudio();
    const battle = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, normal, battle);
    await player.unlock();
    let finish: (() => void) | undefined;
    battle.play.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    player.setBattle(true);
    player.setBattle(false);
    const pauses = battle.pause.mock.calls.length;
    finish?.();
    await Promise.resolve();
    expect(battle.pause).toHaveBeenCalledTimes(pauses + 1);
    expect(normal.play).toHaveBeenCalledTimes(2);
  });

  it('starts only after unlock, loops, and responds to mute and volume settings', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    expect(audio.loop).toBe(true);
    expect(audio.preload).toBe('none');
    expect(audio.volume).toBe(defaultMusicSettings.volume);
    expect(audio.play).not.toHaveBeenCalled();

    await player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);

    player.setSettings({ ...defaultMusicSettings, muted: true, volume: 0.6 });
    expect(audio.volume).toBe(0.6);
    expect(audio.pause).toHaveBeenCalledTimes(1);

    player.setSettings({ ...defaultMusicSettings, muted: false, volume: 0.4 });
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
    player.setSettings({ ...defaultMusicSettings, muted: false, volume: 0 });
    expect(audio.pause).toHaveBeenCalled();
  });
});

describe('BackgroundMusicPlayer field track switching', () => {
  function setup(settings = defaultMusicSettings) {
    const created: Record<string, FakeAudio> = {};
    const factory = vi.fn((track: FieldTrack) => (created[track] = new FakeAudio()));
    const battle = new FakeAudio();
    const march = new FakeAudio();
    created.march = march;
    const player = new BackgroundMusicPlayer(settings, march, battle, factory);
    return { created, factory, battle, march, player };
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('stops the old track and plays the new one after unlock', async () => {
    const { created, march, player } = setup();
    await player.unlock();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    await flush();
    expect(march.pause).toHaveBeenCalled();
    expect(created.dawn?.loop).toBe(true);
    expect(created.dawn?.play).toHaveBeenCalled();
    expect(created.dawn?.volume).toBe(defaultMusicSettings.volume);
  });

  it('reuses an element when a track is picked again', async () => {
    const { factory, player } = setup();
    await player.unlock();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'march' });
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('keeps the battle theme during a switch and plays the new track afterwards', async () => {
    const { created, battle, player } = setup();
    await player.unlock();
    player.setBattle(true);
    const battlePauses = battle.pause.mock.calls.length;
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'drive' });
    await flush();
    expect(battle.pause).toHaveBeenCalledTimes(battlePauses);
    expect(created.drive?.volume).toBe(defaultMusicSettings.volume);
    expect(created.drive?.pause).toHaveBeenCalled();
    player.setBattle(false);
    await flush();
    expect(battle.pause).toHaveBeenCalled();
    expect(created.drive?.play.mock.calls.length).toBeGreaterThan(1);
  });

  it('stays silent when muted and plays the chosen track once unmuted', async () => {
    const { created, player } = setup();
    await player.unlock();
    const muted = { ...defaultMusicSettings, muted: true, fieldTrack: 'dawn' as const };
    player.setSettings(muted);
    await flush();
    expect(created.dawn?.pause).toHaveBeenCalled();
    const playsWhileMuted = created.dawn?.play.mock.calls.length ?? 0;
    player.setSettings({ ...muted, muted: false });
    await flush();
    expect(created.dawn?.play.mock.calls.length).toBeGreaterThan(playsWhileMuted);
  });

  it('does not play a new track before the first gesture, then starts it on unlock', async () => {
    const { created, player } = setup();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'drive' });
    await flush();
    expect(created.drive?.play).not.toHaveBeenCalled();
    await player.unlock();
    expect(created.drive?.play).toHaveBeenCalled();
  });
});
