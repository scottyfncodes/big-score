/**
 * The sound of the night.
 *
 * Everything here is synthesised with WebAudio — no files, nothing to fetch,
 * nothing that fails to load on a train. Two buses: effects, which answer the
 * player's hands, and a small band, which answers how the night is going. The
 * band is a trio that never plays the same bar twice: an upright bass walking
 * in D minor, brushes and a ride, and — once somebody outside is counting — a
 * piano that starts to worry, then strings, then a siren somewhere across
 * town that gets closer.
 *
 * Rule: nothing in the game waits on audio, and nothing breaks without it.
 * Every entry point is safe to call before the context exists, after it has
 * been suspended, or in a browser that has no WebAudio at all.
 */

type Ctx = AudioContext;

const PREF_KEY = 'big-score:sound';

let ctx: Ctx | undefined;
let master: GainNode | undefined;
let sfxBus: GainNode | undefined;
let musicBus: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let enabled = readPref();
const listeners = new Set<(on: boolean) => void>();

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function soundOn(): boolean {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode: the toggle still holds for this session.
  }
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
  if (on) {
    ensure();
    applyMusic();
  }
  listeners.forEach((fn) => fn(on));
}

export function onSoundChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ensure(): Ctx | undefined {
  if (ctx) {
    if (ctx.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => undefined);
    return ctx;
  }
  const AC: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AC) return undefined;
  try {
    ctx = new AC();
  } catch {
    return undefined;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = enabled ? 0.9 : 0;
  master.connect(comp);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.8;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);

  const len = ctx.sampleRate * 2;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => undefined);
    else void ctx.resume().catch(() => undefined);
  });
  return ctx;
}

/**
 * iOS will only start audio inside a user gesture. The first tap anywhere
 * creates the context; every later one makes sure it is still running.
 */
export function installAudioUnlock() {
  const unlock = () => {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    if (c.state !== 'running') void c.resume().catch(() => undefined);
    applyMusic();
  };
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(type, unlock, { passive: true });
  }
}

const live = () => (enabled && ctx && ctx.state === 'running' ? ctx : undefined);

/* ---------------------------------------------------------------- voices */

function env(c: Ctx, at: number, peak: number, attack: number, decay: number, dest: AudioNode) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(dest);
  return g;
}

function tone(
  freq: number,
  opts: { type?: OscillatorType; at?: number; gain?: number; attack?: number; decay?: number; to?: number; dest?: AudioNode; detune?: number } = {},
) {
  const c = live();
  if (!c) return;
  const at = opts.at ?? c.currentTime;
  const decay = opts.decay ?? 0.3;
  const o = c.createOscillator();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, at);
  if (opts.detune) o.detune.value = opts.detune;
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, at + decay);
  const g = env(c, at, opts.gain ?? 0.2, opts.attack ?? 0.005, decay, opts.dest ?? sfxBus!);
  o.connect(g);
  o.start(at);
  o.stop(at + (opts.attack ?? 0.005) + decay + 0.05);
}

function noise(opts: {
  at?: number;
  gain?: number;
  attack?: number;
  decay?: number;
  filter?: BiquadFilterType;
  freq?: number;
  q?: number;
  sweepTo?: number;
  dest?: AudioNode;
}) {
  const c = live();
  if (!c || !noiseBuffer) return;
  const at = opts.at ?? c.currentTime;
  const decay = opts.decay ?? 0.1;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const f = c.createBiquadFilter();
  f.type = opts.filter ?? 'highpass';
  f.frequency.setValueAtTime(opts.freq ?? 2000, at);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, at + decay);
  f.Q.value = opts.q ?? 0.7;
  const g = env(c, at, opts.gain ?? 0.2, opts.attack ?? 0.002, decay, opts.dest ?? sfxBus!);
  src.connect(f);
  f.connect(g);
  const offset = Math.random() * 1.5;
  src.start(at, offset);
  src.stop(at + (opts.attack ?? 0.002) + decay + 0.05);
}

/* ------------------------------------------------------------------ sfx */

