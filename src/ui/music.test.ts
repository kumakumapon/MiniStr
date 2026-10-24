import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { StorageLike } from '../game';
import {
  BackgroundMusicPlayer,
  defaultMusicSettings,
  FIELD_TRACKS,
  FIELD_TRACK_FILES,
  FIELD_TRACK_LABELS,
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
  src = '';
  loop = false;
  preload = '';
  volume = 1;
  muted = true;
  currentTime = 0;
  readyState = 1;
  ended = false;
  paused = true;
  readonly listeners = new Map<string, () => void>();
  readonly addEventListener = vi.fn((type: string, listener: () => void) => this.listeners.set(type, listener));
  readonly load = vi.fn(() => {
    this.currentTime = 0;
    this.paused = true;
  });
  readonly play = vi.fn(async () => {
    this.paused = false;
  });
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
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
  it('migrates the old chosen track and validates both army preferences', () => {
    expect(loadMusicSettings(storage({ [MUSIC_SETTINGS_KEY]: JSON.stringify({ muted: true, volume: 0.46, fieldTrack: 'mist' }) }))).toEqual({
      ...defaultMusicSettings,
      muted: true,
      volume: 0.46,
      fieldTrack: 'mist',
    });
    for (const patch of [{ armyTracks: 'true' }, { blueFieldTrack: 'jazz' }, { blueFieldTrack: null }]) {
      expect(loadMusicSettings(storage({ [MUSIC_SETTINGS_KEY]: JSON.stringify({ ...defaultMusicSettings, ...patch }) }))).toEqual(defaultMusicSettings);
      expect(saveMusicSettings(storage(), { ...defaultMusicSettings, ...patch } as never)).toBe(false);
    }
    const target = storage();
    const settings = { ...defaultMusicSettings, fieldTrack: 'rock-red' as const, blueFieldTrack: 'rock-blue' as const, armyTracks: false };
    expect(saveMusicSettings(target, settings)).toBe(true);
    expect(loadMusicSettings(target)).toEqual(settings);
  });
  it('reads settings saved before the track choice as the default march', () => {
    const old = storage({ [MUSIC_SETTINGS_KEY]: '{"muted":true,"volume":0.5}' });
    expect(loadMusicSettings(old)).toEqual({ ...defaultMusicSettings, muted: true, volume: 0.5, fieldTrack: 'march' });
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
      const bytes = readFileSync(`public/assets/${FIELD_TRACK_FILES[track]}.ogg`);
      expect(bytes.subarray(0, 4).toString()).toBe('OggS');
      expect(bytes.subarray(0, 128).toString()).toContain('vorbis');
      expect(FIELD_TRACK_LABELS[track]).not.toBe('');
    }
    expect(new Set(FIELD_TRACKS.map((track) => FIELD_TRACK_FILES[track])).size).toBe(FIELD_TRACKS.length);
  });
});

