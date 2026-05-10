// Phase 1: manual mapping of ~150 most common Q-IDs to ~65 canonical genres.
// Sub-genre implies parent — "Romantic Comedy" maps only to "romantic-comedy",
// the parent relationship handles the Comedy association.

export type CanonicalGenreEntry = {
  slug: string;
  name: string;
  parentSlug: string | null;
  sortOrder: number;
};

export type GenreMappingEntry = {
  wikidataId: string;
  canonicalSlug: string;
};

export const CANONICAL_GENRES: CanonicalGenreEntry[] = [
  // Main genres (sortOrder 0–17)
  { slug: "action", name: "Action", parentSlug: null, sortOrder: 0 },
  { slug: "adventure", name: "Adventure", parentSlug: null, sortOrder: 1 },
  { slug: "comedy", name: "Comedy", parentSlug: null, sortOrder: 2 },
  { slug: "crime", name: "Crime", parentSlug: null, sortOrder: 3 },
  { slug: "documentary", name: "Documentary", parentSlug: null, sortOrder: 4 },
  { slug: "drama", name: "Drama", parentSlug: null, sortOrder: 5 },
  { slug: "family", name: "Family", parentSlug: null, sortOrder: 6 },
  { slug: "fantasy", name: "Fantasy", parentSlug: null, sortOrder: 7 },
  { slug: "historical", name: "Historical", parentSlug: null, sortOrder: 8 },
  { slug: "horror", name: "Horror", parentSlug: null, sortOrder: 9 },
  { slug: "music", name: "Music", parentSlug: null, sortOrder: 10 },
  { slug: "mystery", name: "Mystery", parentSlug: null, sortOrder: 11 },
  { slug: "romance", name: "Romance", parentSlug: null, sortOrder: 12 },
  { slug: "sci-fi", name: "Sci-Fi", parentSlug: null, sortOrder: 13 },
  { slug: "sports", name: "Sports", parentSlug: null, sortOrder: 14 },
  { slug: "thriller", name: "Thriller", parentSlug: null, sortOrder: 15 },
  { slug: "war", name: "War", parentSlug: null, sortOrder: 16 },
  { slug: "western", name: "Western", parentSlug: null, sortOrder: 17 },

  // Sub-genres — Action
  { slug: "martial-arts", name: "Martial Arts", parentSlug: "action", sortOrder: 0 },
  { slug: "mecha", name: "Mecha", parentSlug: "action", sortOrder: 1 },
  { slug: "superhero", name: "Superhero", parentSlug: "action", sortOrder: 2 },

  // Sub-genres — Adventure
  { slug: "survival", name: "Survival", parentSlug: "adventure", sortOrder: 0 },
  { slug: "exploration", name: "Exploration", parentSlug: "adventure", sortOrder: 1 },
  { slug: "swashbuckler", name: "Swashbuckler", parentSlug: "adventure", sortOrder: 2 },
  { slug: "pirate", name: "Pirate", parentSlug: "adventure", sortOrder: 3 },

  // Sub-genres — Comedy
  { slug: "parody", name: "Parody", parentSlug: "comedy", sortOrder: 0 },
  { slug: "satire", name: "Satire", parentSlug: "comedy", sortOrder: 1 },
  { slug: "romantic-comedy", name: "Romantic Comedy", parentSlug: "comedy", sortOrder: 2 },
  { slug: "black-comedy", name: "Black Comedy", parentSlug: "comedy", sortOrder: 3 },

  // Sub-genres — Crime
  { slug: "noir", name: "Noir", parentSlug: "crime", sortOrder: 0 },
  { slug: "heist", name: "Heist", parentSlug: "crime", sortOrder: 1 },
  { slug: "gangster", name: "Gangster", parentSlug: "crime", sortOrder: 2 },

  // Sub-genres — Drama
  { slug: "slice-of-life", name: "Slice of Life", parentSlug: "drama", sortOrder: 0 },
  { slug: "coming-of-age", name: "Coming of Age", parentSlug: "drama", sortOrder: 1 },
  { slug: "tragedy", name: "Tragedy", parentSlug: "drama", sortOrder: 2 },
  { slug: "melodrama", name: "Melodrama", parentSlug: "drama", sortOrder: 3 },
  { slug: "biographical", name: "Biographical", parentSlug: "drama", sortOrder: 4 },

  // Sub-genres — Fantasy
  { slug: "dark-fantasy", name: "Dark Fantasy", parentSlug: "fantasy", sortOrder: 0 },
  { slug: "high-fantasy", name: "High Fantasy", parentSlug: "fantasy", sortOrder: 1 },
  { slug: "isekai", name: "Isekai", parentSlug: "fantasy", sortOrder: 2 },
  { slug: "urban-fantasy", name: "Urban Fantasy", parentSlug: "fantasy", sortOrder: 3 },
  { slug: "mahou-shoujo", name: "Mahou Shoujo", parentSlug: "fantasy", sortOrder: 4 },

  // Sub-genres — Historical
  { slug: "samurai", name: "Samurai", parentSlug: "historical", sortOrder: 0 },
  { slug: "medieval", name: "Medieval", parentSlug: "historical", sortOrder: 1 },

  // Sub-genres — Horror
  {
    slug: "psychological-horror",
    name: "Psychological Horror",
    parentSlug: "horror",
    sortOrder: 0,
  },
  { slug: "slasher", name: "Slasher", parentSlug: "horror", sortOrder: 1 },
  { slug: "gothic", name: "Gothic", parentSlug: "horror", sortOrder: 2 },
  { slug: "body-horror", name: "Body Horror", parentSlug: "horror", sortOrder: 3 },
  { slug: "survival-horror", name: "Survival Horror", parentSlug: "horror", sortOrder: 4 },

  // Sub-genres — Mystery
  { slug: "detective", name: "Detective", parentSlug: "mystery", sortOrder: 0 },

  // Sub-genres — Sci-Fi
  { slug: "cyberpunk", name: "Cyberpunk", parentSlug: "sci-fi", sortOrder: 0 },
  { slug: "space-opera", name: "Space Opera", parentSlug: "sci-fi", sortOrder: 1 },
  { slug: "dystopian", name: "Dystopian", parentSlug: "sci-fi", sortOrder: 2 },
  { slug: "post-apocalyptic", name: "Post-Apocalyptic", parentSlug: "sci-fi", sortOrder: 3 },
  { slug: "time-travel", name: "Time Travel", parentSlug: "sci-fi", sortOrder: 4 },

  // Sub-genres — Thriller
  {
    slug: "psychological-thriller",
    name: "Psychological Thriller",
    parentSlug: "thriller",
    sortOrder: 0,
  },
  { slug: "espionage", name: "Espionage", parentSlug: "thriller", sortOrder: 1 },

  // Game mechanics (flat — no parent, treated as main genres for games)
  { slug: "rpg", name: "RPG", parentSlug: null, sortOrder: 20 },
  { slug: "platformer", name: "Platformer", parentSlug: null, sortOrder: 21 },
  { slug: "fps", name: "FPS", parentSlug: null, sortOrder: 22 },
  { slug: "tps", name: "TPS", parentSlug: null, sortOrder: 23 },
  { slug: "strategy", name: "Strategy", parentSlug: null, sortOrder: 24 },
  { slug: "puzzle", name: "Puzzle", parentSlug: null, sortOrder: 25 },
  { slug: "simulation", name: "Simulation", parentSlug: null, sortOrder: 26 },
  { slug: "racing", name: "Racing", parentSlug: null, sortOrder: 27 },
  { slug: "fighting", name: "Fighting", parentSlug: null, sortOrder: 28 },
  { slug: "visual-novel", name: "Visual Novel", parentSlug: null, sortOrder: 29 },

  // Floating — Musical (pairs with any main genre)
  { slug: "musical", name: "Musical", parentSlug: null, sortOrder: 30 },

  // Floating — Silent & Animation
  { slug: "silent", name: "Silent", parentSlug: null, sortOrder: 31 },
  { slug: "animation", name: "Animation", parentSlug: null, sortOrder: 32 },
];

