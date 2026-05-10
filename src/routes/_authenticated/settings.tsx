import { ArrowLeft, Monitor, Moon, SpeakerHigh, SpeakerNone, Sun } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NavToggle } from "~/components/NavToggle";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { type ThemePreference, useTheme } from "~/lib/theme";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[600px] mx-auto px-g3 py-g3 sm:py-g4 flex flex-col gap-g3 sm:gap-g4">
        <div className="flex items-center gap-g2">
          <Link
            to="/profile"
            className="text-dg-text-secondary hover:text-dg-text transition-colors no-underline"
            onClick={() => SoundEngine.navBack()}
          >
            <ArrowLeft size={20} weight="bold" />
          </Link>
          <h1 className="font-display text-[1.6rem] font-normal m-0">settings</h1>
        </div>

        <SoundSection />
        <ThemeSection />
      </div>
    </div>
  );
}

function SoundSection() {
  const [on, setOn] = useState(true);
  const [vol, setVol] = useState(1);

  useEffect(() => {
    setOn(SoundEngine.isEnabled());
    setVol(SoundEngine.getVolume());
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[0.7rem] font-bold tracking-[0.12em] uppercase text-dg-text-tertiary m-0">
        sound
      </h2>
      <button
        type="button"
        onClick={() => {
          const next = SoundEngine.toggle();
          setOn(next);
          if (next) SoundEngine.toggleOn();
        }}
        className="dg-press flex items-center gap-3 bg-transparent border border-dg-border-subtle rounded p-3 hover:border-dg-border-strong w-full text-left"
      >
        {on ? (
          <SpeakerHigh size={20} weight="bold" className="text-dg-accent shrink-0" />
        ) : (
          <SpeakerNone size={20} weight="bold" className="text-dg-text-tertiary shrink-0" />
        )}
        <span className="text-sm text-dg-text">{on ? "Sound on" : "Sound off"}</span>
      </button>
      <div className="flex items-center gap-3 px-1">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={vol}
          disabled={!on}
          className="dg-range flex-1"
          onChange={(e) => {
            const v = Number.parseFloat(e.target.value);
            setVol(v);
            SoundEngine.setVolume(v);
          }}
          onMouseUp={() => {
            if (on) SoundEngine.click();
          }}
          onTouchEnd={() => {
            if (on) SoundEngine.click();
          }}
        />
        <span className="text-[0.7rem] text-dg-text-tertiary tabular-nums font-mono w-8 text-right">
          {Math.round(vol * 100)}
        </span>
      </div>
    </section>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "System", icon: <Monitor size={14} weight="bold" /> },
  { value: "dark", label: "Dark", icon: <Moon size={14} weight="bold" /> },
  { value: "light", label: "Light", icon: <Sun size={14} weight="bold" /> },
];

function ThemeSection() {
  const { preference, setThemePreference } = useTheme();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[0.7rem] font-bold tracking-[0.12em] uppercase text-dg-text-tertiary m-0">
        theme
      </h2>
      <NavToggle
        options={THEME_OPTIONS}
        value={preference}
        onChange={(v) => {
          setThemePreference(v);
          SoundEngine.click();
        }}
      />
    </section>
  );
}
