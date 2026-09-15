import { build } from "esbuild";
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
const output = path.resolve("dist-electron");
if (path.dirname(output) !== process.cwd()) throw new Error("Unexpected build directory");
await rm(output, { recursive: true, force: true });
await build({
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  minify: true,
  define: { "process.platform": JSON.stringify(process.platform) },
  platform: "node",
  format: "cjs",
  external: ["electron"],
  sourcemap: "external",
});
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const mapDir = path.join(".artifacts", "sourcemaps", version);
await mkdir(mapDir, { recursive: true });
for (const file of await readdir(output)) if (file.endsWith(".map")) {
  await rename(path.join(output, file), path.join(mapDir, file));
}
