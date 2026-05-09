// scripts/generate-splash-screens.mjs
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PUBLIC = resolve(import.meta.dirname, "..", "public");
const acorn = await readFile(resolve(PUBLIC, "acorn.svg"));

// 8 sizes referenced by __root.tsx splash media queries.
const SIZES = [
  [1125, 2436], // iPhone X/XS/11 Pro
  [1170, 2532], // iPhone 12/13/14/15
  [1284, 2778], // iPhone 14/15 Plus
  [1179, 2556], // iPhone 14/15 Pro
  [1290, 2796], // iPhone 14/15 Pro Max
  [1536, 2048], // iPad mini/Air
  [1668, 2388], // iPad Pro 11"
  [2048, 2732], // iPad Pro 12.9"
];

async function renderSplash(w, h, bg, out) {
  // Acorn occupies ~25% of the shorter side, centered.
  const inner = Math.round(Math.min(w, h) * 0.25);
  const acornPng = await sharp(acorn, { density: 1024 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: bg } })
    .composite([{ input: acornPng, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(PUBLIC, out));
  console.log(`wrote ${out}`);
}

const DARK = { r: 0x0f, g: 0x0e, b: 0x0c, alpha: 1 };
const LIGHT = { r: 0xec, g: 0xe8, b: 0xde, alpha: 1 }; // --color-dg-bg light theme from app.css

await Promise.all(
  SIZES.flatMap(([w, h]) => [
    renderSplash(w, h, DARK, `apple-splash-dark-${w}-${h}.png`),
    renderSplash(w, h, LIGHT, `apple-splash-light-${w}-${h}.png`),
  ]),
);