describe('BackgroundMusicPlayer', () => {
  it('resumes each army track independently and keeps a shared track continuous', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    await player.unlock();
    audio.currentTime = 12;
    player.setArmy('blue');
    expect(audio.src).toContain('rock-blue-theme.ogg');
    expect(audio.currentTime).toBe(0);
    audio.currentTime = 8;
    player.setArmy('red');
    expect(audio.src).toContain('frontier-theme.ogg');
    expect(audio.currentTime).toBe(12);
    player.setArmy('blue');
    expect(audio.currentTime).toBe(8);
    player.setSettings({ ...defaultMusicSettings, armyTracks: false });
    expect(audio.src).toContain('frontier-theme.ogg');
    const loads = audio.load.mock.calls.length;
    player.setArmy('red');
    player.setArmy('blue');
    expect(audio.load).toHaveBeenCalledTimes(loads);
    expect(audio.currentTime).toBe(12);
  });

  it('defers army and preference changes until the battle cue ends', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    await player.unlock();
    player.setBattle(true);
    player.setArmy('blue');
    player.setSettings({ ...defaultMusicSettings, blueFieldTrack: 'rock-red' });
    expect(audio.src).toContain('battle-theme.ogg');
    expect(audio.loop).toBe(false);
    player.setBattle(false);
    expect(audio.src).toContain('rock-red-theme.ogg');
    expect(audio.loop).toBe(true);
    player.setArmy('red');
    expect(audio.src).toContain('frontier-theme.ogg');
  });

  it('switches armies without bypassing mute or gesture activation', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer({ ...defaultMusicSettings, muted: true }, audio);
    player.setArmy('blue');
    expect(audio.play).not.toHaveBeenCalled();
    await player.unlock();
    expect(audio.play).not.toHaveBeenCalled();
    player.setSettings(defaultMusicSettings);
    expect(audio.src).toContain('rock-blue-theme.ogg');
    expect(audio.play).toHaveBeenCalledTimes(1);
    player.setSettings({ ...defaultMusicSettings, volume: 0 });
    player.setArmy('red');
    expect(audio.muted).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
  it('switches to battle music and restores the normal position while respecting mute and volume', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    await player.unlock();
    const fieldSource = audio.src;
    audio.currentTime = 12;
    // A media element can keep ended=true until the asynchronous seek finishes.
    audio.ended = true;
    const beforeStart = audio.play.mock.calls.length;
    player.setBattle(true);
    expect(audio.play).toHaveBeenCalledTimes(beforeStart + 1);
    expect(audio.src).toContain('battle-theme.ogg');
    expect(audio.loop).toBe(false);
    expect(audio.currentTime).toBe(0);
    expect(audio.volume).toBe(defaultMusicSettings.volume);
    expect(audio.muted).toBe(false);
    const plays = audio.play.mock.calls.length;
    player.setBattle(true);
    expect(audio.play).toHaveBeenCalledTimes(plays);
    await player.unlock();

    // Once this scene's cue has played, readiness and volume edits must not repeat it.
    player.setSettings({ ...defaultMusicSettings, volume: 0.4 });
    audio.listeners.get('canplay')?.();
    expect(audio.play).toHaveBeenCalledTimes(plays);
    player.setBattle(true, true);
    expect(audio.play).toHaveBeenCalledTimes(plays + 1);
    await player.unlock();
    audio.ended = false;
    const continuousPlays = audio.play.mock.calls.length;
    const continuousPauses = audio.pause.mock.calls.length;
    audio.currentTime = 1.875;
    await player.unlock();
    player.setSettings({ ...defaultMusicSettings, volume: 0.4 });
    expect(audio.play).toHaveBeenCalledTimes(continuousPlays);
    expect(audio.pause).toHaveBeenCalledTimes(continuousPauses);
    expect(audio.currentTime).toBe(1.875);

    player.setSettings({ ...defaultMusicSettings, muted: true, volume: 0.4 });
    expect(audio.muted).toBe(true);
    expect(audio.volume).toBe(0.4);
    player.setSettings({ ...defaultMusicSettings, muted: false, volume: 0.4 });
    expect(audio.play).toHaveBeenCalledTimes(plays + 2);
    player.setBattle(false);
    expect(audio.src).toBe(fieldSource);
    expect(audio.currentTime).toBe(12);
    expect(audio.loop).toBe(true);
    audio.ended = true;
    const beforeNextBattle = audio.play.mock.calls.length;
    player.setBattle(true);
    expect(audio.play).toHaveBeenCalledTimes(beforeNextBattle + 1);
    player.setSettings({ ...defaultMusicSettings, volume: 0 });
    expect(audio.volume).toBe(0);
    expect(audio.muted).toBe(true);
    const silentPlays = audio.play.mock.calls.length;
    player.setBattle(false);
    player.setBattle(true);
    expect(audio.play).toHaveBeenCalledTimes(silentPlays);
  });

  it('cannot restart skipped battle music when a pending play resolves late', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    await player.unlock();
    let finish: (() => void) | undefined;
    audio.play.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    player.setBattle(true);
    const pendingPlays = audio.play.mock.calls.length;
    // Multiple gestures/readiness events share the same pending request.
    const pendingUnlock = player.unlock();
    audio.listeners.get('canplay')?.();
    expect(audio.play).toHaveBeenCalledTimes(pendingPlays);
    player.setBattle(false);
    const pauses = audio.pause.mock.calls.length;
    finish?.();
    await pendingUnlock;
    expect(audio.pause).toHaveBeenCalledTimes(pauses);
    expect(audio.muted).toBe(false);
    expect(audio.src).toContain('frontier-theme.ogg');
    expect(audio.play).toHaveBeenCalledTimes(3);
  });

  it('starts only after unlock, loops, and responds to mute and volume settings', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    expect(audio.loop).toBe(true);
    expect(audio.preload).toBe('none');
    expect(audio.volume).toBe(defaultMusicSettings.volume);
    expect(audio.play).not.toHaveBeenCalled();
    audio.listeners.get('canplay')?.();
    expect(audio.play).not.toHaveBeenCalled();

    await player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(1);
    player.setSettings({ ...defaultMusicSettings, muted: true, volume: 0.6 });
    expect(audio.volume).toBe(0.6);
    expect(audio.muted).toBe(true);
    player.setSettings({ ...defaultMusicSettings, muted: false, volume: 0.4 });
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('keeps the app usable when playback is denied', async () => {
    const audio = new FakeAudio();
    audio.play.mockRejectedValueOnce(new Error('autoplay denied'));
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    // A concurrent gesture must also absorb the pending rejection.
    await expect(Promise.all([player.unlock(), player.unlock()])).resolves.toEqual([undefined, undefined]);
    expect(audio.play).toHaveBeenCalledTimes(1);
    await expect(player.unlock()).resolves.toBeUndefined();
    expect(audio.play).toHaveBeenCalledTimes(2);
    await player.unlock();
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('pauses when volume reaches zero', async () => {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(defaultMusicSettings, audio);
    await player.unlock();
    player.setSettings({ ...defaultMusicSettings, volume: 0 });
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.muted).toBe(true);
  });
});

