import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build, loadEnv } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const environment = { ...loadEnv("production", root, "SITE_"), ...process.env };
await import("./optimize-images.mjs");

// The renderer stays outside the deployable output. Hosting needs only static files.
await build({ root, build: { ssr: "src/entry-server.tsx", outDir: ".prerender", copyPublicDir: false } });
const { generateSite } = await import(pathToFileURL(resolve(root, ".prerender/entry-server.js")).href);
const site = generateSite(environment);
if (process.argv.includes("--indexable") && !site.indexable) {
  throw new Error("Public builds require SITE_URL and indexing enabled. See .env.example.");
}

await build({ root });
const output = resolve(root, "dist");
const template = await readFile(resolve(output, "index.html"), "utf8");
if (!template.includes("<!--app-html-->") || !template.includes("<!--seo:start-->")) {
  throw new Error("Missing static-render placeholders in index.html.");
}
for (const page of site.pages) {
  const html = template
    .replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, () => page.head)
    .replace("<!--app-html-->", () => page.html);
  const directory = resolve(output, `.${page.path}`);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "index.html"), html);
}
await writeFile(resolve(output, "404.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found — Porty</title><main><h1>Page not found</h1><p>This address does not exist.</p><a href="/">Porty home</a> · <a href="/guides/">Hardware guides</a></main></html>`);
for (const [name, content] of Object.entries(site.files)) {
  await writeFile(resolve(output, name), content);
}
console.log(`Static page generated. Indexing ${site.indexable ? "enabled" : "disabled for this preview (set SITE_URL for a public build)"}.`);
