import {
  FUR_ELISE,
  FUR_ELISE_LENGTH,
  FUR_ELISE_SIXTEENTH_SECONDS,
  type MusicEvent,
} from "@/lib/fur-elise";

/** localStorage key for the visitor's music choice ("on" | "off"). */
export const LOGIN_MUSIC_STORAGE_KEY = "ks-login-music";
/**
 * Music is wanted by default (Andrew, 10 Nov 2026). Browsers still block sound until the
 * visitor's first click, tap or key press, so it starts then. Flip to false to make it opt-in.
 */
export const LOGIN_MUSIC_DEFAULT_ON = true;

const MASTER_VOLUME = 0.16;
const LOOKAHEAD_SECONDS = 0.25;
const TICK_MS = 60;

export function readMusicPreference(): boolean {
  try {
    const stored = localStorage.getItem(LOGIN_MUSIC_STORAGE_KEY);
    if (stored === "on") return true;
    if (stored === "off") return false;
  } catch {
    // storage unavailable: fall back to the default
  }
  return LOGIN_MUSIC_DEFAULT_ON;
}

export function writeMusicPreference(on: boolean): void {
  try {
    localStorage.setItem(LOGIN_MUSIC_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // ignore quota / private mode
  }
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * A small piano-like Web Audio synth that loops Für Elise. No audio files, no network.
 * Notes are scheduled a quarter of a second ahead so timing stays steady.
 */
export class LoginMusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private loopStart = 0;
  private index = 0;

  static isSupported(): boolean {
    return audioContextCtor() !== null;
  }

  /** True once the browser is actually producing sound. */
  get audible(): boolean {
    return this.ctx?.state === "running" && this.timer !== null;
  }

  /**
   * Start (or resume) playback. Call from a click/tap/key handler when possible: outside a
   * user gesture the browser may keep the context suspended until `resume()` is called again.
   */
  async start(): Promise<boolean> {
    const Ctor = audioContextCtor();
    if (!Ctor) return false;
    if (!this.ctx) {
      this.ctx = new Ctor();
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2600;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(filter).connect(this.ctx.destination);
    }
    try {
      await this.ctx.resume();
    } catch {
      return false;
    }
    if (this.ctx.state !== "running") return false;
    if (!this.timer) {
      const now = this.ctx.currentTime;
      this.master!.gain.cancelScheduledValues(now);
      this.master!.gain.setValueAtTime(this.master!.gain.value, now);
      this.master!.gain.linearRampToValueAtTime(MASTER_VOLUME, now + 1.2);
      this.loopStart = now + 0.15;
      this.index = 0;
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.tick();
    }
    return true;
  }

  /** Fade out and stop scheduling. Keeps the context so a later start() can reuse it. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.4);
    }
  }

  /** Pause sound without losing our place (used while the tab is hidden). */
  async suspend(): Promise<void> {
    if (this.ctx?.state === "running") await this.ctx.suspend();
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state !== "running") await this.ctx.resume();
  }

  async dispose(): Promise<void> {
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx) await ctx.close().catch(() => undefined);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;
    for (;;) {
      if (this.index >= FUR_ELISE.length) {
        this.index = 0;
        this.loopStart += FUR_ELISE_LENGTH * FUR_ELISE_SIXTEENTH_SECONDS;
      }
      const event = FUR_ELISE[this.index];
      if (!event) break;
      const when = this.loopStart + event.at * FUR_ELISE_SIXTEENTH_SECONDS;
      if (when > horizon) break;
      // Skip notes that fell behind (e.g. after the tab was suspended) instead of bunching them.
      if (when >= ctx.currentTime - 0.05) this.playNote(event, Math.max(when, ctx.currentTime));
      this.index += 1;
    }
  }

  private playNote(event: MusicEvent, when: number): void {
    const ctx = this.ctx!;
    const frequency = midiToFrequency(event.midi);
    const velocity = event.hand === "right" ? 0.9 : 0.55;
    const ring = event.hand === "right" ? 1.4 : 2.2;

    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0, when);
    voice.gain.linearRampToValueAtTime(velocity, when + 0.006);
    voice.gain.exponentialRampToValueAtTime(velocity * 0.35, when + 0.28);
    voice.gain.exponentialRampToValueAtTime(0.0001, when + ring);
    voice.connect(this.master!);

    const partials: Array<[OscillatorType, number, number]> = [
      ["triangle", 1, 1],
      ["sine", 2, 0.28],
      ["sine", 3, 0.08],
    ];
    for (const [type, multiple, level] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency * multiple;
      const gain = ctx.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(voice);
      osc.start(when);
      osc.stop(when + ring + 0.05);
    }
  }
}
