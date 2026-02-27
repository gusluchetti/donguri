/**
 * Web Audio API sound engine — Nintendo-inspired material UI sounds.
 * Every sound feels like a physical object: wood, paper, ceramic, ink.
 * C major pentatonic (C-D-E-G-A), round waveforms, restrained gains.
 * SSR-safe: AudioContext is lazily created on first interaction.
 * Toggle state persisted in localStorage ("dg-sound").
 */

const STORAGE_KEY = "dg-sound";
const VOLUME_KEY = "dg-sound-volume";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled: boolean | null = null; // null = not yet read from storage
let volume: number | null = null;

// Lazy noise buffer (reused by tick, click transient, stamp crinkle)
let noiseBuffer: AudioBuffer | null = null;

// Cooldown map
const cooldowns = new Map<string, number>();

function isEnabled(): boolean {
  if (enabled === null) {
    if (typeof window === "undefined") return false;
    enabled = localStorage.getItem(STORAGE_KEY) !== "off";
  }
  return enabled;
}

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function getMaster(): GainNode {
  const c = getCtx();
  if (!master) {
    master = c.createGain();
    master.gain.value = getVolume();
    master.connect(c.destination);
  }
  return master;
}

function getVolume(): number {
  if (volume === null) {
    if (typeof window === "undefined") return 1;
    const stored = localStorage.getItem(VOLUME_KEY);
    volume = stored != null ? Number.parseFloat(stored) : 1;
    if (Number.isNaN(volume) || volume < 0 || volume > 1) volume = 1;
  }
  return volume;
}

function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (typeof window !== "undefined") {
    localStorage.setItem(VOLUME_KEY, String(volume));
  }
  if (master) {
    master.gain.value = volume;
  }
}

/** Toggle sound on/off. Returns new state. */
function toggle(): boolean {
  enabled = !isEnabled();
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  }
  return enabled;
}

// --- Infrastructure ---

function getNoiseBuffer(): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const c = getCtx();
  const sr = c.sampleRate;
  const buf = c.createBuffer(1, sr, sr); // 1 second mono
  const data = buf.getChannelData(0);
  for (let i = 0; i < sr; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buf;
  return noiseBuffer;
}

function bandpass(c: AudioContext, freq: number, q: number): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function cooldown(key: string, ms: number): boolean {
  const now = performance.now();
  const last = cooldowns.get(key);
  if (last !== undefined && now - last < ms) return false;
  cooldowns.set(key, now);
  return true;
}

// --- Sound functions ---

