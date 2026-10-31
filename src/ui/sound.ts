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

/** Never replay an effect from a background backlog. */
export const SOUND_RECOVERY_WINDOW_MS = 250;

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
    { wave: 'sine', from: 118, to: 74, duration: 0.14, level: 0.2, attack: 0.01 },
  ],
  attack: [
    { wave: 'sawtooth', from: 220, to: 52, duration: 0.2, attack: 0.007 },
    { wave: 'sine', from: 130, to: 42, duration: 0.26, level: 0.3, attack: 0.01 },
    { wave: 'triangle', from: 90, to: 45, duration: 0.18, delay: 0.01, level: 0.18, attack: 0.012 },
  ],
  hit: [
    { wave: 'triangle', from: 190, to: 120, duration: 0.08 },
    { wave: 'sawtooth', from: 530, to: 95, duration: 0.055, level: 0.1, attack: 0.003 },
    { wave: 'sine', from: 76, to: 42, duration: 0.14, delay: 0.006, level: 0.17, attack: 0.018 },
    { wave: 'sine', from: 58, to: 34, duration: 0.24, delay: 0.004, level: 0.3, attack: 0.012 },
  ],
  destroy: [
    { wave: 'sawtooth', from: 150, to: 45, duration: 0.16 },
    { wave: 'triangle', from: 74, to: 28, duration: 0.34, delay: 0.008, level: 0.18, attack: 0.035 },
    { wave: 'sawtooth', from: 560, to: 72, duration: 0.22, delay: 0.012, level: 0.08, attack: 0.006 },
    { wave: 'sine', from: 62, to: 28, duration: 0.62, delay: 0.01, level: 0.34, attack: 0.03 },
    { wave: 'sawtooth', from: 90, to: 30, duration: 0.45, delay: 0.02, level: 0.1, attack: 0.02 },
  ],
  capture: [
    { wave: 'sine', from: 340, to: 700, duration: 0.14 },
    { wave: 'triangle', from: 510, to: 1020, duration: 0.19, delay: 0.025, level: 0.15, attack: 0.035 },
    { wave: 'sine', from: 680, to: 1360, duration: 0.22, delay: 0.05, level: 0.11, attack: 0.04 },
    { wave: 'triangle', from: 170, to: 350, duration: 0.3, level: 0.18, attack: 0.03 },
  ],
  produce: [
    { wave: 'triangle', from: 300, to: 500, duration: 0.12 },
    { wave: 'sine', from: 450, to: 750, duration: 0.16, delay: 0.02, level: 0.13, attack: 0.025 },
    { wave: 'triangle', from: 600, to: 1000, duration: 0.19, delay: 0.045, level: 0.1, attack: 0.035 },
    { wave: 'triangle', from: 150, to: 250, duration: 0.26, level: 0.18, attack: 0.03 },
  ],
  turn: [
    { wave: 'sine', from: 250, to: 420, duration: 0.13 },
    { wave: 'triangle', from: 375, to: 630, duration: 0.18, delay: 0.025, level: 0.14, attack: 0.035 },
    { wave: 'sine', from: 500, to: 840, duration: 0.21, delay: 0.05, level: 0.1, attack: 0.04 },
    { wave: 'triangle', from: 125, to: 210, duration: 0.3, level: 0.2, attack: 0.04 },
  ],
};

/** Web Audio sound bank with layered, shaped cues and no external samples. */
export class ProceduralSoundPlayer {
  private context: AudioContext | undefined;
  private constructorRef: AudioContextConstructor | undefined;
  private readonly battleSounds = new Map<GainNode, () => void>();
  private noise: AudioBuffer | undefined;
  private pendingEffect: { event: SoundEvent; requestedAt: number } | undefined;
  private effectResume: Promise<void> | undefined;

  constructor(
    private settings: SoundSettings,
    constructorRef?: AudioContextConstructor,
  ) {
    const scope = window as Window & { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
    this.constructorRef = constructorRef ?? scope.AudioContext ?? scope.webkitAudioContext;
  }

  setSettings(settings: SoundSettings): void {
    this.settings = settings;
    if (settings.muted || settings.volume === 0) this.pendingEffect = undefined;
    for (const [gain, stop] of this.battleSounds) {
      if (settings.muted || settings.volume === 0) stop();
      else gain.gain.setValueAtTime(settings.volume, this.context!.currentTime);
    }
  }

  async unlock(): Promise<void> {
    if (!this.constructorRef) return;
    if (!this.context) {
      this.context = new this.constructorRef();
      this.context.addEventListener?.('statechange', () => {
        if (!document.hidden && this.context?.state !== 'running' && this.context?.state !== 'closed') void this.recover();
      });
    }
    await this.recover();
  }

  /** Resume an existing context without playing missed cues or allocating a new one. */
  async recover(): Promise<void> {
    if (!this.context) return;
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
    if (!context || context.state === 'closed' || this.settings.muted || this.settings.volume === 0) return;
    if (context.state !== 'running') {
      if (document.hidden) return;
      // UI handlers can run before the gesture's async resume has settled.
      // Retain only the latest fresh cue and one pending resume, never a queue.
      this.pendingEffect = { event, requestedAt: Date.now() };
      if (!this.effectResume) {
        const resumed = this.recover().then(() => {
          const cue = this.pendingEffect;
          this.pendingEffect = undefined;
          if (cue && Date.now() - cue.requestedAt <= SOUND_RECOVERY_WINDOW_MS && context.state === 'running') this.play(cue.event);
        }).finally(() => { this.effectResume = undefined; });
        this.effectResume = resumed;
      }
      return;
    }
    this.pendingEffect = undefined;
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
    const burst = (delay: number, duration: number, level: number, cutoff: number, pitch: number, weight = 0.95) => {
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
      bodyGain.gain.value = weight;
      body.connect(bodyGain).connect(envelope);
      sources.push(noise, body);
      nodes.push(noise, body, bodyGain, filter, envelope);
      noise.start(start); noise.stop(start + duration);
      body.start(start); body.stop(start + duration);
      return body;
    };
    let last: AudioScheduledSourceNode;
    if (cue === 'destroy') {
      last = burst(0, 0.65, 0.44, 2000, 72, 1.0);
    } else if (cue === 'impact') {
      last = burst(0, 0.24, 0.36, 2600, 115, 1.05);
    } else if (kind === 'infantry' || kind === 'mech' || kind === 'recon' || kind === 'antiAir' || kind === 'helicopter' || kind === 'fighter') {
      burst(0, 0.07, 0.30, 5200, 160, 0.8);
      burst(0.07, 0.07, 0.26, 5200, 150, 0.8);
      last = burst(0.14, 0.08, 0.28, 5200, 140, 0.8);
    } else if (kind === 'rocket' || kind === 'bomber') {
      last = burst(0, 0.25, 0.32, 1500, 92, 1.1);
    } else {
      last = burst(0, 0.20, 0.40, 3000, 100, 1.1);
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
