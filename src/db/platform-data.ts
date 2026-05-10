// Two-tier hierarchy: platform families (parents) + specific platforms (children).
// Families sorted by modern relevance. Children sorted newest-first.

export type CanonicalPlatformEntry = {
  slug: string;
  name: string;
  parentSlug: string | null;
  sortOrder: number;
};

export type PlatformMappingEntry = {
  wikidataId: string;
  canonicalSlug: string;
};

export const CANONICAL_PLATFORMS: CanonicalPlatformEntry[] = [
  // Platform families (sortOrder 0–8)
  { slug: "playstation", name: "PlayStation", parentSlug: null, sortOrder: 0 },
  { slug: "xbox", name: "Xbox", parentSlug: null, sortOrder: 1 },
  { slug: "nintendo", name: "Nintendo", parentSlug: null, sortOrder: 2 },
  { slug: "pc", name: "PC", parentSlug: null, sortOrder: 3 },
  { slug: "mobile", name: "Mobile", parentSlug: null, sortOrder: 4 },
  { slug: "sega", name: "Sega", parentSlug: null, sortOrder: 5 },
  { slug: "atari", name: "Atari", parentSlug: null, sortOrder: 6 },
  { slug: "commodore", name: "Commodore", parentSlug: null, sortOrder: 7 },
  { slug: "arcade", name: "Arcade", parentSlug: null, sortOrder: 8 },

  // PlayStation — newest first
  { slug: "ps5", name: "PS5", parentSlug: "playstation", sortOrder: 0 },
  { slug: "ps4", name: "PS4", parentSlug: "playstation", sortOrder: 1 },
  { slug: "ps3", name: "PS3", parentSlug: "playstation", sortOrder: 2 },
  { slug: "ps2", name: "PS2", parentSlug: "playstation", sortOrder: 3 },
  { slug: "ps1", name: "PS1", parentSlug: "playstation", sortOrder: 4 },
  { slug: "ps-vita", name: "PS Vita", parentSlug: "playstation", sortOrder: 5 },
  { slug: "psp", name: "PSP", parentSlug: "playstation", sortOrder: 6 },

  // Xbox — newest first
  { slug: "xbox-series", name: "Xbox Series X|S", parentSlug: "xbox", sortOrder: 0 },
  { slug: "xbox-one", name: "Xbox One", parentSlug: "xbox", sortOrder: 1 },
  { slug: "xbox-360", name: "Xbox 360", parentSlug: "xbox", sortOrder: 2 },
  { slug: "xbox-original", name: "Xbox", parentSlug: "xbox", sortOrder: 3 },

  // Nintendo — newest first
  { slug: "switch", name: "Switch", parentSlug: "nintendo", sortOrder: 0 },
  { slug: "wii-u", name: "Wii U", parentSlug: "nintendo", sortOrder: 1 },
  { slug: "wii", name: "Wii", parentSlug: "nintendo", sortOrder: 2 },
  { slug: "gamecube", name: "GameCube", parentSlug: "nintendo", sortOrder: 3 },
  { slug: "n64", name: "N64", parentSlug: "nintendo", sortOrder: 4 },
  { slug: "snes", name: "SNES", parentSlug: "nintendo", sortOrder: 5 },
  { slug: "nes", name: "NES", parentSlug: "nintendo", sortOrder: 6 },
  { slug: "3ds", name: "3DS", parentSlug: "nintendo", sortOrder: 7 },
  { slug: "ds", name: "DS", parentSlug: "nintendo", sortOrder: 8 },
  { slug: "gba", name: "GBA", parentSlug: "nintendo", sortOrder: 9 },
  { slug: "game-boy", name: "Game Boy", parentSlug: "nintendo", sortOrder: 10 },

  // PC
  { slug: "windows", name: "Windows", parentSlug: "pc", sortOrder: 0 },
  { slug: "macos", name: "macOS", parentSlug: "pc", sortOrder: 1 },
  { slug: "linux", name: "Linux", parentSlug: "pc", sortOrder: 2 },
  { slug: "dos", name: "DOS", parentSlug: "pc", sortOrder: 3 },

  // Mobile
  { slug: "ios", name: "iOS", parentSlug: "mobile", sortOrder: 0 },
  { slug: "android", name: "Android", parentSlug: "mobile", sortOrder: 1 },

  // Sega — newest first
  { slug: "dreamcast", name: "Dreamcast", parentSlug: "sega", sortOrder: 0 },
  { slug: "saturn", name: "Saturn", parentSlug: "sega", sortOrder: 1 },
  { slug: "genesis", name: "Genesis", parentSlug: "sega", sortOrder: 2 },
  { slug: "game-gear", name: "Game Gear", parentSlug: "sega", sortOrder: 3 },
  { slug: "master-system", name: "Master System", parentSlug: "sega", sortOrder: 4 },

  // Atari
  { slug: "atari-2600", name: "Atari 2600", parentSlug: "atari", sortOrder: 0 },
  { slug: "atari-st", name: "Atari ST", parentSlug: "atari", sortOrder: 1 },

  // Commodore
  { slug: "c64", name: "Commodore 64", parentSlug: "commodore", sortOrder: 0 },
  { slug: "amiga", name: "Amiga", parentSlug: "commodore", sortOrder: 1 },
];

// Q-IDs verified against Wikidata P400 (platform) values.

