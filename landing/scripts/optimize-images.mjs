import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";

for (const [name, widths] of [["mac-hero", [640, 960, 1440]], ["mac-ports", [640, 960, 1180]]]) {
  const source = fileURLToPath(new URL(`../public/screenshots/${name}.png`, import.meta.url));
  const original = await stat(source);
  for (const width of widths) {
    for (const format of ["avif", "webp"]) {
      const output = fileURLToPath(new URL(`../public/screenshots/${name}-${width}.${format}`, import.meta.url));
      const existing = await stat(output).catch(() => null);
      if (existing && existing.mtimeMs >= original.mtimeMs) continue;
      await sharp(source).resize({ width, withoutEnlargement: true })
        .toFormat(format, format === "avif" ? { quality: 65, effort: 4 } : { quality: 85 })
        .toFile(output);
    }
  }
}
