import { readdir, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { packagePaths } from "./package-paths.mjs";
const { executable, resources } = packagePaths();
// lstat avoids double-counting macOS Framework symlinks.
async function bytes(file) {
  const info = await lstat(file);
  if (info.isSymbolicLink()) return 0;
  if (info.isFile()) return info.size;
  if (!info.isDirectory()) return 0;
  return (await Promise.all((await readdir(file)).map(name => bytes(path.join(file, name))))).reduce((a, b) => a + b, 0);
}
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const root = process.platform === "win32" ? path.dirname(executable) : path.resolve(executable, "../../..");
const artifacts = {};
for (const name of await readdir("release")) if (name.includes(version) && /\.(exe|dmg|zip)$/.test(name)) artifacts[name] = await bytes(path.join("release", name));
const report = { version, platform: process.platform, arch: process.arch, unpackedBytes: await bytes(root), applicationArchiveBytes: await bytes(path.join(resources, "app.asar")), artifacts };
if (process.platform === "win32") {
  assert.ok(report.unpackedBytes < 320 * 1024 * 1024, "Windows installed app exceeded 320 MiB");
  for (const [name, size] of Object.entries(artifacts)) assert.ok(size < 95 * 1024 * 1024, `${name} exceeded the 95 MiB download budget`);
}
await writeFile("release/size-report.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
