import { expect, test } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { product, questions } from "../src/lib/product";
import { crawlFiles, renderMetadata, siteSettings, structuredData } from "../src/lib/seo";
import { guidePath, guides } from "../src/lib/guides";
import AxeBuilder from "@axe-core/playwright";

test("production HTML contains the product, FAQ, and metadata before JavaScript", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain(product.summary);
  expect(html).toContain("<h1>");
  for (const [question, answer] of questions) {
    expect(html).toContain(question);
    expect(html).toContain(answer);
  }
  expect(html).not.toContain("<!--app-html-->");
  expect(html).not.toContain("<!--seo:start-->");
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.+?)<\/script>/)![1]);
  expect(schema["@graph"]).toContainEqual(expect.objectContaining({
    "@type": "SoftwareApplication", name: "Porty", operatingSystem: ["macOS", "Windows"],
  }));
  expect(html.match(/<title>/g)).toHaveLength(1);
  expect(html.match(/name="description"/g)).toHaveLength(1);
  expect(html.match(/name="robots"/g)).toHaveLength(1);
  const files = await readdir(resolve("dist"), { recursive: true });
  expect(files.some((file) => /\.map$|entry-server|\.prerender/.test(file))).toBe(false);
});

test("FAQs and platform downloads are usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: "http://127.0.0.1:4180" });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("hardware connections.");
    const answer = page.getByRole("region", { name: questions[1][0] });
    await expect(answer).not.toBeVisible();
    await page.locator("summary", { hasText: questions[1][0] }).click();
    await expect(answer).toContainText(questions[1][1]);
    await page.getByRole("link", { name: "Get Porty", exact: true }).first().click();
    await expect(page).toHaveURL(/#download$/);
    await page.locator(".download-options summary").click();
    await expect(page.locator(".download-options .release-option")).toHaveCount(3);
    await expect(page.locator(".download-options .release-option").last()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("every guide is a distinct static page with matching canonical and article data", async ({ request }) => {
  const home = await (await request.get("/")).text();
  const origin = home.match(/rel="canonical" href="([^"]+)"/)?.[1];
  for (const guide of guides) {
    const response = await request.get(guidePath(guide));
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<h1>${guide.title}</h1>`);
    expect(html).toContain(guide.summary);
    expect(html).toContain(guide.sources[0].url);
    if (origin) expect(html).toContain(`rel="canonical" href="${new URL(guidePath(guide), origin).href}"`);
    const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.+?)<\/script>/)![1]);
    expect(data["@graph"]).toContainEqual(expect.objectContaining({ "@type": "Article", headline: guide.title }));
  }
  if (home.includes('content="index, follow,')) {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap.match(/<loc>/g)).toHaveLength(6);
    expect(sitemap).toContain("/changelog/");
    for (const guide of guides) expect(sitemap).toContain(guidePath(guide));
  }
});

test("guides work without JavaScript, including contents links and navigation", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: "http://127.0.0.1:4180" });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "All hardware guides" }).click();
    await expect(page).toHaveURL(/\/guides\/$/);
    await page.getByRole("link", { name: new RegExp(guides[0].title) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(guides[0].title);
    await page.getByRole("navigation", { name: "On this page" }).getByRole("link").last().click();
    await expect(page).toHaveURL(/#compare$/);
    await expect(page.getByRole("heading", { name: "Compare one part of the setup at a time" })).toBeVisible();
  } finally { await context.close(); }
});

test("guide hydration, mobile layout and accessibility remain intact", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const guide of guides) {
    await page.goto(guidePath(guide));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(guide.title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations.map((issue) => ({ id: issue.id, nodes: issue.nodes.map((node) => node.target) }))).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("the hero uses a responsive modern image without fetching the original PNG", async ({ page }) => {
  const images: string[] = [];
  page.on("request", (request) => { if (request.resourceType() === "image") images.push(request.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const hero = page.locator('.screenshot-panel[data-state="active"] img');
  await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await hero.evaluate((image: HTMLImageElement) => image.currentSrc)).toMatch(/mac-ports-640\.(avif|webp)$/);
  expect(images.some((url) => /\/mac-(ports|hero)\.png$/.test(url))).toBe(false);
  expect(images.filter((url) => /mac-(ports|hero)-\d+\./.test(url))).toHaveLength(1);
});

test("hydration preserves the static page without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.getByRole("tab", { name: "Connection map", exact: true }).click();
  await expect(page.locator('.screenshot-panel[data-state="active"] img')).toHaveAttribute("src", "/screenshots/mac-hero-1440.webp");
  await page.getByRole("link", { name: "Get Porty", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("crawl files agree with the built HTML and published product facts", async ({ request }) => {
  const html = await readFile(resolve("dist/index.html"), "utf8");
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("User-agent: *\nAllow: /");
  const summary = await request.get("/llms.txt");
  expect(summary.status()).toBe(200);
  for (const [, answer] of questions) expect(await summary.text()).toContain(answer);
  const canonical = html.match(/rel="canonical" href="([^"]+)"/);
  if (html.includes('content="index, follow,')) {
    expect(canonical).toBeTruthy();
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain(`<loc>${canonical![1]}</loc>`);
    expect(await robots.text()).toContain(`Sitemap: ${canonical![1]}sitemap.xml`);
    expect(html).toContain(`property="og:image" content="${canonical![1]}screenshots/mac-ports.png"`);
  } else {
    expect(html).toContain('content="noindex, follow"');
    expect(await robots.text()).not.toContain("Sitemap:");
    await expect(readFile(resolve("dist/sitemap.xml"))).rejects.toThrow();
  }
});

test("public and preview metadata use the correct origin and indexing policy", () => {
  const site = siteSettings({ SITE_URL: "https://porty.example.org" });
  expect(site).toEqual({ url: "https://porty.example.org/", indexable: true });
  const meta = renderMetadata(site, "1.0.3");
  expect(meta).toContain('rel="canonical" href="https://porty.example.org/"');
  expect(meta).toContain('name="twitter:card" content="summary_large_image"');
  expect(meta).not.toContain("noindex");
  const files = crawlFiles(site, "1.0.3", [{ name: "Windows", detail: "64-bit PC", url: "https://downloads.example.org/Porty.exe" }]);
  expect(files["sitemap.xml"]).toContain("<loc>https://porty.example.org/</loc>");
  expect(files["llms.txt"]).toContain("https://downloads.example.org/Porty.exe");
  const app = structuredData(site, "1.0.3")["@graph"][2];
  expect(app).not.toHaveProperty("offers");
  expect(app).not.toHaveProperty("aggregateRating");
  expect(app.screenshot).toHaveLength(3);
  const preview = siteSettings({ SITE_URL: site.url, SITE_INDEXABLE: "false" });
  expect(renderMetadata(preview, "1.0.3")).toContain('content="noindex, follow"');
  expect(crawlFiles(preview, "1.0.3", [])).not.toHaveProperty("sitemap.xml");
  expect(siteSettings({})).toEqual({ url: undefined, indexable: false });
  expect(renderMetadata(siteSettings({}), "1.0.3")).not.toContain('rel="canonical"');
  expect(renderMetadata(site, '</script><script>alert(1)</script>')).not.toContain('<script>alert(1)');
});

test("indexing cannot accidentally target localhost or malformed site URLs", () => {
  for (const url of ["http://porty.example.org", "https://localhost", "https://127.0.0.1", "https://foo.local", "https://porty.example.org/subpath", "https://porty.example.org/?tracking=1", "https://user:password@porty.example.org", "not a url"]) {
    expect(() => siteSettings({ SITE_URL: url })).toThrow();
  }
  expect(() => siteSettings({ SITE_INDEXABLE: "true" })).toThrow("Set SITE_URL");
  expect(() => siteSettings({ SITE_INDEXABLE: "maybe" })).toThrow("true or false");
});
