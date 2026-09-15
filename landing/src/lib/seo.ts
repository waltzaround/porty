import { product, questions } from "./product";
import { guideForPath, guidePath, guides } from "./guides";
import { heroSizes, heroSrcSet } from "../components/HeroImage";

export type SiteSettings = { url?: string; indexable: boolean };
type Release = { name: string; detail: string; url?: string };

export function siteSettings(env: Record<string, string | undefined>): SiteSettings {
  const input = env.SITE_URL?.trim();
  let url: string | undefined;
  if (input) {
    const parsed = new URL(input);
    if (
      parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.hostname) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/i.test(parsed.hostname)
    ) {
      throw new Error("SITE_URL must be the public HTTPS site origin, without a path, credentials, or query.");
    }
    url = parsed.href;
  }
  const flag = env.SITE_INDEXABLE?.trim();
  if (flag && flag !== "true" && flag !== "false") {
    throw new Error("SITE_INDEXABLE must be true or false.");
  }
  if (flag === "true" && !url) {
    throw new Error("Set SITE_URL before enabling indexing.");
  }
  return { url, indexable: Boolean(url) && flag !== "false" };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function pageDetails(path: string) {
  const guide = guideForPath(path);
  if (guide) return { title: `${guide.title} — Porty`, description: guide.description, guide };
  if (path === "/guides/") return {
    title: "Hardware Connection Guides for Mac and Windows — Porty",
    description: "Practical guides to checking USB connection speeds, viewing device trees, and tracing hub connections on macOS and Windows.",
  };
  return { title: product.title, description: product.description };
}

export function structuredData(site: SiteSettings, version: string, path = "/") {
  const absolute = (path: string) => site.url ? new URL(path, site.url).href : undefined;
  const page = pageDetails(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": absolute("#website"),
        name: product.name,
        url: site.url,
        inLanguage: "en",
      },
      {
        "@type": "WebPage",
        "@id": absolute(`${path}#webpage`),
        url: absolute(path),
        name: page.title,
        description: page.description,
        inLanguage: "en",
        isPartOf: site.url ? { "@id": absolute("#website") } : undefined,
        mainEntity: site.url ? { "@id": absolute(page.guide ? `${path}#article` : path === "/" ? "#app" : `${path}#guides`) } : undefined,
      },
      ...(path === "/" ? [{
        "@type": "SoftwareApplication",
        "@id": absolute("#app"),
        name: product.name,
        url: site.url,
        description: product.summary,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: ["macOS", "Windows"],
        softwareVersion: version,
        releaseNotes: "Preview release; public signing and broader hardware validation are in progress.",
        featureList: product.features,
        image: absolute("porty.svg"),
        screenshot: site.url ? ["mac-ports", "mac-hero", "details"].map((name) => absolute(`screenshots/${name}.png`)) : undefined,
      }] : page.guide ? [{
        "@type": "Article",
        "@id": absolute(`${path}#article`),
        headline: page.guide.title,
        description: page.description,
        mainEntityOfPage: absolute(`${path}#webpage`),
        image: absolute(page.guide.sections.find((section) => section.figure)?.figure?.src ?? "/screenshots/ports.png"),
        author: { "@type": "Person", name: "Walter Lim", url: "https://walt.online" },
        publisher: { "@type": "Organization", name: "Porty", url: site.url },
        inLanguage: "en",
      }, {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Porty", item: absolute("/") },
          { "@type": "ListItem", position: 2, name: "Guides", item: absolute("/guides/") },
          { "@type": "ListItem", position: 3, name: page.guide.title, item: absolute(path) },
        ],
      }] : [{
        "@type": "ItemList",
        "@id": absolute(`${path}#guides`),
        itemListElement: guides.map((guide, index) => ({
          "@type": "ListItem", position: index + 1, name: guide.title, url: absolute(guidePath(guide)),
        })),
      }]),
    ],
  };
}