export const sfx = {
  /** Every button. Quiet; the hand should feel it more than the ear. */
  tap() {
    noise({ freq: 3500, decay: 0.025, gain: 0.08 });
    tone(1900, { decay: 0.03, gain: 0.025 });
  },
  /** A detent on the dial. `p` 0-1 lifts the pitch as the needle slows. */
  tick(p = 0) {
    noise({ filter: 'bandpass', freq: 3000 + p * 2500, q: 6, decay: 0.018, gain: 0.32 });
    tone(1400 + p * 800, { type: 'square', decay: 0.012, gain: 0.02 });
  },
  /** The wind-up before a check: tumblers turning over. */
  spin() {
    noise({ filter: 'bandpass', freq: 1200, sweepTo: 4200, q: 2, attack: 0.05, decay: 0.35, gain: 0.08 });
  },
  /** A rubber stamp on paper. */
  stamp(weight = 1) {
    tone(150, { to: 48, decay: 0.16, gain: 0.5 * weight });
    noise({ filter: 'lowpass', freq: 1400, decay: 0.07, gain: 0.35 * weight });
  },
  critical() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    [587.33, 880, 1174.66, 1760].forEach((f, i) =>
      tone(f, { at: t + i * 0.045, decay: 1.2, gain: 0.09, type: 'sine' }),
    );
    tone(2349, { at: t + 0.18, decay: 0.9, gain: 0.04, type: 'triangle' });
    for (let i = 0; i < 7; i++) {
      tone(3200 + Math.random() * 2600, { at: t + 0.12 + i * 0.055 + Math.random() * 0.03, decay: 0.09, gain: 0.03, type: 'triangle' });
    }
  },
  success() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    tone(587.33, { at: t, decay: 0.5, gain: 0.1, type: 'triangle' });
    tone(880, { at: t + 0.07, decay: 0.6, gain: 0.09, type: 'triangle' });
  },
  partial() {
    tone(392, { decay: 0.45, gain: 0.09, type: 'triangle' });
    tone(466.16, { decay: 0.35, gain: 0.04, type: 'sine' });
  },
  complication() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    tone(207.65, { at: t, decay: 0.7, gain: 0.12, type: 'sawtooth', dest: lowpass(c, 900) });
    tone(220, { at: t, decay: 0.7, gain: 0.12, type: 'sawtooth', dest: lowpass(c, 900) });
  },
  failure() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    tone(110, { to: 36, decay: 0.9, gain: 0.5 });
    tone(233, { at: t, to: 92, decay: 0.9, gain: 0.14, type: 'sawtooth', dest: lowpass(c, 700) });
    tone(246.94, { at: t + 0.02, to: 98, decay: 0.9, gain: 0.12, type: 'sawtooth', dest: lowpass(c, 700) });
    noise({ filter: 'lowpass', freq: 600, decay: 0.5, gain: 0.3 });
  },
  /** Something nobody planned for. */
  event() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    noise({ filter: 'bandpass', freq: 1800, q: 1, decay: 0.16, gain: 0.3 });
    const dest = lowpass(c, 1600);
    [146.83, 155.56, 220].forEach((f) => tone(f, { at: t, decay: 0.9, gain: 0.07, type: 'sawtooth', dest }));
  },
  /** Somebody outside has started counting. */
  exposed() {
    const c = live();
    if (!c) return;
    noise({ filter: 'bandpass', freq: 300, sweepTo: 2400, q: 3, attack: 0.6, decay: 0.5, gain: 0.12 });
    tone(73.42, { attack: 0.4, decay: 1.4, gain: 0.25 });
  },
  siren() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'triangle';
    const lfo = c.createOscillator();
    lfo.frequency.value = 1.4;
    const depth = c.createGain();
    depth.gain.value = 170;
    lfo.connect(depth);
    depth.connect(o.frequency);
    o.frequency.value = 760;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(f);
    f.connect(g);
    g.connect(sfxBus!);
    o.start(t);
    lfo.start(t);
    o.stop(t + 3.3);
    lfo.stop(t + 3.3);
  },
  /** The bill counter. Called once per riffle. */
  riffle(p = 0) {
    noise({ filter: 'bandpass', freq: 2400 + p * 1800, q: 1.5, decay: 0.03, gain: 0.12 });
  },
  register() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    noise({ filter: 'highpass', freq: 4000, decay: 0.05, gain: 0.2 });
    tone(1318.5, { at: t + 0.04, decay: 0.9, gain: 0.12 });
    tone(1975.5, { at: t + 0.04, decay: 0.9, gain: 0.08 });
    tone(2637, { at: t + 0.08, decay: 0.8, gain: 0.05 });
  },
  /** Something taken away: the cut, a loss off the bag. */
  debit() {
    tone(330, { to: 220, decay: 0.2, gain: 0.08, type: 'triangle' });
  },
  heartbeat() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    tone(62, { at: t, to: 40, decay: 0.16, gain: 0.45 });
    tone(58, { at: t + 0.22, to: 38, decay: 0.2, gain: 0.32 });
  },
  whoosh() {
    noise({ filter: 'bandpass', freq: 400, sweepTo: 3000, q: 1.2, attack: 0.08, decay: 0.25, gain: 0.07 });
  },
  /** A discovery. Distinct from everything else in the game on purpose. */
  mark() {
    const c = live();
    if (!c) return;
    const t = c.currentTime;
    [698.46, 880, 1046.5, 1396.9].forEach((f, i) =>
      tone(f, { at: t + i * 0.09, decay: 1.4, gain: 0.07, type: 'triangle' }),
    );
  },
};