export const PLATFORM_MAPPINGS: PlatformMappingEntry[] = [
  // ── PlayStation ──────────────────────────────────────────────────────────
  { wikidataId: "Q5014725", canonicalSlug: "ps5" }, // PlayStation 5
  { wikidataId: "Q10680", canonicalSlug: "ps4" }, // PlayStation 4
  { wikidataId: "Q10683", canonicalSlug: "ps4" }, // PlayStation 4 Pro
  { wikidataId: "Q56688022", canonicalSlug: "ps4" }, // PlayStation VR (PS4 peripheral)
  { wikidataId: "Q19610114", canonicalSlug: "ps3" }, // PlayStation 3
  { wikidataId: "Q10677", canonicalSlug: "ps2" }, // PlayStation 2
  { wikidataId: "Q10679", canonicalSlug: "ps1" }, // PlayStation (original)
  { wikidataId: "Q188808", canonicalSlug: "ps-vita" }, // PlayStation Vita
  { wikidataId: "Q170325", canonicalSlug: "psp" }, // PlayStation Portable

  // ── Xbox ─────────────────────────────────────────────────────────────────
  { wikidataId: "Q98973368", canonicalSlug: "xbox-series" }, // Xbox Series X|S
  { wikidataId: "Q13361286", canonicalSlug: "xbox-one" }, // Xbox One
  { wikidataId: "Q48263", canonicalSlug: "xbox-360" }, // Xbox 360
  { wikidataId: "Q132020", canonicalSlug: "xbox-original" }, // Xbox (original)

  // ── Nintendo ─────────────────────────────────────────────────────────────
  { wikidataId: "Q19610646", canonicalSlug: "switch" }, // Nintendo Switch
  { wikidataId: "Q56942", canonicalSlug: "wii-u" }, // Wii U
  { wikidataId: "Q8079", canonicalSlug: "wii" }, // Wii
  { wikidataId: "Q182172", canonicalSlug: "gamecube" }, // GameCube
  { wikidataId: "Q184839", canonicalSlug: "n64" }, // Nintendo 64
  { wikidataId: "Q183259", canonicalSlug: "snes" }, // Super NES
  { wikidataId: "Q172742", canonicalSlug: "nes" }, // NES
  { wikidataId: "Q203597", canonicalSlug: "3ds" }, // Nintendo 3DS
  { wikidataId: "Q170323", canonicalSlug: "ds" }, // Nintendo DS
  { wikidataId: "Q188642", canonicalSlug: "gba" }, // Game Boy Advance
  { wikidataId: "Q186437", canonicalSlug: "game-boy" }, // Game Boy
  { wikidataId: "Q183259", canonicalSlug: "snes" }, // duplicate guard: SNES aliases
  { wikidataId: "Q184198", canonicalSlug: "game-boy" }, // Game Boy Color

  // ── PC ───────────────────────────────────────────────────────────────────
  { wikidataId: "Q1406", canonicalSlug: "windows" }, // Microsoft Windows
  { wikidataId: "Q14116", canonicalSlug: "macos" }, // macOS
  { wikidataId: "Q388", canonicalSlug: "linux" }, // Linux
  { wikidataId: "Q47604", canonicalSlug: "dos" }, // MS-DOS

  // ── Mobile ───────────────────────────────────────────────────────────────
  { wikidataId: "Q48493", canonicalSlug: "ios" }, // iOS
  { wikidataId: "Q94", canonicalSlug: "android" }, // Android

  // ── Sega ─────────────────────────────────────────────────────────────────
  { wikidataId: "Q184198", canonicalSlug: "game-boy" }, // (handled above)
  { wikidataId: "Q60923", canonicalSlug: "dreamcast" }, // Dreamcast
  { wikidataId: "Q200912", canonicalSlug: "saturn" }, // Sega Saturn
  { wikidataId: "Q10676", canonicalSlug: "genesis" }, // Sega Genesis / Mega Drive
  { wikidataId: "Q751719", canonicalSlug: "game-gear" }, // Game Gear
  { wikidataId: "Q209868", canonicalSlug: "master-system" }, // Master System

  // ── Atari ────────────────────────────────────────────────────────────────
  { wikidataId: "Q206261", canonicalSlug: "atari-2600" }, // Atari 2600
  { wikidataId: "Q627302", canonicalSlug: "atari-st" }, // Atari ST

  // ── Commodore ────────────────────────────────────────────────────────────
  { wikidataId: "Q99775", canonicalSlug: "c64" }, // Commodore 64
  { wikidataId: "Q100047", canonicalSlug: "amiga" }, // Amiga

  // ── Arcade ───────────────────────────────────────────────────────────────
  { wikidataId: "Q192851", canonicalSlug: "arcade" }, // arcade game / arcade cabinet

  // ── Additional / aliases ─────────────────────────────────────────────────
  { wikidataId: "Q5738", canonicalSlug: "linux" }, // GNU/Linux (alternate Q-ID)
  { wikidataId: "Q56322457", canonicalSlug: "switch" }, // Nintendo Switch Lite
  { wikidataId: "Q63622527", canonicalSlug: "ps5" }, // PlayStation 5 Digital Edition
  { wikidataId: "Q941818", canonicalSlug: "psp" }, // PSP-1000 variant
  { wikidataId: "Q471862", canonicalSlug: "wii" }, // Virtual Console (Wii)
];