export function renderMetadata(site: SiteSettings, version: string, path = "/"): string {
  const page = pageDetails(path);
  const canonical = site.url ? new URL(path, site.url).href : undefined;
  const image = site.url ? new URL("screenshots/mac-ports.png", site.url).href : undefined;
  const meta = (key: string, value: string, property = false) =>
    `<meta ${property ? "property" : "name"}="${key}" content="${escapeHtml(value)}" />`;
  return [
    `<title>${escapeHtml(page.title)}</title>`,
    meta("description", page.description),
    meta("robots", site.indexable ? "index, follow, max-image-preview:large" : "noindex, follow"),
    meta("og:type", page.guide ? "article" : "website", true),
    meta("og:site_name", product.name, true),
    meta("og:title", page.title, true),
    meta("og:description", page.description, true),
    meta("og:locale", "en_US", true),
    meta("twitter:card", image ? "summary_large_image" : "summary"),
    meta("twitter:title", page.title),
    meta("twitter:description", page.description),
    ...(canonical ? [
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      meta("og:url", canonical, true),
    ] : []),
    ...(image ? [
      meta("og:image", image, true),
      meta("og:image:type", "image/png", true),
      meta("og:image:width", "1180", true),
      meta("og:image:height", "820", true),
      meta("og:image:alt", "Porty's Mac Port Explorer showing USB-C, HDMI, SD card, audio, and MagSafe connections.", true),
      meta("twitter:image", image),
      meta("twitter:image:alt", "Porty's Mac Port Explorer showing USB-C, HDMI, SD card, audio, and MagSafe connections."),
    ] : []),
    `<link rel="alternate" type="text/markdown" href="/llms.txt" title="Porty product information" />`,
    ...(path === "/" ? [`<link rel="preload" as="image" type="image/avif" imagesrcset="${escapeHtml(heroSrcSet("avif"))}" imagesizes="${escapeHtml(heroSizes)}" fetchpriority="high" />`] : []),
    `<script type="application/ld+json">${JSON.stringify(structuredData(site, version, path)).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
}

export function crawlFiles(site: SiteSettings, version: string, releases: Release[]): Record<string, string> {
  const location = (hash: string) => site.url ? new URL(hash, site.url).href : `/${hash}`;
  const files: Record<string, string> = {
    // Allow crawling of preview HTML so crawlers can read its noindex directive.
    "robots.txt": `User-agent: *\nAllow: /\n${site.indexable ? `\nSitemap: ${new URL("sitemap.xml", site.url).href}\n` : ""}`,
    "llms.txt": [
      "# Porty",
      "",
      `> ${product.summary}`,
      "",
      `Version ${version}. Preview release. Public signing and broader hardware validation are in progress.`,
      "",
      "## Website",
      `- [Porty](${location("")}): Hardware connection explorer for Mac and Windows.`,
      `- [Features](${location("#features")}): Connection map and device details.`,
      `- [Questions](${location("#questions")}): Compatibility, hardware limits, and privacy.`,
      `- [Downloads](${location("#download")}): macOS Apple Silicon, macOS Intel, and Windows 64-bit builds.`,
      "",
      "## Hardware guides",
      ...guides.map((guide) => `- [${guide.title}](${location(guidePath(guide))}): ${guide.description}`),
      "",
      "## Product information",
      ...questions.flatMap(([question, answer]) => ["", `### ${question}`, answer]),
      "",
      "## Builds",
      ...releases.map((release) => release.url
        ? `- [${release.name} (${release.detail})](${release.url})`
        : `- ${release.name} (${release.detail}): download link not yet available.`),
      "",
    ].join("\n"),
  };
  if (site.indexable) {
    const urls = ["/", "/guides/", ...guides.map(guidePath)];
    files["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((path) => `<url><loc>${escapeHtml(new URL(path, site.url).href)}</loc></url>`).join("")}</urlset>\n`;
  }
  return files;
}
