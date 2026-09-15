import { expect, test } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { product, questions } from "../src/lib/product";
import { crawlFiles, renderMetadata, siteSettings, structuredData } from "../src/lib/seo";

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
    await expect(page.getByRole("heading", { level: 1 })).toContainText("connections.");
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

test("hydration preserves the static page without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.getByRole("tab", { name: "Port explorer", exact: true }).click();
  await expect(page.locator('.screenshot-panel[data-state="active"] img')).toHaveAttribute("src", "/screenshots/ports.png");
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
    expect(html).toContain(`property="og:image" content="${canonical![1]}screenshots/mac-hero.png"`);
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
