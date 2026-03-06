# roadmap

Your personal catalog for movies, TV shows, anime, and games.
Track what you've watched, what you're playing, and what's next.

## what we believe

1. Your media history is yours. Not ours, not a company's. AT Protocol means you can leave anytime and take everything with you.
2. Tracking should feel like maintaining a personal library, not filling out spreadsheets. Every interaction should have weight.
3. Social features exist to help you discover, not to manufacture engagement. No algorithmic feeds. No infinite scroll.
4. Open protocols over closed platforms. Always. Even when it's harder.

## Next up

- **Better episode tracking** — a full redesign of how you log episodes. Cleaner progress indicators, smarter bulk actions, and richer episode data. Design-first. [#44](https://github.com/gusluchetti/donguri/issues/44)
- **The Ranger Pass** — support development and make donguri yours. Custom stamp ink colors, sound packs, extra themes, extended analytics, and a personalized Ranger Pass card on your profile. Free forever for core features — the Pass is about expression and delight. [#114](https://github.com/gusluchetti/donguri/issues/114) [#115](https://github.com/gusluchetti/donguri/issues/115) [#116](https://github.com/gusluchetti/donguri/issues/116) [#117](https://github.com/gusluchetti/donguri/issues/117) [#118](https://github.com/gusluchetti/donguri/issues/118)
- **Custom stamp colors** — choose your ink. A curated palette of 16 colors across movies, TV, anime, and games. [#120](https://github.com/gusluchetti/donguri/issues/120)
- **Extra themes** — Warm Paper, Midnight, Forest. Beyond light and dark. [#121](https://github.com/gusluchetti/donguri/issues/121)
- **Sound packs** — alternate stamp sounds. Retro Console, Fountain Pen, Porcelain. [#122](https://github.com/gusluchetti/donguri/issues/122) [#123](https://github.com/gusluchetti/donguri/issues/123)
- **Account linking** — connect Google, GitHub, and Bluesky to a single account. Sign up however you want, add the rest later. [#130](https://github.com/gusluchetti/donguri/issues/130)
- **Account deletion** — full data removal, one confirmation. Your data, your call. [#131](https://github.com/gusluchetti/donguri/issues/131)

<!-- #44: Episode tracking redesign — design-first. Per-episode checkboxes on detail page, "mark through episode X" bulk toggle, clear S2·E4/10 progress indicator. seasons table + watched_episodes JSONB already exist. Evaluate TMDB for richer episode metadata (air dates, descriptions) and AniList for anime coverage. -->
<!-- #114–#118: Ranger Pass (monetization) — Sprint 1. subscriptions table (separate from users), subscriptionId FK on users. Lemon Squeezy MoR (handles tax/VAT). Checkout URL generation server-side with PPP region detection (cf-ipcountry → discount code). Webhook handler for subscription lifecycle. /ranger-pass upgrade page. RangerPassCard component on profile. -->
<!-- #120: Stamp colors — stampColors JSONB on users { movie?, tv_series?, anime?, game? }. Curated 16-color palette in src/features/subscription/premium-stamps.ts. StampBadge accepts optional color override. Settings Stamp Ink section — grayed + lock for free users. -->
<!-- #121: Theme variants — themeVariant column on users. Each theme = CSS custom property overrides. Warm Paper (cream/sepia/amber), Midnight (deep black/cool blue), Forest (dark green/earthy). Theme init script in <head> reads variant from cookie for flash-free load. -->
<!-- #122–#123: Sound packs — soundPack column on users (default: "default"). src/features/catalog/sound-packs/ one file per pack exporting SOUNDS record (SoundDef type). Packs: Retro Console (8-bit triangle waves), Fountain Pen (scratchier noise, longer tails), Porcelain (high-freq sines, ceramic clink). SoundEngine.init() reads active pack. Settings selector with preview button. -->
<!-- #130: Account linking — let Google/GitHub users connect Bluesky, bulk-push catalog_entries to PDS. Reverse (AT→Google/GitHub) populates googleId/githubId. Tricky part: merge flow — confirm identity across providers before linking. -->
<!-- #131: Account deletion — cascade: user → catalog_entries → revoke AT tokens → cancel LS subscription if active. Settings page, typed confirmation phrase. Non-negotiable before paid tier is complete. -->

## Planned

- **Filter improvements** — combine type, genre, year, rating, and status in a single query. Active filters shown as removable tags, shareable via URL. [#42](https://github.com/gusluchetti/donguri/issues/42) [#133](https://github.com/gusluchetti/donguri/issues/133)
- **Tags and status overhaul** — a curated tag layer alongside statuses: `liked`, `disliked`, `favorite`, `mastered`, `comfort`, `main`. Status simplified: `archived` replaces `dropped`, `paused` stays. Tags are emotional signals that complement ratings and will eventually feed recommendations. [#135](https://github.com/gusluchetti/donguri/issues/135)
- **Public profiles** — your collection, stats, and Ranger Pass card at `/@yourhandle`. Full privacy controls per section. [#43](https://github.com/gusluchetti/donguri/issues/43)
- **Notes** — add a personal note to any title. Like a private journal entry, attached to your catalog. [#132](https://github.com/gusluchetti/donguri/issues/132)
- **Import your collection** — bring in your anime list from MyAnimeList, films from Letterboxd, or shows from Trakt. Keep your history. [#77](https://github.com/gusluchetti/donguri/issues/77)
- **Lists** — curate and share themed collections. Franchises, genre deep-dives, "watch these in order" guides. [#66](https://github.com/gusluchetti/donguri/issues/66)
- **Extended analytics** — rating distribution, genre breakdowns, monthly heatmaps, completion trends, and a year-in-review summary. [#128](https://github.com/gusluchetti/donguri/issues/128) [#129](https://github.com/gusluchetti/donguri/issues/129)
- **Achievements** — milestones that reflect how you actually use the app. Completionist streaks, genre explorer badges, franchise finisher stamps. [#83](https://github.com/gusluchetti/donguri/issues/83) [#125](https://github.com/gusluchetti/donguri/issues/125) [#126](https://github.com/gusluchetti/donguri/issues/126) [#127](https://github.com/gusluchetti/donguri/issues/127)
- **FAQ** — common questions, plainly answered. [#64](https://github.com/gusluchetti/donguri/issues/64)

<!-- #133: Multi-filter — type + genre + year + rating + status combined query. Filter chips/tags UI, state in URL params. Needs genre filter wired first. Separate from #42 (watchlist filter parity) which is the UI side; this is the query layer. -->
<!-- #43: Public profiles at /@handle. Privacy controls per section (public/private). Ranger Pass card as hero. Stats snapshot, achievements, favorite titles. Foundation for activity feeds + community ratings later. -->
<!-- #132: Notes — notes text column on catalog_entries. Simple textarea on detail page. Private by default, optionally surface on public profile later. -->
<!-- #135: Tags + status overhaul — tags text[] column on catalog_entries with CHECK constraint (allowed: favorite, liked, disliked, mastered, comfort, main). liked/disliked mutually exclusive. Migrate is_favorite boolean → tags array. Status enum: remove dropped, add archived; migrate existing dropped → archived. liked/disliked feed recommendations later. -->
<!-- #77: Import — MAL: parse <myanimelist><anime> XML, match via malId, map statuses + scores (1-10 → 0-100), import episode counts. Letterboxd: CSV. Trakt: API or CSV. Match via TMDB/IMDB IDs. -->
<!-- #66: Lists — shareable curated collections. User-created, optionally public. Franchise grouping, genre deep-dives, watch-order guides. -->
<!-- #128–#129: Extended analytics — recharts. Rating distribution histogram, genre radar chart, monthly heatmap (GitHub-style), completion rate trends, avg days to complete per type, Year in Review. Ranger Pass only. -->
<!-- #125–#127: Achievements — user_achievements(id, userId, achievementKey, unlockedAt, tier). Registry in code. Check runs as background job post-mutation. Free: milestones (first entry, 10/50/100/500, first rating, type explorer, streaks). Ranger Pass: full-color ink, gold foil, exclusive achievements (genre master, binge tracker, decade traveler), showcase (pin 3 to profile). -->
<!-- #64: FAQ page — common questions answered. Covers pricing, data ownership, AT Protocol, what stays free. -->

## On the horizon

- **Stats and year-in-review** — your watching habits visualized. An annual summary of where your time went.
- **Activity feed** — see what the people you follow are watching and rating.
- **Community ratings** — aggregate scores from donguri users alongside external ratings.
- **Data export** — download your entire collection as a file, anytime.
- **Recommendations** — discover titles based on your history and taste.
- **"Currently watching" shelf** — surface in-progress titles front and center on your homepage.
- **Franchise grouping** — link sequels, prequels, and spinoffs as a navigable tree.
- **Where to watch** — streaming availability by region.
- **Richer detail pages** — directors, cast, studios, awards.
- **Gamification** — tracking streaks, seasonal events, discovery challenges, and opt-in leaderboards.
- **AT Protocol publishing** — publish your reviews and tracking activity as native AT Protocol records on your PDS. [#63](https://github.com/gusluchetti/donguri/issues/63)
- **Public API** — query your own data from external tools and scripts. [#45](https://github.com/gusluchetti/donguri/issues/45)

<!-- Data export: JSON/CSV download of all catalog_entries. Non-negotiable eventually — users must be able to leave cleanly. -->
<!-- Community: aggregate ratings from donguri users. Requires public profiles + meaningful user base first. -->
<!-- Gamification detail: daily/weekly streaks, genre exploration badges, expertise tiers per genre ("Sci-Fi Scholar"), year-in-review Wrapped-style, curated quests ("Studio Ghibli Journey"), seasonal events (horror October, romance February), discovery roulette from backlog. Opt-in leaderboards among mutuals. -->
<!-- Visual catalog remaining: directors/cast/studios from Wikidata, awards P166/P1411 (needs qualifier extraction + new awards table), inline external ratings. -->
<!-- Franchise grouping: Wikidata P179 (part of series) + P155/P156 (follows/followed by). -->
<!-- Where to watch: JustWatch API for streaming availability. -->
<!-- #63: AT Protocol publishing — publish tracking/reviews as native AT Protocol records on user's PDS. Requires lexicon design. -->
<!-- #45: Public API — query own data from external tools. Auth via API key or AT Protocol session. -->