/** Paper breath — 40ms bandpassed noise */
function tick(): void {
  if (!isEnabled() || !cooldown("tick", 50)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer();
  const bp = bandpass(c, 3000, 2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.015, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  src.connect(bp);
  bp.connect(g);
  g.connect(m);
  src.start(t);
  src.stop(t + 0.04);
}

/** Wooden tok — sine 300Hz with 2ms noise transient */
function click(): void {
  if (!isEnabled() || !cooldown("click", 80)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  // Sine body
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(300, t);
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.08);

  // Noise transient
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer();
  const bp = bandpass(c, 4000, 1);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.03, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.002);
  src.connect(bp);
  bp.connect(ng);
  ng.connect(m);
  src.start(t);
  src.stop(t + 0.01);
}

/** Navigate forward — alias for click */
function navForward(): void {
  click();
}

/** Navigate back — lower tok with downward bend */
function navBack(): void {
  if (!isEnabled() || !cooldown("nav", 80)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  // Lower sine body with downward bend
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(260, t);
  o.frequency.exponentialRampToValueAtTime(220, t + 0.09);
  g.gain.setValueAtTime(0.07, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.09);

  // Quieter noise transient
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer();
  const bp = bandpass(c, 3500, 1);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.02, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.002);
  src.connect(bp);
  bp.connect(ng);
  ng.connect(m);
  src.start(t);
  src.stop(t + 0.01);
}

/** STAMP — thud + crinkle + ink sweep */
function stamp(): void {
  if (!isEnabled() || !cooldown("stamp", 200)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  // Layer 1: Sine thud (75Hz, 120ms)
  const o1 = c.createOscillator();
  const g1 = c.createGain();
  o1.type = "sine";
  o1.frequency.setValueAtTime(75, t);
  g1.gain.setValueAtTime(0.15, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o1.connect(g1);
  g1.connect(m);
  o1.start(t);
  o1.stop(t + 0.12);

  // Layer 2: Bandpassed noise crinkle (1.5kHz, 30ms)
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer();
  const bp = bandpass(c, 1500, 3);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.06, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  src.connect(bp);
  bp.connect(g2);
  g2.connect(m);
  src.start(t);
  src.stop(t + 0.03);

  // Layer 3: Sine ink sweep (600→300Hz, 150ms, very quiet)
  const o3 = c.createOscillator();
  const g3 = c.createGain();
  o3.type = "sine";
  o3.frequency.setValueAtTime(600, t);
  o3.frequency.exponentialRampToValueAtTime(300, t + 0.15);
  g3.gain.setValueAtTime(0.025, t);
  g3.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o3.connect(g3);
  g3.connect(m);
  o3.start(t);
  o3.stop(t + 0.15);
}

/** Seal unlock — C5-E5-G5 triangle arpeggio + shimmer tail */
function sealUnlock(): void {
  if (!isEnabled() || !cooldown("sealUnlock", 500)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  // Arpeggio: C5(523) → E5(659) → G5(784) at 80ms intervals
  for (const [i, freq] of [523, 659, 784].entries()) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t + i * 0.08);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
    o.connect(g);
    g.connect(m);
    o.start(t + i * 0.08);
    o.stop(t + i * 0.08 + 0.25);
  }

  // Shimmer tail: 1.2kHz sine with 6Hz tremolo LFO, 400ms fade
  const shimmer = c.createOscillator();
  const shimmerGain = c.createGain();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();

  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(1200, t + 0.16);

  lfo.type = "sine";
  lfo.frequency.setValueAtTime(6, t + 0.16);
  lfoGain.gain.setValueAtTime(0.015, t + 0.16);

  shimmerGain.gain.setValueAtTime(0.03, t + 0.16);
  shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 0.56);

  lfo.connect(lfoGain);
  lfoGain.connect(shimmerGain.gain);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(m);

  lfo.start(t + 0.16);
  shimmer.start(t + 0.16);
  lfo.stop(t + 0.56);
  shimmer.stop(t + 0.56);
}

/** Dice roll — pentatonic warble C4-G4-E4-A4-D4 */
function dice(): void {
  if (!isEnabled() || !cooldown("dice", 150)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  // C major pentatonic warble: C4(262)-G4(392)-E4(330)-A4(440)-D4(294)
  o.frequency.setValueAtTime(262, t);
  o.frequency.setValueAtTime(392, t + 0.03);
  o.frequency.setValueAtTime(330, t + 0.06);
  o.frequency.setValueAtTime(440, t + 0.09);
  o.frequency.setValueAtTime(294, t + 0.12);
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.2);
}

/** Search — drawer open: sine 500Hz, slow attack */
function search(): void {
  if (!isEnabled() || !cooldown("search", 30)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(500, t);
  // 50ms fade-in, 100ms sustain, gentle decay
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.025, t + 0.05);
  g.gain.setValueAtTime(0.025, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.25);
}

/** Toggle on — ascending two-note: 440Hz → 660Hz */
function toggleOn(): void {
  if (!isEnabled() || !cooldown("toggle", 100)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  // First note: 440Hz, 50ms
  const o1 = c.createOscillator();
  const g1 = c.createGain();
  o1.type = "sine";
  o1.frequency.setValueAtTime(440, t);
  g1.gain.setValueAtTime(0.07, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o1.connect(g1);
  g1.connect(m);
  o1.start(t);
  o1.stop(t + 0.05);

  // Second note: 660Hz, 80ms
  const o2 = c.createOscillator();
  const g2 = c.createGain();
  o2.type = "sine";
  o2.frequency.setValueAtTime(660, t + 0.05);
  g2.gain.setValueAtTime(0.07, t + 0.05);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  o2.connect(g2);
  g2.connect(m);
  o2.start(t + 0.05);
  o2.stop(t + 0.13);
}

/** Toggle off — descending two-note: 660Hz → 440Hz (quieter) */
function toggleOff(): void {
  if (!isEnabled() || !cooldown("toggle", 100)) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;

  // First note: 660Hz, 50ms
  const o1 = c.createOscillator();
  const g1 = c.createGain();
  o1.type = "sine";
  o1.frequency.setValueAtTime(660, t);
  g1.gain.setValueAtTime(0.06, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o1.connect(g1);
  g1.connect(m);
  o1.start(t);
  o1.stop(t + 0.05);

  // Second note: 440Hz, 80ms, quieter
  const o2 = c.createOscillator();
  const g2 = c.createGain();
  o2.type = "sine";
  o2.frequency.setValueAtTime(440, t + 0.05);
  g2.gain.setValueAtTime(0.05, t + 0.05);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  o2.connect(g2);
  g2.connect(m);
  o2.start(t + 0.05);
  o2.stop(t + 0.13);
}

export const SoundEngine = {
  toggle,
  isEnabled,
  getVolume,
  setVolume,
  tick,
  click,
  navForward,
  navBack,
  stamp,
  sealUnlock,
  dice,
  search,
  toggleOn,
  toggleOff,
} as const;
