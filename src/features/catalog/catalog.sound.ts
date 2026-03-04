/**
 * Web Audio API sound engine — Nintendo-inspired material UI sounds.
 * Every sound feels like a physical object: wood, paper, ceramic, ink.
 * C major pentatonic (C-D-E-G-A), round waveforms, restrained gains.
 *
 * All sounds are pre-rendered into AudioBuffers at init time via
 * OfflineAudioContext. Playback is a near-zero-cost buffer source start.
 * SSR-safe: init() is called on first user gesture from __root.tsx.
 */

const STORAGE_KEY = "dg-sound";
const VOLUME_KEY = "dg-sound-volume";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled: boolean | null = null;
let volume: number | null = null;
let ready = false;
let initPromise: Promise<void> | null = null;

const buffers = new Map<string, AudioBuffer>();
const cooldowns = new Map<string, number>();

// --- Settings (SSR-safe, unchanged) ---

function isEnabled(): boolean {
  if (enabled === null) {
    if (typeof window === "undefined") return false;
    enabled = localStorage.getItem(STORAGE_KEY) !== "off";
  }
  return enabled;
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

function bandpassNode(c: BaseAudioContext, freq: number, q: number): BiquadFilterNode {
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

// --- Sound definitions ---

type SoundDef = {
  duration: number;
  cooldownMs: number;
  cooldownKey?: string;
  build: (ctx: OfflineAudioContext, noise: AudioBuffer) => void;
};

const SOUNDS: Record<string, SoundDef> = {
  /** Paper breath — 40ms bandpassed noise */
  tick: {
    duration: 0.05,
    cooldownMs: 50,
    build(ctx, noise) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = bandpassNode(ctx, 3000, 2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.015, 0);
      g.gain.exponentialRampToValueAtTime(0.001, 0.04);
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start(0);
      src.stop(0.04);
    },
  },

  /** Wooden tok — sine 300Hz with 2ms noise transient */
  click: {
    duration: 0.1,
    cooldownMs: 80,
    build(ctx, noise) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(300, 0);
      g.gain.setValueAtTime(0.08, 0);
      g.gain.exponentialRampToValueAtTime(0.001, 0.08);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(0);
      o.stop(0.08);

      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = bandpassNode(ctx, 4000, 1);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.03, 0);
      ng.gain.exponentialRampToValueAtTime(0.001, 0.002);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(ctx.destination);
      src.start(0);
      src.stop(0.01);
    },
  },

  /** Navigate back — lower tok with downward bend */
  navBack: {
    duration: 0.1,
    cooldownMs: 80,
    cooldownKey: "nav",
    build(ctx, noise) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(260, 0);
      o.frequency.exponentialRampToValueAtTime(220, 0.09);
      g.gain.setValueAtTime(0.07, 0);
      g.gain.exponentialRampToValueAtTime(0.001, 0.09);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(0);
      o.stop(0.09);

      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = bandpassNode(ctx, 3500, 1);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.02, 0);
      ng.gain.exponentialRampToValueAtTime(0.001, 0.002);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(ctx.destination);
      src.start(0);
      src.stop(0.01);
    },
  },

  /** STAMP — thud + crinkle + ink sweep */
  stamp: {
    duration: 0.2,
    cooldownMs: 200,
    build(ctx, noise) {
      // Layer 1: Sine thud (75Hz, 120ms)
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = "sine";
      o1.frequency.setValueAtTime(75, 0);
      g1.gain.setValueAtTime(0.15, 0);
      g1.gain.exponentialRampToValueAtTime(0.001, 0.12);
      o1.connect(g1);
      g1.connect(ctx.destination);
      o1.start(0);
      o1.stop(0.12);

      // Layer 2: Bandpassed noise crinkle (1.5kHz, 30ms)
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = bandpassNode(ctx, 1500, 3);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.06, 0);
      g2.gain.exponentialRampToValueAtTime(0.001, 0.03);
      src.connect(bp);
      bp.connect(g2);
      g2.connect(ctx.destination);
      src.start(0);
      src.stop(0.03);

      // Layer 3: Sine ink sweep (600->300Hz, 150ms)
      const o3 = ctx.createOscillator();
      const g3 = ctx.createGain();
      o3.type = "sine";
      o3.frequency.setValueAtTime(600, 0);
      o3.frequency.exponentialRampToValueAtTime(300, 0.15);
      g3.gain.setValueAtTime(0.025, 0);
      g3.gain.exponentialRampToValueAtTime(0.001, 0.15);
      o3.connect(g3);
      g3.connect(ctx.destination);
      o3.start(0);
      o3.stop(0.15);
    },
  },

  /** Seal unlock — C5-E5-G5 triangle arpeggio + shimmer tail */
  sealUnlock: {
    duration: 0.6,
    cooldownMs: 500,
    build(ctx, _noise) {
      for (const [i, freq] of [523, 659, 784].entries()) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, i * 0.08);
        g.gain.setValueAtTime(0, 0);
        g.gain.linearRampToValueAtTime(0.08, i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, i * 0.08 + 0.2);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(i * 0.08);
        o.stop(i * 0.08 + 0.25);
      }

      const shimmer = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(1200, 0.16);

      lfo.type = "sine";
      lfo.frequency.setValueAtTime(6, 0.16);
      lfoGain.gain.setValueAtTime(0.015, 0.16);

      shimmerGain.gain.setValueAtTime(0.03, 0.16);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, 0.56);

      lfo.connect(lfoGain);
      lfoGain.connect(shimmerGain.gain);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(ctx.destination);

      lfo.start(0.16);
      shimmer.start(0.16);
      lfo.stop(0.56);
      shimmer.stop(0.56);
    },
  },

  /** Dice roll — pentatonic warble C4-G4-E4-A4-D4 */
  dice: {
    duration: 0.25,
    cooldownMs: 150,
    build(ctx, _noise) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(262, 0);
      o.frequency.setValueAtTime(392, 0.03);
      o.frequency.setValueAtTime(330, 0.06);
      o.frequency.setValueAtTime(440, 0.09);
      o.frequency.setValueAtTime(294, 0.12);
      g.gain.setValueAtTime(0.06, 0);
      g.gain.exponentialRampToValueAtTime(0.001, 0.2);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(0);
      o.stop(0.2);
    },
  },

  /** Ceramic detent tick — sine ping 800→600Hz + 6kHz noise burst, 35ms */
  knobTick: {
    duration: 0.05,
    cooldownMs: 30,
    cooldownKey: "knob",
    build(ctx, noise) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(800, 0);
      o.frequency.exponentialRampToValueAtTime(600, 0.035);
      g.gain.setValueAtTime(0.04, 0);
      g.gain.exponentialRampToValueAtTime(0.001, 0.035);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(0);
      o.stop(0.035);

      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = bandpassNode(ctx, 6000, 2);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.02, 0);
      ng.gain.exponentialRampToValueAtTime(0.001, 0.015);
      src.connect(bp);
      bp.connect(ng);
      ng.connect(ctx.destination);
      src.start(0);
      src.stop(0.015);
    },
  },

  /** Search — drawer open: sine 500Hz, slow attack */
  search: {
    duration: 0.3,
    cooldownMs: 30,
    build(ctx, _noise) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(500, 0);
      g.gain.setValueAtTime(0.001, 0);
      g.gain.linearRampToValueAtTime(0.025, 0.05);
      g.gain.setValueAtTime(0.025, 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, 0.25);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(0);
      o.stop(0.25);
    },
  },

  /** Toggle on — ascending two-note: 440Hz -> 660Hz */
  toggleOn: {
    duration: 0.15,
    cooldownMs: 100,
    cooldownKey: "toggle",
    build(ctx, _noise) {
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = "sine";
      o1.frequency.setValueAtTime(440, 0);
      g1.gain.setValueAtTime(0.07, 0);
      g1.gain.exponentialRampToValueAtTime(0.001, 0.05);
      o1.connect(g1);
      g1.connect(ctx.destination);
      o1.start(0);
      o1.stop(0.05);

      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.setValueAtTime(660, 0.05);
      g2.gain.setValueAtTime(0.07, 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, 0.13);
      o2.connect(g2);
      g2.connect(ctx.destination);
      o2.start(0.05);
      o2.stop(0.13);
    },
  },

  /** Toggle off — descending two-note: 660Hz -> 440Hz (quieter) */
  toggleOff: {
    duration: 0.15,
    cooldownMs: 100,
    cooldownKey: "toggle",
    build(ctx, _noise) {
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = "sine";
      o1.frequency.setValueAtTime(660, 0);
      g1.gain.setValueAtTime(0.06, 0);
      g1.gain.exponentialRampToValueAtTime(0.001, 0.05);
      o1.connect(g1);
      g1.connect(ctx.destination);
      o1.start(0);
      o1.stop(0.05);

      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.setValueAtTime(440, 0.05);
      g2.gain.setValueAtTime(0.05, 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, 0.13);
      o2.connect(g2);
      g2.connect(ctx.destination);
      o2.start(0.05);
      o2.stop(0.13);
    },
  },
};

