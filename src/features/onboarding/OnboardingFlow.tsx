import { ArrowLeft, Check, Shuffle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Button } from "~/components/Button";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import { displayMediaType, STAMP_COLORS, TYPE_HUES } from "~/features/media/media-types";
import { completeOnboarding } from "~/features/onboarding/onboarding.functions";
import { onboardingPicksOptions } from "~/features/onboarding/onboarding.queries";

// ─── Constants ───────────────────────────────────────────────────────────────

const MEDIA_TYPES = [
  { key: "movie", label: "Movies", icon: "\uD83C\uDFAC" },
  { key: "tv_series", label: "TV Shows", icon: "\uD83D\uDCFA" },
  { key: "anime", label: "Anime", icon: "\u2728" },
  { key: "game", label: "Games", icon: "\uD83C\uDFAE" },
] as const;

type MediaTypeKey = (typeof MEDIA_TYPES)[number]["key"];

const DISPLAY_COUNT = 24;

// ─── Shuffle helper ──────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OnboardingFlow() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedTypes, setSelectedTypes] = useState<Set<MediaTypeKey>>(
    () => new Set(MEDIA_TYPES.map((t) => t.key)),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [shuffleKey, setShuffleKey] = useState(0);

  const { data: picks } = useQuery(onboardingPicksOptions());
  const queryClient = useQueryClient();
  const router = useRouter();

  // Pool: all items from selected types, shuffled on each shuffleKey bump
  const pool = useMemo(() => {
    void shuffleKey; // read to register as dependency — bumping it re-shuffles
    if (!picks) return [];
    const items = Array.from(selectedTypes).flatMap((type) => picks[type] ?? []);
    return shuffleArray(items);
  }, [picks, selectedTypes, shuffleKey]);

  const displayed = pool.slice(0, DISPLAY_COUNT);

  const mutation = useMutation({
    mutationFn: () =>
      completeOnboarding({
        data: { selections: Array.from(selectedIds).map((id) => ({ wikidataId: id })) },
      }),
    onSuccess: () => {
      SoundEngine.sealUnlock();
      queryClient.invalidateQueries({ queryKey: ["user"] });
      router.invalidate();
    },
  });

  const toggleType = useCallback((type: MediaTypeKey) => {
    SoundEngine.click();
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const toggleTitle = useCallback((wikidataId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(wikidataId)) {
        SoundEngine.click();
        next.delete(wikidataId);
      } else {
        SoundEngine.stamp();
        next.add(wikidataId);
      }
      return next;
    });
  }, []);

  const handleShuffle = useCallback(() => {
    SoundEngine.dice();
    setShuffleKey((k) => k + 1);
  }, []);

  const handleNext = useCallback(() => {
    SoundEngine.click();
    setStep(2);
  }, []);

  const handleBack = useCallback(() => {
    SoundEngine.click();
    setStep(1);
  }, []);

  // ─── Step 1: Type picker ─────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
        <div className="max-w-[520px] mx-auto px-g3 py-8 sm:py-12">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            <div className="h-1 flex-1 rounded-full bg-dg-accent" />
            <div className="h-1 flex-1 rounded-full bg-dg-border" />
          </div>

          <h2 className="font-display text-[1.6rem] sm:text-[2rem] font-normal tracking-[-0.03em] text-dg-text mb-2">
            What do you track?
          </h2>
          <p className="text-[0.85rem] text-dg-text-secondary mb-6">
            Pick the media types you care about. You can always change this later.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {MEDIA_TYPES.map((t, i) => {
              const active = selectedTypes.has(t.key);
              const hue = TYPE_HUES[t.key] ?? 0;
              const color = STAMP_COLORS[t.key] ?? "var(--color-dg-accent)";

              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleType(t.key)}
                  className="relative rounded p-4 sm:p-5 text-left transition-all duration-50 cursor-pointer border-2"
                  style={{
                    borderColor: active ? color : "var(--color-dg-border-subtle)",
                    background: active
                      ? `linear-gradient(135deg, hsl(${hue},18%,14%) 0%, hsl(${hue},12%,10%) 100%)`
                      : "var(--color-dg-surface)",
                    animation: `fadeIn 50ms var(--ease-smooth) both ${i * 12}ms`,
                  }}
                >
                  {active && (
                    <div
                      className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: color }}
                    >
                      <Check size={12} weight="bold" className="text-white" />
                    </div>
                  )}
                  <div className="text-[1.4rem] mb-2">{t.icon}</div>
                  <div className="text-[0.9rem] font-medium text-dg-text">{t.label}</div>
                </button>
              );
            })}
          </div>

          <Button
            variant="primary"
            onClick={handleNext}
            disabled={selectedTypes.size === 0}
            className="mt-8 w-full py-3"
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  // ─── Step 2: Title picker ────────────────────────────────────────────────

  const isSaving = mutation.isPending;

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[900px] mx-auto px-g3 py-6 sm:py-8">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          <div className="h-1 flex-1 rounded-full bg-dg-accent" />
          <div className="h-1 flex-1 rounded-full bg-dg-accent" />
        </div>

        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1 text-[0.75rem] text-dg-text-tertiary hover:text-dg-text-secondary transition-colors mb-2 bg-transparent border-none cursor-pointer font-body p-0"
            >
              <ArrowLeft size={12} weight="bold" />
              Back
            </button>
            <h2 className="font-display text-[1.4rem] sm:text-[1.8rem] font-normal tracking-[-0.03em] text-dg-text">
              Stamp what you've seen
            </h2>
          </div>
          <Button
            variant="secondary"
            size="compact"
            onClick={handleShuffle}
            className="shrink-0 mt-6"
          >
            <Shuffle size={14} weight="bold" />
            Shuffle
          </Button>
        </div>
        <p className="text-[0.8rem] text-dg-text-secondary mb-5">
          Tap titles you've already watched or played. These will be added to your catalog.
        </p>

        {/* Title grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-g1">
          {displayed.map((item, i) => {
            const isSelected = selectedIds.has(item.wikidataId);
            const displayType = displayMediaType(item.mediaType, item.animationOrigin);

            return (
              <button
                key={item.wikidataId}
                type="button"
                onClick={() => toggleTitle(item.wikidataId)}
                className="text-left bg-transparent border-none p-0 cursor-pointer group relative"
                style={{
                  animation: `fadeIn 50ms var(--ease-smooth) both ${i * 8}ms`,
                }}
              >
                <div
                  className="w-full aspect-[2/3] rounded overflow-hidden relative transition-all duration-50"
                  style={{
                    outline: isSelected
                      ? "2.5px solid var(--color-dg-accent)"
                      : "2.5px solid transparent",
                    outlineOffset: "-2.5px",
                  }}
                >
                  <div className="w-full h-full transition-transform duration-50 ease-out group-hover:scale-[1.03]">
                    <CoverThumb
                      title={item.title}
                      mediaType={displayType}
                      size={200}
                      posterUrl={item.posterUrl ?? undefined}
                      loading="eager"
                    />
                  </div>
                  {isSelected && (
                    <div
                      className="absolute inset-0 flex items-center justify-center rounded"
                      style={{
                        background: "rgba(0,0,0,0.4)",
                        animation: "sealPop 50ms var(--ease-smooth) both",
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-dg-accent flex items-center justify-center">
                        <Check size={18} weight="bold" className="text-white" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-1 text-xs font-medium text-dg-text truncate transition-colors duration-50 group-hover:text-dg-accent">
                  {item.title}
                </div>
                <div className="mt-0.5">
                  <StampBadge type={displayType} index={i} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Sticky bottom bar */}
        <div
          className="sticky bottom-0 py-4 mt-4"
          style={{ background: "linear-gradient(to top, var(--color-dg-bg) 60%, transparent)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.8rem] text-dg-text-secondary tabular-nums">
              {selectedIds.size} selected
            </span>
            <Button
              variant="primary"
              onClick={() => mutation.mutate()}
              disabled={selectedIds.size === 0 || isSaving}
              className="min-w-[140px] text-center"
            >
              {isSaving ? (
                <span className="dg-ellipsis">Saving</span>
              ) : (
                `Add ${selectedIds.size} title${selectedIds.size === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
