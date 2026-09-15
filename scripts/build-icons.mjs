import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
await mkdir("build", { recursive: true });
const svg = await readFile("public/porty.svg");
await sharp(svg).resize(1024, 1024).png().toFile("build/icon.png");
const png = await sharp(svg).resize(256, 256).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile("build/icon.ico", Buffer.concat([header, png]));
if (process.platform === "darwin") {
  await mkdir("build/icon.iconset", { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2])
      await sharp(svg)
        .resize(size * scale, size * scale)
        .png()
        .toFile(
          `build/icon.iconset/icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`,
        );
  }
  execFileSync("/usr/bin/iconutil", [
    "-c",
    "icns",
    "build/icon.iconset",
    "-o",
    "build/icon.icns",
  ]);
}