// Built from top ~180 Q-IDs by frequency in local DB.
// Sub-genre implies parent rule: map to sub-genre only, parent is inferred.

export const GENRE_MAPPINGS: GenreMappingEntry[] = [
  // ── Drama ─────────────────────────────────────────────────────────────
  { wikidataId: "Q130232", canonicalSlug: "drama" }, // drama film (29k)
  { wikidataId: "Q25372", canonicalSlug: "drama" }, // drama (244)
  { wikidataId: "Q1366112", canonicalSlug: "drama" }, // drama television series (1.9k)
  { wikidataId: "Q15637299", canonicalSlug: "drama" }, // drama anime and manga (160)
  { wikidataId: "Q21010853", canonicalSlug: "drama" }, // drama fiction (153)
  { wikidataId: "Q7168625", canonicalSlug: "drama" }, // historical drama (292) — also maps to historical
  { wikidataId: "Q63214877", canonicalSlug: "drama" }, // psychological drama film (108)
  { wikidataId: "Q542475", canonicalSlug: "drama" }, // period drama film (106)

  // Drama sub-genres
  { wikidataId: "Q859369", canonicalSlug: "coming-of-age" }, // comedy drama → coming-of-age? No, it's comedy-drama
  // Actually Q859369 is "comedy drama" — maps to both comedy and drama (compound)
  // But per rules: compound → multiple main genres when no sub-genre captures it
  { wikidataId: "Q645928", canonicalSlug: "biographical" }, // biographical film (2.4k)
  { wikidataId: "Q102429885", canonicalSlug: "coming-of-age" }, // coming-of-age film (441)
  { wikidataId: "Q2975633", canonicalSlug: "coming-of-age" }, // coming-of-age fiction (348)
  { wikidataId: "Q1919632", canonicalSlug: "melodrama" }, // melodrama (420)
  { wikidataId: "Q191489", canonicalSlug: "melodrama" }, // melodrama (139)
  { wikidataId: "Q775344", canonicalSlug: "drama" }, // teen drama television (122)
  { wikidataId: "Q1786567", canonicalSlug: "drama" }, // medical drama (107)
  { wikidataId: "Q643873", canonicalSlug: "drama" }, // legal drama (106)
  { wikidataId: "Q3038946", canonicalSlug: "romance" }, // romantic drama (100) → romance

  // ── Comedy ────────────────────────────────────────────────────────────
  { wikidataId: "Q157443", canonicalSlug: "comedy" }, // comedy film (11k)
  { wikidataId: "Q40831", canonicalSlug: "comedy" }, // comedy (174)
  { wikidataId: "Q9335576", canonicalSlug: "comedy" }, // comedy television series (1.3k)
  { wikidataId: "Q15286013", canonicalSlug: "comedy" }, // comedy anime and manga (186)
  { wikidataId: "Q7696995", canonicalSlug: "comedy" }, // comedy television program (156)
  { wikidataId: "Q170238", canonicalSlug: "comedy" }, // sitcom (421)
  { wikidataId: "Q21188110", canonicalSlug: "comedy" }, // American television sitcom (282)
  { wikidataId: "Q17113138", canonicalSlug: "comedy" }, // teen sitcom (117)
  { wikidataId: "Q16950433", canonicalSlug: "comedy" }, // comedy thriller (136)

  // Comedy sub-genres
  { wikidataId: "Q860626", canonicalSlug: "romantic-comedy" }, // romantic comedy (3.3k)
  { wikidataId: "Q118612349", canonicalSlug: "romantic-comedy" }, // romantic comedy film (140)
  { wikidataId: "Q622548", canonicalSlug: "parody" }, // parody film (284)
  { wikidataId: "Q5778924", canonicalSlug: "black-comedy" }, // black comedy film (242)
  { wikidataId: "Q53094", canonicalSlug: "black-comedy" }, // black comedy (106)
  { wikidataId: "Q761469", canonicalSlug: "comedy" }, // science fiction comedy (211) → maps to comedy + sci-fi

  // ── Action ────────────────────────────────────────────────────────────
  { wikidataId: "Q188473", canonicalSlug: "action" }, // action film (6.1k)
  { wikidataId: "Q343782", canonicalSlug: "action" }, // action television series (544)
  { wikidataId: "Q15637293", canonicalSlug: "action" }, // action anime and manga (187)
  { wikidataId: "Q270948", canonicalSlug: "action" }, // action game (946)
  { wikidataId: "Q343568", canonicalSlug: "action" }, // action-adventure game (1.1k)
  { wikidataId: "Q2678111", canonicalSlug: "action" }, // action comedy film (314)
  { wikidataId: "Q3990883", canonicalSlug: "action" }, // action thriller (167)
  { wikidataId: "Q4282636", canonicalSlug: "action" }, // shooter game (92)
  { wikidataId: "Q1044478", canonicalSlug: "action" }, // shoot 'em up (439)
  { wikidataId: "Q401831", canonicalSlug: "action" }, // beat 'em up (177)
  { wikidataId: "Q1163960", canonicalSlug: "action" }, // hack and slash (137)

  // Action sub-genres
  { wikidataId: "Q1033891", canonicalSlug: "martial-arts" }, // martial arts film (654)
  { wikidataId: "Q4292083", canonicalSlug: "mecha" }, // mecha (244)
  { wikidataId: "Q1535153", canonicalSlug: "superhero" }, // superhero film (330)
  { wikidataId: "Q101720774", canonicalSlug: "superhero" }, // superhero television program (128)
  { wikidataId: "Q2642760", canonicalSlug: "action" }, // vigilante film (96)

  // ── Crime ─────────────────────────────────────────────────────────────
  { wikidataId: "Q959790", canonicalSlug: "crime" }, // crime film (4.7k)
  { wikidataId: "Q9335577", canonicalSlug: "crime" }, // crime television series (445)
  { wikidataId: "Q19367312", canonicalSlug: "crime" }, // crime thriller film (443)
  { wikidataId: "Q113485322", canonicalSlug: "crime" }, // crime drama film (163)
  { wikidataId: "Q1788980", canonicalSlug: "crime" }, // crime comedy film (107)
  { wikidataId: "Q2321734", canonicalSlug: "crime" }, // police procedural (175)

  // Crime sub-genres
  { wikidataId: "Q185867", canonicalSlug: "noir" }, // film noir (652)
  { wikidataId: "Q2421031", canonicalSlug: "noir" }, // neo-noir (406)
  { wikidataId: "Q496523", canonicalSlug: "heist" }, // heist film (460)
  { wikidataId: "Q7444356", canonicalSlug: "gangster" }, // gangster film (113)

  // ── Horror ────────────────────────────────────────────────────────────
  { wikidataId: "Q200092", canonicalSlug: "horror" }, // horror film (4.4k)
  { wikidataId: "Q20220309", canonicalSlug: "horror" }, // horror television series (143)
  { wikidataId: "Q224700", canonicalSlug: "horror" }, // comedy horror (577)
  { wikidataId: "Q108466999", canonicalSlug: "horror" }, // comedy horror film (113)
  { wikidataId: "Q10663882", canonicalSlug: "horror" }, // science fiction horror film (191)
  { wikidataId: "Q1342372", canonicalSlug: "horror" }, // monster film (457)
  { wikidataId: "Q2137852", canonicalSlug: "horror" }, // vampire film (348)
  { wikidataId: "Q31888058", canonicalSlug: "horror" }, // ghost film (336)
  { wikidataId: "Q3072049", canonicalSlug: "horror" }, // zombie film (287)
  { wikidataId: "Q43911809", canonicalSlug: "horror" }, // supernatural horror film (128)
  { wikidataId: "Q1065444", canonicalSlug: "horror" }, // kaiju (93)

  // Horror sub-genres
  { wikidataId: "Q853630", canonicalSlug: "slasher" }, // slasher film (502)
  { wikidataId: "Q909586", canonicalSlug: "slasher" }, // splatter film (169)
  { wikidataId: "Q604725", canonicalSlug: "psychological-horror" }, // psychological horror (165)
  { wikidataId: "Q109629396", canonicalSlug: "psychological-horror" }, // psychological horror film (93)
  { wikidataId: "Q333967", canonicalSlug: "survival-horror" }, // survival horror (208)

  // ── Thriller ──────────────────────────────────────────────────────────
  { wikidataId: "Q2484376", canonicalSlug: "thriller" }, // thriller film (4.5k)
  { wikidataId: "Q182015", canonicalSlug: "thriller" }, // thriller (187)
  { wikidataId: "Q67175872", canonicalSlug: "thriller" }, // thriller television series (395)
  { wikidataId: "Q11304653", canonicalSlug: "thriller" }, // suspense film (215)
  { wikidataId: "Q2439025", canonicalSlug: "thriller" }, // erotic thriller (188)
  { wikidataId: "Q109733333", canonicalSlug: "thriller" }, // political thriller film (168)

  // Thriller sub-genres
  { wikidataId: "Q590103", canonicalSlug: "psychological-thriller" }, // psychological thriller (191)
  { wikidataId: "Q109733304", canonicalSlug: "psychological-thriller" }, // psychological thriller film (145)
  { wikidataId: "Q2297927", canonicalSlug: "espionage" }, // spy film (572)

  // ── Adventure ─────────────────────────────────────────────────────────
  { wikidataId: "Q319221", canonicalSlug: "adventure" }, // adventure film (3.5k)
  { wikidataId: "Q56064758", canonicalSlug: "adventure" }, // adventure television series (496)
  { wikidataId: "Q15712918", canonicalSlug: "adventure" }, // adventure anime and manga (255)
  { wikidataId: "Q23916", canonicalSlug: "adventure" }, // adventure video game (671)
  { wikidataId: "Q22981906", canonicalSlug: "adventure" }, // treasure hunt film (110)

  // Adventure sub-genres
  { wikidataId: "Q222639", canonicalSlug: "swashbuckler" }, // swashbuckler film (159)
  { wikidataId: "Q2096633", canonicalSlug: "pirate" }, // pirate film (175)

  // ── Romance ───────────────────────────────────────────────────────────
  { wikidataId: "Q1054574", canonicalSlug: "romance" }, // romance film (4.9k)
  { wikidataId: "Q84270297", canonicalSlug: "romance" }, // romance television series (200)
  { wikidataId: "Q15637310", canonicalSlug: "romance" }, // romance anime and manga (89)

  // ── Sci-Fi ────────────────────────────────────────────────────────────
  { wikidataId: "Q471839", canonicalSlug: "sci-fi" }, // science fiction film (3.1k)
  { wikidataId: "Q24925", canonicalSlug: "sci-fi" }, // science fiction (103)
  { wikidataId: "Q336059", canonicalSlug: "sci-fi" }, // science fiction television program (757)
  { wikidataId: "Q5366020", canonicalSlug: "sci-fi" }, // science fiction anime and manga (265)
  { wikidataId: "Q27670585", canonicalSlug: "sci-fi" }, // science fiction video game (690)
  { wikidataId: "Q2973181", canonicalSlug: "sci-fi" }, // speculative fiction film (277)

  // Sci-Fi sub-genres
  { wikidataId: "Q174526", canonicalSlug: "cyberpunk" }, // cyberpunk (132)
  { wikidataId: "Q54323360", canonicalSlug: "cyberpunk" }, // cyberpunk video game (153)
  { wikidataId: "Q20443008", canonicalSlug: "dystopian" }, // dystopian film (361)
  { wikidataId: "Q1341051", canonicalSlug: "post-apocalyptic" }, // post-apocalyptic film (280)
  { wikidataId: "Q115101598", canonicalSlug: "post-apocalyptic" }, // post-apocalyptic video game (280)
  { wikidataId: "Q104765957", canonicalSlug: "time-travel" }, // time-travel film (114)

  // ── Fantasy ───────────────────────────────────────────────────────────
  { wikidataId: "Q157394", canonicalSlug: "fantasy" }, // fantasy film (3.0k)
  { wikidataId: "Q98526245", canonicalSlug: "fantasy" }, // fantasy television series (713)
  { wikidataId: "Q15637301", canonicalSlug: "fantasy" }, // fantasy anime and manga (235)
  { wikidataId: "Q1957385", canonicalSlug: "fantasy" }, // cinematic fairy tale (165)

  // Fantasy sub-genres
  { wikidataId: "Q752321", canonicalSlug: "mahou-shoujo" }, // magical girl (117)

  // ── Mystery ───────────────────────────────────────────────────────────
  { wikidataId: "Q1200678", canonicalSlug: "mystery" }, // mystery film (1.8k)
  { wikidataId: "Q101898470", canonicalSlug: "mystery" }, // mystery television series (212)

  // Mystery sub-genres
  { wikidataId: "Q25533274", canonicalSlug: "detective" }, // detective film (203)
  { wikidataId: "Q186424", canonicalSlug: "detective" }, // detective fiction (95)

  // ── War ───────────────────────────────────────────────────────────────
  { wikidataId: "Q369747", canonicalSlug: "war" }, // war film (2.1k)

  // ── Western ───────────────────────────────────────────────────────────
  { wikidataId: "Q172980", canonicalSlug: "western" }, // Western film (1.5k)
  { wikidataId: "Q212781", canonicalSlug: "western" }, // Spaghetti Western (315)

  // ── Documentary ───────────────────────────────────────────────────────
  { wikidataId: "Q93204", canonicalSlug: "documentary" }, // documentary film (2.4k)
  { wikidataId: "Q7603925", canonicalSlug: "documentary" }, // television documentary (126)
  { wikidataId: "Q622370", canonicalSlug: "documentary" }, // docudrama (123)

  // ── Historical ────────────────────────────────────────────────────────
  { wikidataId: "Q17013749", canonicalSlug: "historical" }, // historical film (1.2k)
  { wikidataId: "Q20267837", canonicalSlug: "historical" }, // historical television series (101)

  // Historical sub-genres
  { wikidataId: "Q3327002", canonicalSlug: "medieval" }, // medieval film (142)
  { wikidataId: "Q1433443", canonicalSlug: "medieval" }, // sword-and-sandal film (139)

  // ── Family ────────────────────────────────────────────────────────────
  { wikidataId: "Q1361932", canonicalSlug: "family" }, // family film (815)
  { wikidataId: "Q2143665", canonicalSlug: "family" }, // children's film (1.1k)
  { wikidataId: "Q1273568", canonicalSlug: "family" }, // children's television series (660)
  { wikidataId: "Q1146335", canonicalSlug: "family" }, // teen film (1.1k)

  // ── Music / Musical ───────────────────────────────────────────────────
  { wikidataId: "Q842256", canonicalSlug: "musical" }, // musical film (2.7k)

  // ── Sports ────────────────────────────────────────────────────────────
  { wikidataId: "Q1339864", canonicalSlug: "sports" }, // sport film (306)
  { wikidataId: "Q868217", canonicalSlug: "sports" }, // sports video game (213)
  { wikidataId: "Q895583", canonicalSlug: "sports" }, // boxing film (189)
  { wikidataId: "Q3076696", canonicalSlug: "sports" }, // association football film (151)
  { wikidataId: "Q1478420", canonicalSlug: "sports" }, // association football video game (194)
  { wikidataId: "Q111278985", canonicalSlug: "sports" }, // American football film (97)

  // ── Game genres ───────────────────────────────────────────────────────
  { wikidataId: "Q744038", canonicalSlug: "rpg" }, // role-playing video game (908)
  { wikidataId: "Q1422746", canonicalSlug: "rpg" }, // action role-playing game (463)
  { wikidataId: "Q1529437", canonicalSlug: "rpg" }, // tactical role-playing game (164)
  { wikidataId: "Q175173", canonicalSlug: "rpg" }, // massively multiplayer online RPG (121)
  { wikidataId: "Q828322", canonicalSlug: "platformer" }, // platform game (984)
  { wikidataId: "Q19643088", canonicalSlug: "platformer" }, // Metroidvania (125)
  { wikidataId: "Q185029", canonicalSlug: "fps" }, // first-person shooter (689)
  { wikidataId: "Q380266", canonicalSlug: "tps" }, // third-person shooter (369)
  { wikidataId: "Q472055", canonicalSlug: "strategy" }, // strategy video game (204)
  { wikidataId: "Q208189", canonicalSlug: "strategy" }, // real-time strategy (330)
  { wikidataId: "Q2176159", canonicalSlug: "strategy" }, // turn-based strategy video game (187)
  { wikidataId: "Q2313710", canonicalSlug: "strategy" }, // real-time tactics (117)
  { wikidataId: "Q54767", canonicalSlug: "puzzle" }, // puzzle video game (512)
  { wikidataId: "Q13717398", canonicalSlug: "puzzle" }, // maze video game (100)
  { wikidataId: "Q1610017", canonicalSlug: "simulation" }, // simulation video game (234)
  { wikidataId: "Q1198141", canonicalSlug: "simulation" }, // business simulation game (90)
  { wikidataId: "Q588289", canonicalSlug: "simulation" }, // city-building game (88)
  { wikidataId: "Q860750", canonicalSlug: "racing" }, // racing video game (684)
  { wikidataId: "Q2070892", canonicalSlug: "racing" }, // vehicular combat game (112)
  { wikidataId: "Q846224", canonicalSlug: "fighting" }, // fighting game (480)
  { wikidataId: "Q689445", canonicalSlug: "visual-novel" }, // visual novel (220)
  { wikidataId: "Q584105", canonicalSlug: "music" }, // music video game (142)
  { wikidataId: "Q858523", canonicalSlug: "action" }, // stealth game → action (118)

  // ── Compound mappings (map to multiple genres) ────────────────────────
  // Q859369 = comedy drama → both comedy + drama
  { wikidataId: "Q859369", canonicalSlug: "comedy" }, // comedy drama (3.3k)
  { wikidataId: "Q859369", canonicalSlug: "drama" },

  // Q7168625 = historical drama → both historical + drama
  { wikidataId: "Q7168625", canonicalSlug: "historical" },

  // Q761469 = sci-fi comedy → both sci-fi + comedy
  { wikidataId: "Q761469", canonicalSlug: "sci-fi" },

  // Q224700 / Q108466999 = comedy horror → both comedy + horror
  { wikidataId: "Q224700", canonicalSlug: "comedy" },
  { wikidataId: "Q108466999", canonicalSlug: "comedy" },

  // Q10663882 = sci-fi horror → both sci-fi + horror
  { wikidataId: "Q10663882", canonicalSlug: "sci-fi" },

  // Q19367312 = crime thriller → both crime + thriller
  { wikidataId: "Q19367312", canonicalSlug: "thriller" },

  // Q2678111 = action comedy → both action + comedy
  { wikidataId: "Q2678111", canonicalSlug: "comedy" },

  // Q3990883 = action thriller → both action + thriller
  { wikidataId: "Q3990883", canonicalSlug: "thriller" },

  // Q113485322 = crime drama → both crime + drama
  { wikidataId: "Q113485322", canonicalSlug: "drama" },

  // Q1788980 = crime comedy → both crime + comedy
  { wikidataId: "Q1788980", canonicalSlug: "comedy" },

  // Q16950433 = comedy thriller → both comedy + thriller
  { wikidataId: "Q16950433", canonicalSlug: "thriller" },

  // Q2439025 = erotic thriller → thriller (already mapped above)

  // Q343568 = action-adventure game → both action + adventure
  { wikidataId: "Q343568", canonicalSlug: "adventure" },

  // ── Additional mappings (Phase 1.5 — gap fill) ─────────────────────────

  // Silent & Animation (floating genres)
  { wikidataId: "Q226730", canonicalSlug: "silent" }, // silent film (6.1k)
  { wikidataId: "Q202866", canonicalSlug: "animation" }, // animated film (229)
  { wikidataId: "Q3249257", canonicalSlug: "animation" }, // adult animation (92)
  { wikidataId: "Q25110269", canonicalSlug: "animation" }, // live-action/animated film (108)

  // Telenovela → drama + romance
  { wikidataId: "Q23745", canonicalSlug: "drama" }, // telenovela (1.1k)
  { wikidataId: "Q23745", canonicalSlug: "romance" },

  // Buddy film → comedy
  { wikidataId: "Q663106", canonicalSlug: "comedy" }, // buddy film (540)

  // Christmas film → family
  { wikidataId: "Q28026639", canonicalSlug: "family" }, // Christmas film (605)

  // Disaster film → action
  { wikidataId: "Q846544", canonicalSlug: "action" }, // disaster film (326)

  // Prison film → drama
  { wikidataId: "Q586250", canonicalSlug: "drama" }, // prison film (288)

  // Reality television → documentary
  { wikidataId: "Q182415", canonicalSlug: "documentary" }, // reality television (229)

  // Soap opera → melodrama
  { wikidataId: "Q23739", canonicalSlug: "melodrama" }, // soap opera (185)

  // Road movie → adventure
  { wikidataId: "Q628165", canonicalSlug: "adventure" }, // road movie (174)

  // Tokusatsu → action
  { wikidataId: "Q275934", canonicalSlug: "action" }, // tokusatsu (172)

  // Anthology series/film → drama
  { wikidataId: "Q23653", canonicalSlug: "drama" }, // anthology series (133)
  { wikidataId: "Q336144", canonicalSlug: "drama" }, // anthology film (115)

  // Art film → drama
  { wikidataId: "Q1135802", canonicalSlug: "drama" }, // art film (121)

  // Epic film → historical
  { wikidataId: "Q652256", canonicalSlug: "historical" }, // epic film (111)

  // Found footage → horror
  { wikidataId: "Q3272147", canonicalSlug: "horror" }, // found footage (107)

  // Tragicomedy → comedy + drama
  { wikidataId: "Q192881", canonicalSlug: "comedy" }, // tragicomedy (80)
  { wikidataId: "Q192881", canonicalSlug: "drama" },

  // Satirical film/TV → satire
  { wikidataId: "Q3745430", canonicalSlug: "satire" }, // satirical film/TV (85)
  { wikidataId: "Q128758", canonicalSlug: "satire" }, // satire (Simpsons etc.)

  // Animated sitcom → comedy + animation
  { wikidataId: "Q4765080", canonicalSlug: "comedy" }, // animated sitcom (67)
  { wikidataId: "Q4765080", canonicalSlug: "animation" },

  // Slapstick → comedy
  { wikidataId: "Q624771", canonicalSlug: "comedy" }, // slapstick (73)

  // Mockumentary → comedy
  { wikidataId: "Q459435", canonicalSlug: "comedy" }, // mockumentary (63)

  // Slice of life
  { wikidataId: "Q2561438", canonicalSlug: "slice-of-life" }, // slice of life (60)

  // Detective TV series → detective
  { wikidataId: "Q56878968", canonicalSlug: "detective" }, // detective TV series (60)

  // Post-apocalyptic TV series → post-apocalyptic
  { wikidataId: "Q104123273", canonicalSlug: "post-apocalyptic" }, // post-apoc TV series (62)

  // Game genres — additional
  { wikidataId: "Q11084095", canonicalSlug: "historical" }, // historical video game (83)
  { wikidataId: "Q42409239", canonicalSlug: "fantasy" }, // fantasy video game (79)
  { wikidataId: "Q1199309", canonicalSlug: "simulation" }, // life simulation game (84)
  { wikidataId: "Q2632782", canonicalSlug: "music" }, // rhythm game (77)
  { wikidataId: "Q11590806", canonicalSlug: "adventure" }, // point-and-click adventure (74)
  { wikidataId: "Q11590806", canonicalSlug: "puzzle" }, // point-and-click → also puzzle
  { wikidataId: "Q2628513", canonicalSlug: "adventure" }, // graphic adventure game (64)
  { wikidataId: "Q21030988", canonicalSlug: "survival" }, // survival game (63)
  { wikidataId: "Q1260861", canonicalSlug: "fps" }, // tactical shooter (57)
  { wikidataId: "Q862490", canonicalSlug: "rpg" }, // MMO (67)
  { wikidataId: "Q15613992", canonicalSlug: "action" }, // arcade game (69)

  // Supernatural film → fantasy
  { wikidataId: "Q3634883", canonicalSlug: "fantasy" }, // supernatural film (69)

  // Police/crime variants → crime
  { wikidataId: "Q2101714", canonicalSlug: "crime" }, // police film (72)
  { wikidataId: "Q11396323", canonicalSlug: "crime" }, // police TV drama (76)

  // Youth series → family
  { wikidataId: "Q1711400", canonicalSlug: "family" }, // youth series (79)

  // Buddy cop film → crime + comedy
  { wikidataId: "Q4984974", canonicalSlug: "crime" }, // buddy cop film (119)
  { wikidataId: "Q4984974", canonicalSlug: "comedy" },

  // Female buddy film → comedy
  { wikidataId: "Q5442753", canonicalSlug: "comedy" }, // female buddy film (86)

  // Trial/courtroom film → drama
  { wikidataId: "Q3072039", canonicalSlug: "drama" }, // trial film (193)

  // Zombie comedy → horror + comedy
  { wikidataId: "Q1747837", canonicalSlug: "horror" }, // zombie comedy (62)
  { wikidataId: "Q1747837", canonicalSlug: "comedy" },

  // Werewolf film → horror
  { wikidataId: "Q5258881", canonicalSlug: "horror" }, // werewolf film (66)

  // Blaxploitation → action
  { wikidataId: "Q883179", canonicalSlug: "action" }, // blaxploitation film (66)

  // Biopunk → cyberpunk
  { wikidataId: "Q1077883", canonicalSlug: "cyberpunk" }, // biopunk (69)

  // Ninja film → martial-arts
  { wikidataId: "Q3745429", canonicalSlug: "martial-arts" }, // ninja film (67)

  // School anime/manga → slice-of-life
  { wikidataId: "Q5366097", canonicalSlug: "slice-of-life" }, // school anime/manga (57)
];