function lowpass(c: Ctx, freq: number): AudioNode {
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.connect(sfxBus!);
  return f;
}

/** Phones that can buzz, should. iOS Safari cannot; nothing depends on it. */
export function buzz(pattern: number | number[]) {
  try {
    if (enabled) navigator.vibrate?.(pattern);
  } catch {
    // Not supported, and that is fine.
  }
}

/* ---------------------------------------------------------------- music */

export type MusicMode = 'off' | 'city' | 'night';

/**
 * 0 — unseen: bass and brushes, unhurried.
 * 1 — the street is listening: the piano starts to comment.
 * 2 — counting: tempo up, the piano worries, strings under it.
 * 3 — police on site: everything, and a pulse in the low end.
 */
let mode: MusicMode = 'off';
let intensity = 0;
let timer: number | undefined;
let nextBeat = 0;
let beat = 0;

export function setMusic(next: MusicMode, level = 0) {
  mode = next;
  intensity = Math.max(0, Math.min(3, level));
  applyMusic();
}

function tempo(): number {
  if (mode === 'city') return 72;
  return [80, 86, 104, 122][intensity];
}

function applyMusic() {
  const c = live();
  if (!c || !musicBus) return;
  const target = mode === 'off' ? 0 : mode === 'city' ? 0.5 : 0.62;
  musicBus.gain.setTargetAtTime(target, c.currentTime, mode === 'off' ? 0.6 : 1.2);
  if (mode !== 'off' && timer === undefined) {
    nextBeat = c.currentTime + 0.1;
    timer = window.setInterval(schedule, 40);
  }
  if (mode === 'off' && timer !== undefined) {
    const stopAt = c.currentTime + 3;
    window.setTimeout(() => {
      if (mode === 'off' && timer !== undefined && ctx && ctx.currentTime >= stopAt - 0.1) {
        window.clearInterval(timer);
        timer = undefined;
      }
    }, 3100);
  }
}

// D dorian-ish minor: Dm7 | Gm7 | Em7b5 A7 | Dm7 — two beats per chord in bar 3.
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 38, tones: [38, 41, 45, 48] }, // Dm7
  { root: 43, tones: [43, 46, 50, 53] }, // Gm7
  { root: 40, tones: [40, 43, 46, 50] }, // Em7b5
  { root: 45, tones: [45, 49, 52, 55] }, // A7
];
const BAR_CHORD = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 0, 0, 0, 0];

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

function schedule() {
  const c = live();
  if (!c || !musicBus) return;
  if (mode === 'off') return;
  const spb = 60 / tempo();
  // Do not try to catch up after a long suspension; just start again.
  if (nextBeat < c.currentTime - 0.5) nextBeat = c.currentTime + 0.05;
  while (nextBeat < c.currentTime + 0.15) {
    playBeat(c, nextBeat, beat, spb);
    nextBeat += spb;
    beat = (beat + 1) % 16;
  }
}

