import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LinkButton } from "~/components/LinkButton";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { AcornIcon } from "~/features/media/components/AcornIcon";
import { InfiniteCarousel } from "~/features/media/components/InfiniteCarousel";
import { homepageSampleOptions } from "~/features/media/media.queries";

const TYPE_CARDS = [
  { type: "movie", label: "Movies", count: "28k+" },
  { type: "tv_series", label: "TV Shows", count: "12k+" },
  { type: "anime", label: "Anime", count: "8k+" },
  { type: "game", label: "Games", count: "15k+" },
] as const;

const AT_LINK = (
  <a
    href="https://atproto.com"
    target="_blank"
    rel="noopener noreferrer"
    className="text-dg-text-secondary hover:text-dg-accent transition-colors duration-50 underline decoration-dg-border-strong underline-offset-2"
  >
    AT Protocol
  </a>
);

const STEPS = [
  {
    step: "1",
    title: "Create an account or sign in",
    desc: (
      <>
        Use your {AT_LINK} identity, Google, or GitHub. We recommend AT Protocol for the full
        experience.
      </>
    ),
  },
  {
    step: "2",
    title: "Browse and track",
    desc: "Search across 100k+ titles. Mark what you\u2019re watching, playing, or planning to.",
  },
  {
    step: "3",
    title: "Your catalog, your way",
    desc: <>Rate, review, and organize. With {AT_LINK}, your data syncs to your own server.</>,
  },
];

export function LoggedOutView() {
  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      {/* Hero */}
      <section className="pt-3 sm:pt-6 pb-5 sm:pb-8 text-center">
        <h1 className="font-display text-[2.5rem] sm:text-[3.5rem] font-normal tracking-[-0.04em] mb-3 text-dg-text flex items-center justify-center">
          d
          <span className="text-dg-accent inline-flex items-center" style={{ margin: "0 -0.06em" }}>
            <span className="sm:hidden">
              <AcornIcon size={38} />
            </span>
            <span className="hidden sm:inline-flex">
              <AcornIcon size={52} />
            </span>
          </span>
          nguri
        </h1>
        <p className="text-dg-text-secondary text-[1rem] sm:text-[1.1rem] leading-relaxed max-w-[480px] mx-auto mb-2">
          All your media in one place.
        </p>
        <p className="text-dg-text-tertiary text-[0.85rem] leading-relaxed max-w-[420px] mx-auto mb-5">
          Track movies, TV shows, anime, and games.
          <br />
          Built on{" "}
          <a
            href="https://atproto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dg-text-secondary hover:text-dg-accent transition-colors duration-50 underline decoration-dg-border-strong underline-offset-2"
          >
            AT Protocol
          </a>{" "}
          — your catalog, your data.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <LinkButton to="/login" variant="primary" onClick={() => SoundEngine.click()}>
            Get started
          </LinkButton>
          <LinkButton to="/catalog" variant="secondary" onClick={() => SoundEngine.click()}>
            Browse catalog →
          </LinkButton>
        </div>
      </section>

      {/* Media type cards */}
      <section className="py-3 sm:py-6 max-w-[1100px] mx-auto px-g3">
        <div className="text-[0.75rem] text-dg-text-tertiary uppercase tracking-wider mb-3">
          One place for everything
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {TYPE_CARDS.map((t) => (
            <Link
              key={t.type}
              to="/catalog"
              search={{ type: t.type }}
              className="border border-dg-border-subtle rounded bg-dg-surface p-4 text-center no-underline hover:border-dg-border-strong transition-colors"
              onClick={() => SoundEngine.click()}
            >
              <div className="text-[0.85rem] font-medium text-dg-text mb-1">{t.label}</div>
              <div className="text-[0.7rem] text-dg-text-tertiary">{t.count} titles</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Catalog sample — right under type cards */}
      <CarouselSection />

      {/* How it works */}
      <section className="py-4 sm:py-6 max-w-[1100px] mx-auto px-g3">
        <div className="text-[0.75rem] text-dg-text-tertiary uppercase tracking-wider mb-3">
          How it works
        </div>
        <div className="flex flex-col gap-3">
          {STEPS.map((s) => (
            <div key={s.step} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full border border-dg-border flex items-center justify-center shrink-0 text-[0.75rem] text-dg-accent font-semibold">
                {s.step}
              </div>
              <div>
                <div className="text-[0.85rem] font-medium text-dg-text mb-0.5">{s.title}</div>
                <div className="text-[0.8rem] text-dg-text-tertiary leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Value props */}
      <section className="py-5 sm:py-8 max-w-[1100px] mx-auto px-g3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5">
            <div className="font-body text-[0.85rem] font-semibold text-dg-text mb-1">
              Your data, portable
            </div>
            <div className="text-[0.8rem] text-dg-text-secondary leading-relaxed">
              With{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-dg-text-secondary hover:text-dg-accent transition-colors duration-50 underline decoration-dg-border-strong underline-offset-2"
              >
                AT Protocol
              </a>
              , your catalog syncs to your own data server. Take it anywhere.
            </div>
          </div>
          <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5">
            <div className="font-body text-[0.85rem] font-semibold text-dg-text mb-1">
              100k+ titles
            </div>
            <div className="text-[0.8rem] text-dg-text-secondary leading-relaxed">
              Movies, TV, anime, and games — sourced from Wikidata, always growing.
            </div>
          </div>
          <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5">
            <div className="font-body text-[0.85rem] font-semibold text-dg-text mb-1">
              Free and open
            </div>
            <div className="text-[0.8rem] text-dg-text-secondary leading-relaxed">
              Open source. No ads, no tracking, no premium tiers gating core features.
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-5 sm:py-8 text-center border-t border-dg-border-subtle max-w-[1100px] mx-auto px-g3">
        <p className="font-display text-[1.3rem] sm:text-[1.5rem] text-dg-text mb-2">
          Ready to start tracking?
        </p>
        <p className="text-[0.8rem] text-dg-text-tertiary mb-4">Free and open source.</p>
        <LinkButton to="/login" variant="primary" onClick={() => SoundEngine.click()}>
          Get started
        </LinkButton>
      </section>
    </div>
  );
}

function CarouselSection() {
  const { data: samples } = useQuery(homepageSampleOptions());
  if (!samples || samples.length === 0) return null;

  return (
    <section className="pt-4 sm:pt-6 pb-4 sm:pb-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3 max-w-[1100px] mx-auto px-g3">
        <div className="text-[0.75rem] text-dg-text-tertiary uppercase tracking-wider">
          From the catalog
        </div>
        <Link to="/catalog" className="text-[0.7rem] text-dg-accent no-underline">
          Browse all →
        </Link>
      </div>
      <InfiniteCarousel items={samples} />
    </section>
  );
}