describe('BackgroundMusicPlayer field track switching', () => {
  function setup(settings = defaultMusicSettings) {
    const audio = new FakeAudio();
    const player = new BackgroundMusicPlayer(settings, audio);
    return { audio, player };
  }

  it('stops the old track and plays the new one after unlock', async () => {
    const { audio, player } = setup();
    await player.unlock();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
    await player.unlock();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.src).toContain('dawn-theme.ogg');
    expect(audio.loop).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.volume).toBe(defaultMusicSettings.volume);
  });

  it('reuses an element when a track is picked again', async () => {
    const audio = new FakeAudio();
    const constructor = vi.spyOn(globalThis, 'Audio').mockImplementation(function () {
      return audio as unknown as HTMLAudioElement;
    });
    try {
      const player = new BackgroundMusicPlayer(defaultMusicSettings);
      await player.unlock();
      audio.currentTime = 9;
      player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
      await player.unlock();
      audio.currentTime = 4;
      // Metadata is not available yet when switching back on iOS.
      audio.readyState = 0;
      player.setSettings(defaultMusicSettings);
      expect(audio.currentTime).toBe(0);
      audio.readyState = 1;
      audio.listeners.get('loadedmetadata')?.();
      expect(audio.currentTime).toBe(9);
      // Pending saved seeks must survive rapid switches before metadata arrives.
      audio.readyState = 0;
      player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
      player.setSettings(defaultMusicSettings);
      player.setSettings({ ...defaultMusicSettings, fieldTrack: 'dawn' });
      audio.readyState = 1;
      audio.listeners.get('loadedmetadata')?.();
      expect(audio.currentTime).toBe(4);
      expect(audio.src).toContain('dawn-theme.ogg');
      expect(audio.load).toHaveBeenCalledTimes(5);
      expect(constructor).toHaveBeenCalledTimes(1);
    } finally {
      constructor.mockRestore();
    }
  });

  it('keeps the battle theme during a switch and plays the new track afterwards', async () => {
    const { audio, player } = setup();
    await player.unlock();
    player.setBattle(true);
    await player.unlock();
    const battlePauses = audio.pause.mock.calls.length;
    const battleLoads = audio.load.mock.calls.length;
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'drive' });
    expect(audio.src).toContain('battle-theme.ogg');
    expect(audio.pause).toHaveBeenCalledTimes(battlePauses);
    expect(audio.load).toHaveBeenCalledTimes(battleLoads);
    player.setBattle(false);
    await player.unlock();
    expect(audio.src).toContain('drive-theme.ogg');
    expect(audio.loop).toBe(true);
  });

  it('stays silent when muted and plays the chosen track once unmuted', async () => {
    const { audio, player } = setup();
    await player.unlock();
    const muted = { ...defaultMusicSettings, muted: true, fieldTrack: 'dawn' as const };
    player.setSettings(muted);
    expect(audio.src).toContain('dawn-theme.ogg');
    expect(audio.muted).toBe(true);
    expect(audio.paused).toBe(true);
    const playsWhileMuted = audio.play.mock.calls.length;
    player.setSettings({ ...muted, muted: false });
    expect(audio.play).toHaveBeenCalledTimes(playsWhileMuted + 1);
  });

  it('does not play a new track before the first gesture, then starts it on unlock', async () => {
    const { audio, player } = setup();
    player.setSettings({ ...defaultMusicSettings, fieldTrack: 'drive' });
    expect(audio.play).not.toHaveBeenCalled();
    await player.unlock();
    expect(audio.src).toContain('drive-theme.ogg');
    expect(audio.play).toHaveBeenCalledTimes(1);
    player.setBattle(false);
    expect(audio.src).toContain('drive-theme.ogg');
  });
});