function playBeat(c: Ctx, at: number, b: number, spb: number) {
  const chord = CHORDS[BAR_CHORD[b]];
  const nextChord = CHORDS[BAR_CHORD[(b + 1) % 16]];
  const inBar = b % 4;
  const city = mode === 'city';

  // Walking bass: chord tones, with a chromatic approach into the next chord.
  let note: number;
  if (inBar === 0 || BAR_CHORD[b] !== BAR_CHORD[(b + 15) % 16]) note = chord.root;
  else if (BAR_CHORD[(b + 1) % 16] !== BAR_CHORD[b]) note = nextChord.root + (Math.random() < 0.5 ? 1 : -1);
  else note = chord.tones[1 + Math.floor(Math.random() * 3)] - (Math.random() < 0.3 ? 12 : 0);
  if (!city || inBar === 0 || inBar === 2) bass(c, at, mtof(note), spb);

  // Ride: ding, ding-a ding, swung.
  const swing = spb * 0.66;
  ride(c, at, city ? 0.025 : 0.04);
  if ((inBar === 1 || inBar === 3) && !city) ride(c, at + swing, 0.025);

  // Brushes on two and four.
  if (inBar === 1 || inBar === 3) {
    noise({ at, filter: 'bandpass', freq: 2600, q: 0.8, attack: 0.02, decay: spb * 0.6, gain: city ? 0.02 : 0.035, dest: musicBus });
  }

  if (mode !== 'night') {
    if (b % 8 === 0) pad(c, at, chord.tones, spb * 8, 0.018);
    return;
  }

  // Piano comments from intensity 1; worries (repeated minor seconds) from 2.
  if (intensity >= 1 && inBar === 1 && Math.random() < 0.55) {
    const voicing = chord.tones.slice(1).map((m) => m + 12);
    voicing.forEach((m) => keys(c, at + swing, mtof(m), 0.035));
  }
  if (intensity >= 2) {
    const top = chord.tones[3] + 24;
    if (inBar === 0 || inBar === 2) {
      keys(c, at, mtof(top), 0.03);
      keys(c, at + spb / 2, mtof(top + 1), 0.025);
    }
    if (b % 4 === 0) pad(c, at, chord.tones.map((m) => m + 12), spb * 4, 0.022);
  }
  if (intensity >= 3) {
    // A low pulse on every beat: the night is out of time.
    tone(mtof(chord.root - 12), { at, decay: spb * 0.5, gain: 0.16, dest: musicBus });
    if (b % 8 === 0) sfx.siren();
  }
  if (intensity === 0 && b % 8 === 0) pad(c, at, chord.tones, spb * 8, 0.012);
}

function bass(c: Ctx, at: number, f: number, spb: number) {
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f, at);
  const sub = c.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(f, at);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, at);
  lp.frequency.exponentialRampToValueAtTime(220, at + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.32, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.06, at + spb * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, at + spb * 0.95);
  o.connect(lp);
  sub.connect(lp);
  lp.connect(g);
  g.connect(musicBus!);
  o.start(at);
  sub.start(at);
  o.stop(at + spb);
  sub.stop(at + spb);
}

function ride(c: Ctx, at: number, gain: number) {
  noise({ at, filter: 'highpass', freq: 7000, decay: 0.18, gain, dest: musicBus });
  tone(5200 + Math.random() * 300, { at, decay: 0.25, gain: gain * 0.15, type: 'square', dest: musicBus });
  void c;
}

function keys(c: Ctx, at: number, f: number, gain: number) {
  tone(f, { at, decay: 0.9, gain, type: 'sine', dest: musicBus });
  tone(f * 2, { at, decay: 0.35, gain: gain * 0.35, type: 'triangle', dest: musicBus });
  void c;
}

function pad(c: Ctx, at: number, notes: number[], length: number, gain: number) {
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.connect(musicBus!);
  for (const m of notes) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    o.detune.value = (Math.random() - 0.5) * 12;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + length * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, at + length);
    o.connect(g);
    g.connect(lp);
    o.start(at);
    o.stop(at + length + 0.05);
  }
}
