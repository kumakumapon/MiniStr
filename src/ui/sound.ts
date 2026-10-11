import type { StorageLike, UnitKind } from '../game';
import type { BattleSound } from './battleAudio';
import type { SoundEvent } from './presentationEffects';

export interface SoundSettings {
  muted: boolean;
  volume: number;
}
export const SOUND_SETTINGS_KEY = 'ministr.sound.settings';
export const defaultSoundSettings: SoundSettings = { muted: false, volume: 0.45 };

function isSoundSettings(value: unknown): value is SoundSettings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { muted?: unknown; volume?: unknown };
  return typeof candidate.muted === 'boolean' && typeof candidate.volume === 'number' && Number.isFinite(candidate.volume) && candidate.volume >= 0 && candidate.volume <= 1;
}

export function loadSoundSettings(storage: StorageLike): SoundSettings {
  try {
    const raw = storage.getItem(SOUND_SETTINGS_KEY);
    if (!raw) return { ...defaultSoundSettings };
    const parsed: unknown = JSON.parse(raw);
    return isSoundSettings(parsed) ? parsed : { ...defaultSoundSettings };
  } catch {
    return { ...defaultSoundSettings };
  }
}

export function saveSoundSettings(storage: StorageLike, settings: SoundSettings): boolean {
  if (!isSoundSettings(settings)) return false;
  try {
    storage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

type AudioContextConstructor = new () => AudioContext;

interface SoundVoice {
  wave: OscillatorType;
  from: number;
  to: number;
  duration: number;
  level?: number;
  delay?: number;
  attack?: number;
}

/** Each cue layers a restrained fundamental with harmonics and a short transient. */
const soundVoices: Record<SoundEvent, readonly SoundVoice[]> = {
  move: [
    { wave: 'sine', from: 430, to: 610, duration: 0.07 },
    { wave: 'triangle', from: 215, to: 180, duration: 0.12, level: 0.14, attack: 0.012 },
    { wave: 'sine', from: 860, to: 610, duration: 0.08, delay: 0.018, level: 0.09, attack: 0.008 },
  ],
  attack: [{ wave: 'sawtooth', from: 260, to: 68, duration: 0.17, attack: 0.007 }],
  hit: [
    { wave: 'triangle', from: 190, to: 120, duration: 0.08 },
    { wave: 'sawtooth', from: 530, to: 95, duration: 0.055, level: 0.1, attack: 0.003 },
    { wave: 'sine', from: 76, to: 42, duration: 0.14, delay: 0.006, level: 0.17, attack: 0.018 },
  ],
  destroy: [
    { wave: 'sawtooth', from: 150, to: 45, duration: 0.16 },
    { wave: 'triangle', from: 74, to: 28, duration: 0.34, delay: 0.008, level: 0.18, attack: 0.035 },
    { wave: 'sawtooth', from: 560, to: 72, duration: 0.22, delay: 0.012, level: 0.08, attack: 0.006 },
  ],
  capture: [
    { wave: 'sine', from: 340, to: 700, duration: 0.14 },
    { wave: 'triangle', from: 510, to: 1020, duration: 0.19, delay: 0.025, level: 0.15, attack: 0.035 },
    { wave: 'sine', from: 680, to: 1360, duration: 0.22, delay: 0.05, level: 0.11, attack: 0.04 },
  ],
  produce: [
    { wave: 'triangle', from: 300, to: 500, duration: 0.12 },
    { wave: 'sine', from: 450, to: 750, duration: 0.16, delay: 0.02, level: 0.13, attack: 0.025 },
    { wave: 'triangle', from: 600, to: 1000, duration: 0.19, delay: 0.045, level: 0.1, attack: 0.035 },
  ],
  turn: [
    { wave: 'sine', from: 250, to: 420, duration: 0.13 },
    { wave: 'triangle', from: 375, to: 630, duration: 0.18, delay: 0.025, level: 0.14, attack: 0.035 },
    { wave: 'sine', from: 500, to: 840, duration: 0.21, delay: 0.05, level: 0.1, attack: 0.04 },
  ],
};

/** Web Audio sound bank with layered, shaped cues and no external samples. */
export class ProceduralSoundPlayer {
  private context: AudioContext | undefined;
  private constructorRef: AudioContextConstructor | undefined;
  private readonly battleSounds = new Map<GainNode, () => void>();
  private noise: AudioBuffer | undefined;

  constructor(
    private settings: SoundSettings,
    constructorRef?: AudioContextConstructor,
  ) {
    this.constructorRef = constructorRef ?? window.AudioContext;
  }

  setSettings(settings: SoundSettings): void {
    this.settings = settings;
    for (const [gain, stop] of this.battleSounds) {
      if (settings.muted || settings.volume === 0) stop();
      else gain.gain.setValueAtTime(settings.volume, this.context!.currentTime);
    }
  }

  async unlock(): Promise<void> {
    if (!this.constructorRef) return;
    this.context ??= new this.constructorRef();
    if (this.context.state !== 'running') {
      try {
        await this.context.resume();
      } catch {
        // Autoplay policy: remain silent.
      }
    }
  }

  play(event: SoundEvent): void {
    const context = this.context;
    if (!context || context.state !== 'running' || this.settings.muted || this.settings.volume === 0) return;
    const now = context.currentTime;
    soundVoices[event].forEach((voice, index) => this.playVoice(context, voice, now, index));
  }

  /** Noise transients and low bodies distinguish gunfire, shells and explosions. */
  playBattle(cue: BattleSound, kind: UnitKind): (() => void) | undefined {
    const context = this.context;
    if (!context || context.state !== 'running' || this.settings.muted || this.settings.volume === 0) return;
    if (!this.noise) {
      this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const master = context.createGain();
    master.gain.setValueAtTime(this.settings.volume, context.currentTime);
    master.connect(context.destination);
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [master];
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      for (const source of sources) {
        try { source.stop(); } catch { /* Already finished. */ }
      }
      nodes.forEach(node => node.disconnect());
      this.battleSounds.delete(master);
    };
    this.battleSounds.set(master, stop);
    const burst = (delay: number, duration: number, level: number, cutoff: number, pitch: number) => {
      const start = context.currentTime + delay;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.001, start);
      envelope.gain.exponentialRampToValueAtTime(level, start + 0.004);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
      envelope.connect(master);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.18), start + duration);
      const noise = context.createBufferSource();
      noise.buffer = this.noise!;
      noise.connect(filter).connect(envelope);
      const body = context.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(pitch, start);
      body.frequency.exponentialRampToValueAtTime(28, start + duration);
      const bodyGain = context.createGain();
      bodyGain.gain.value = 0.65;
      body.connect(bodyGain).connect(envelope);
      sources.push(noise, body);
      nodes.push(noise, body, bodyGain, filter, envelope);
      noise.start(start); noise.stop(start + duration);
      body.start(start); body.stop(start + duration);
      return body;
    };
    let last: AudioScheduledSourceNode;
    if (cue === 'destroy') {
      last = burst(0, 0.65, 0.42, 2600, 110);
    } else if (cue === 'impact') {
      last = burst(0, 0.24, 0.34, 3400, 180);
    } else if (kind === 'infantry' || kind === 'mech' || kind === 'recon' || kind === 'antiAir' || kind === 'helicopter' || kind === 'fighter') {
      burst(0, 0.07, 0.30, 6500, 220);
      burst(0.07, 0.07, 0.26, 6500, 210);
      last = burst(0.14, 0.08, 0.28, 6500, 200);
    } else if (kind === 'rocket' || kind === 'bomber') {
      last = burst(0, 0.25, 0.30, 1900, 135);
    } else {
      last = burst(0, 0.20, 0.38, 4200, 155);
    }
    last.addEventListener('ended', stop, { once: true });
    return stop;
  }

  private playVoice(context: AudioContext, voice: SoundVoice, now: number, index: number): void {
    const start = now + (voice.delay ?? 0);
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const peak = Math.min(0.18, this.settings.volume * (index === 0 ? 0.32 : (voice.level ?? 0.12)));
    oscillator.type = voice.wave;
    oscillator.frequency.setValueAtTime(voice.from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, voice.to), start + voice.duration);
    if (index === 0 && voice.attack === undefined) {
      gain.gain.setValueAtTime(peak, start);
    } else {
      const attack = Math.min(voice.attack ?? 0.01, voice.duration * 0.5);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), start + attack);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, start + voice.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + voice.duration);
    oscillator.addEventListener(
      'ended',
      () => {
        oscillator.disconnect();
        gain.disconnect();
      },
      { once: true },
    );
  }
}
