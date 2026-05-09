// scripts/generate-pwa-icons.mjs
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const PUBLIC = resolve(import.meta.dirname, "..", "public");
const acorn = await readFile(resolve(PUBLIC, "acorn.svg"));
const maskable = await readFile(resolve(PUBLIC, "icon-maskable.svg"));

// Non-maskable ("any"): full-bleed acorn on dark background.
// acorn.svg has no background — composite onto #0f0e0c.
const BG = { r: 0x0f, g: 0x0e, b: 0x0c, alpha: 1 };

async function renderAny(size, out) {
  const inner = Math.round(size * 0.7); // padding so the acorn doesn't touch edges
  const acornPng = await sharp(acorn, { density: 1024 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: acornPng, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(PUBLIC, out));
  console.log(`wrote ${out} (${size}×${size})`);
}

async function renderMaskable(size, out) {
  // icon-maskable.svg already includes the orange background and proper safe-zone padding.
  await sharp(maskable, { density: 1024 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(resolve(PUBLIC, out));
  console.log(`wrote ${out} (${size}×${size})`);
}

await Promise.all([
  renderAny(180, "icon-180.png"),
  renderAny(180, "apple-icon-180.png"),
  renderAny(192, "icon-192.png"),
  renderAny(512, "icon-512.png"),
  renderMaskable(192, "manifest-icon-192.maskable.png"),
  renderMaskable(512, "manifest-icon-512.maskable.png"),
]);

// icon-maskable-512.png is being dropped from the manifest — delete it in step 3.