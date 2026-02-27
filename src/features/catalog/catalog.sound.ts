/**
 * Web Audio API sound engine — synthesized UI sounds.
 * SSR-safe: AudioContext is lazily created on first interaction.
 * Toggle state persisted in localStorage ("dg-sound").
 */

const STORAGE_KEY = "dg-sound";
const VOLUME_KEY = "dg-sound-volume";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled: boolean | null = null; // null = not yet read from storage
let volume: number | null = null;

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

/** Tiny tick — row hover */
function tick(): void {
  if (!isEnabled()) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(1600, t);
  g.gain.setValueAtTime(0.02, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.015);
}

/** Quick click — filter change, button press */
function click(): void {
  if (!isEnabled()) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(700, t);
  o.frequency.exponentialRampToValueAtTime(440, t + 0.05);
  g.gain.setValueAtTime(0.07, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.06);
}

/** Navigate forward — rising tone */
function navForward(): void {
  if (!isEnabled()) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(260, t);
  o.frequency.exponentialRampToValueAtTime(520, t + 0.1);
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.15);
}

/** Navigate back — falling tone */
function navBack(): void {
  if (!isEnabled()) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(400, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.1);
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.15);
}

/** STAMP — the core satisfying sound. Thud + crack */
function stamp(): void {
  if (!isEnabled()) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;
  // Low thud
  const o1 = c.createOscillator();
  const g1 = c.createGain();
  o1.type = "sine";
  o1.frequency.setValueAtTime(75, t);
  o1.frequency.exponentialRampToValueAtTime(35, t + 0.15);
  g1.gain.setValueAtTime(0.15, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o1.connect(g1);
  g1.connect(m);
  o1.start(t);
  o1.stop(t + 0.16);
  // High crack
  const o2 = c.createOscillator();
  const g2 = c.createGain();
  o2.type = "square";
  o2.frequency.setValueAtTime(110, t);
  g2.gain.setValueAtTime(0.05, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  o2.connect(g2);
  g2.connect(m);
  o2.start(t);
  o2.stop(t + 0.04);
}

/** Seal unlock — ascending arpeggio */
function sealUnlock(): void {
  if (!isEnabled()) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;
  for (const [i, freq] of [310, 392, 466].entries()) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t + i * 0.08);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.25);
    o.connect(g);
    g.connect(m);
    o.start(t + i * 0.08);
    o.stop(t + i * 0.08 + 0.3);
  }
}

/** Dice roll — playful warble */
function dice(): void {
  if (!isEnabled()) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(360, t);
  o.frequency.setValueAtTime(540, t + 0.03);
  o.frequency.setValueAtTime(300, t + 0.06);
  o.frequency.setValueAtTime(660, t + 0.09);
  o.frequency.setValueAtTime(420, t + 0.12);
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.2);
}

/** Search keystroke — soft tap */
function search(): void {
  if (!isEnabled()) return;
  const c = getCtx();
  const m = getMaster();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(480, t);
  o.frequency.exponentialRampToValueAtTime(320, t + 0.02);
  g.gain.setValueAtTime(0.025, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  o.connect(g);
  g.connect(m);
  o.start(t);
  o.stop(t + 0.04);
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
} as const;
