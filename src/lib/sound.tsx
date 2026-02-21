import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type SoundId = "navigate" | "confirm" | "error" | "toggle" | "tick";

interface SoundDef {
  freq: number | number[];
  type: OscillatorType;
  dur: number;
  gain: number;
}

const SOUNDS: Record<SoundId, SoundDef> = {
  navigate: { freq: 880, type: "sine", dur: 0.025, gain: 0.08 },
  confirm: { freq: [660, 880], type: "sine", dur: 0.05, gain: 0.1 },
  error: { freq: 330, type: "triangle", dur: 0.07, gain: 0.08 },
  toggle: { freq: 1046, type: "sine", dur: 0.015, gain: 0.06 },
  tick: { freq: 523, type: "sine", dur: 0.01, gain: 0.05 },
};

interface SoundContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  playSound: (id: SoundId) => void;
}

const SoundContext = createContext<SoundContextValue>({
  enabled: false,
  setEnabled: () => {},
  playSound: () => {},
});

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSoundImpl(id: SoundId) {
  const def = SOUNDS[id];
  if (!def) return;

  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const freqs = Array.isArray(def.freq) ? def.freq : [def.freq];
  const attack = 0.002;
  const release = 0.008;
  const perNote = def.dur / freqs.length;

  for (let i = 0; i < freqs.length; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = def.type;
    osc.frequency.value = freqs[i];
    osc.connect(gain);
    gain.connect(ctx.destination);

    const start = now + i * perNote;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(def.gain, start + attack);
    gain.gain.setValueAtTime(def.gain, start + perNote - release);
    gain.gain.linearRampToValueAtTime(0, start + perNote);

    osc.start(start);
    osc.stop(start + perNote + 0.001);
  }
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem("dg-sound");
    if (stored === "on") {
      setEnabledState(true);
      enabledRef.current = true;
    }
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    enabledRef.current = v;
    localStorage.setItem("dg-sound", v ? "on" : "off");
  }, []);

  const playSound = useCallback((id: SoundId) => {
    if (!enabledRef.current) return;
    playSoundImpl(id);
  }, []);

  return (
    <SoundContext.Provider value={{ enabled, setEnabled, playSound }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}

export type { SoundId };
