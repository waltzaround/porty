import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const root = JSON.parse(await readFile("package.json", "utf8"));
const visited = new Set();
const notices = [];
async function collect(name, parent = path.resolve("package.json")) {
  const require = createRequire(parent);
  let manifest;
  for (const dir of require.resolve.paths(name) ?? []) {
    const candidate = path.join(dir, name, "package.json");
    try { if (JSON.parse(await readFile(candidate, "utf8")).name === name) { manifest = candidate; break; } } catch {}
  }
  if (!manifest) throw new Error(`Cannot locate licence metadata for ${name}`);
  const pkg = JSON.parse(await readFile(manifest, "utf8"));
  const identity = `${pkg.name}@${pkg.version}`;
  if (visited.has(identity)) return;
  visited.add(identity);
  const dir = path.dirname(manifest);
  const files = (await readdir(dir)).filter(file => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file));
  if (!files.length) throw new Error(`Missing licence text for ${identity}`);
  notices.push(`# ${identity}\nLicence: ${pkg.license ?? "See text below"}\n\n${(await Promise.all(files.map(file => readFile(path.join(dir, file), "utf8")))).join("\n\n")}`);
  for (const dep of Object.keys(pkg.dependencies ?? {})) await collect(dep, manifest);
}
for (const name of Object.keys(root.dependencies ?? {})) await collect(name);
await mkdir("build/licenses", { recursive: true });
await writeFile("build/licenses/DEPENDENCIES.txt", notices.join("\n\n----------------------------------------\n\n"));
console.log(`Preserved licence notices for ${visited.size} bundled packages.`);
