import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";

const source = fileURLToPath(new URL("../public/screenshots/mac-hero.png", import.meta.url));
const original = await stat(source);
for (const width of [640, 960, 1440]) {
  for (const format of ["avif", "webp"]) {
    const output = fileURLToPath(new URL(`../public/screenshots/mac-hero-${width}.${format}`, import.meta.url));
    const existing = await stat(output).catch(() => null);
    if (existing && existing.mtimeMs >= original.mtimeMs) continue;
    await sharp(source).resize({ width, withoutEnlargement: true })
      .toFormat(format, format === "avif" ? { quality: 65, effort: 4 } : { quality: 85 })
      .toFile(output);
  }
}
