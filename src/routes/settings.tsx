import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import {
  STATUS_LABELS_GENERIC,
  STATUS_ORDER,
  type StatusValue,
} from "~/features/media/media-types";
import { ogTags, pageTitle } from "~/lib/og";
import {
  getExpandedSections,
  getWatchlistView,
  setExpandedSections,
  setWatchlistView,
  type WatchlistView,
} from "~/lib/settings";
import { type ThemePreference, useTheme } from "~/lib/theme";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: pageTitle("settings — donguri") },
      ...ogTags({
        title: "Settings — donguri",
        description: "Customize your donguri experience.",
        path: "/settings",
      }),
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { preference, setThemePreference } = useTheme();
  const [soundOn, setSoundOn] = useState(true);
  const [view, setView] = useState<WatchlistView>("mixed");
  const [expanded, setExpanded] = useState<StatusValue[]>([...STATUS_ORDER]);

  useEffect(() => {
    setSoundOn(SoundEngine.isEnabled());
    setView(getWatchlistView());
    setExpanded(getExpandedSections());
  }, []);

  const handleSound = (on: boolean) => {
    if (on !== SoundEngine.isEnabled()) SoundEngine.toggle();
    setSoundOn(on);
    if (on) SoundEngine.click();
  };

  const handleTheme = (pref: ThemePreference) => {
    setThemePreference(pref);
    SoundEngine.click();
  };

  const handleView = (v: WatchlistView) => {
    setView(v);
    setWatchlistView(v);
    SoundEngine.click();
  };

  const toggleSection = (status: StatusValue) => {
    const next = expanded.includes(status)
      ? expanded.filter((s) => s !== status)
      : [...expanded, status];
    setExpanded(next);
    setExpandedSections(next);
    SoundEngine.click();
  };

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[600px] mx-auto px-g3 py-4 sm:py-6">
        <h1 className="font-display text-[1.5rem] sm:text-[1.8rem] font-normal tracking-[-0.02em] text-dg-text mb-6">
          settings
        </h1>

        <div className="flex flex-col gap-6">
          {/* Sound */}
          <Section label="Sound">
            <Row label="UI sounds" description="Clicks, ticks, and stamps">
              <SegmentControl
                options={[
                  { value: true, label: "on" },
                  { value: false, label: "off" },
                ]}
                value={soundOn}
                onChange={handleSound}
              />
            </Row>
          </Section>

          {/* Theme */}
          <Section label="Theme">
            <Row label="Appearance">
              <SegmentControl
                options={[
                  { value: "dark" as ThemePreference, label: "dark" },
                  { value: "light" as ThemePreference, label: "light" },
                  { value: "system" as ThemePreference, label: "system" },
                ]}
                value={preference}
                onChange={handleTheme}
              />
            </Row>
          </Section>

          {/* Watchlist */}
          <Section label="Watchlist">
            <Row label="Default view" description="How items are displayed on your watchlist">
              <SegmentControl
                options={[
                  { value: "list" as WatchlistView, label: "list" },
                  { value: "grid" as WatchlistView, label: "grid" },
                  { value: "mixed" as WatchlistView, label: "mixed" },
                ]}
                value={view}
                onChange={handleView}
              />
            </Row>
            <Row label="Expanded sections" description="Which sections start open" vertical>
              <div className="flex flex-col gap-0.5">
                {STATUS_ORDER.map((status) => (
                  <label
                    key={status}
                    className="flex items-center gap-2.5 cursor-pointer py-1.5 px-1 rounded hover:bg-dg-row-hover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={expanded.includes(status)}
                      onChange={() => toggleSection(status)}
                      className="w-3.5 h-3.5 rounded-sm"
                      style={{ accentColor: "var(--color-dg-accent)" }}
                    />
                    <span className="text-[0.8rem] text-dg-text-secondary">
                      {STATUS_LABELS_GENERIC[status]}
                    </span>
                  </label>
                ))}
              </div>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Components ─────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-[0.1em] mb-2">
        {label}
      </div>
      <div className="border border-dg-border-subtle rounded bg-dg-surface divide-y divide-dg-border-subtle overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  description,
  children,
  vertical,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  vertical?: boolean;
}) {
  return (
    <div
      className={`px-3 sm:px-4 py-3 ${vertical ? "flex flex-col gap-2.5" : "flex items-center justify-between gap-3"}`}
    >
      <div className={vertical ? "" : "flex-1 min-w-0"}>
        <div className="text-[0.85rem] text-dg-text font-medium">{label}</div>
        {description && (
          <div className="text-[0.75rem] text-dg-text-tertiary mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function SegmentControl<T extends string | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-[3px] border border-dg-border overflow-hidden shrink-0">
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`text-[0.75rem] font-body py-1.5 px-3 transition-all duration-150 cursor-pointer border-none ${
              i > 0 ? "border-l border-l-dg-border" : ""
            } ${
              selected
                ? "bg-dg-accent-soft text-dg-accent font-semibold"
                : "bg-transparent text-dg-text-tertiary hover:text-dg-text-secondary"
            }`}
            style={i > 0 ? { borderLeft: "1px solid var(--color-dg-border)" } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