// --- Pre-rendering ---

async function renderToBuffer(
  sampleRate: number,
  duration: number,
  buildGraph: (ctx: OfflineAudioContext, noise: AudioBuffer) => void,
): Promise<AudioBuffer> {
  const length = Math.ceil(sampleRate * duration);
  const offline = new OfflineAudioContext(1, length, sampleRate);

  // Fresh noise buffer on each offline context
  const noiseBuf = offline.createBuffer(1, sampleRate, sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < sampleRate; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  buildGraph(offline, noiseBuf);
  return offline.startRendering();
}

// --- Init & playback ---

async function doInit(): Promise<void> {
  if (typeof window === "undefined") return;

  ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();

  master = ctx.createGain();
  master.gain.value = getVolume();
  master.connect(ctx.destination);

  const sr = ctx.sampleRate;
  const entries = Object.entries(SOUNDS);
  const rendered = await Promise.all(
    entries.map(([, def]) => renderToBuffer(sr, def.duration, def.build)),
  );

  for (let i = 0; i < entries.length; i++) {
    buffers.set(entries[i][0], rendered[i]);
  }

  ready = true;
}

async function init(): Promise<void> {
  if (ready) return;
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

function play(name: string): void {
  if (!ready || !ctx || !master) return;
  if (!isEnabled()) return;

  const def = SOUNDS[name];
  if (!def) return;

  const key = def.cooldownKey ?? name;
  if (!cooldown(key, def.cooldownMs)) return;

  const buffer = buffers.get(name);
  if (!buffer) return;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(master);
  src.start();
}

// --- Named sound functions (public API unchanged) ---

function tick(): void {
  play("tick");
}
function click(): void {
  play("click");
}
function navForward(): void {
  play("click");
}
function navBack(): void {
  play("navBack");
}
function stamp(): void {
  play("stamp");
}
function sealUnlock(): void {
  play("sealUnlock");
}
function dice(): void {
  play("dice");
}
function knobTick(): void {
  play("knobTick");
}
function search(): void {
  play("search");
}
function toggleOn(): void {
  play("toggleOn");
}
function toggleOff(): void {
  play("toggleOff");
}

export const SoundEngine = {
  init,
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
  knobTick,
  search,
  toggleOn,
  toggleOff,
} as const;
