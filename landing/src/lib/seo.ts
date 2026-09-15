import { product, questions } from "./product";

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

export function structuredData(site: SiteSettings, version: string) {
  const absolute = (path: string) => site.url ? new URL(path, site.url).href : undefined;
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
        "@id": absolute("#webpage"),
        url: site.url,
        name: product.title,
        description: product.description,
        inLanguage: "en",
        isPartOf: site.url ? { "@id": absolute("#website") } : undefined,
        mainEntity: site.url ? { "@id": absolute("#app") } : undefined,
      },
      {
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
        screenshot: site.url ? ["branch", "ports", "details"].map((name) => absolute(`screenshots/${name}.png`)) : undefined,
      },
    ],
  };
}

export function renderMetadata(site: SiteSettings, version: string): string {
  const image = site.url ? new URL("screenshots/branch.png", site.url).href : undefined;
  const meta = (key: string, value: string, property = false) =>
    `<meta ${property ? "property" : "name"}="${key}" content="${escapeHtml(value)}" />`;
  return [
    `<title>${escapeHtml(product.title)}</title>`,
    meta("description", product.description),
    meta("robots", site.indexable ? "index, follow, max-image-preview:large" : "noindex, follow"),
    meta("og:type", "website", true),
    meta("og:site_name", product.name, true),
    meta("og:title", product.title, true),
    meta("og:description", product.description, true),
    meta("og:locale", "en_US", true),
    meta("twitter:card", image ? "summary_large_image" : "summary"),
    meta("twitter:title", product.title),
    meta("twitter:description", product.description),
    ...(site.url ? [
      `<link rel="canonical" href="${escapeHtml(site.url)}" />`,
      meta("og:url", site.url, true),
    ] : []),
    ...(image ? [
      meta("og:image", image, true),
      meta("og:image:type", "image/png", true),
      meta("og:image:width", "1440", true),
      meta("og:image:height", "900", true),
      meta("og:image:alt", "Porty’s Windows app showing USB devices connected through a hub.", true),
      meta("twitter:image", image),
      meta("twitter:image:alt", "Porty’s Windows app showing USB devices connected through a hub."),
    ] : []),
    `<link rel="alternate" type="text/markdown" href="/llms.txt" title="Porty product information" />`,
    `<script type="application/ld+json">${JSON.stringify(structuredData(site, version)).replace(/</g, "\\u003c")}</script>`,
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
      `- [Porty](${location("")}): Product overview and actual Windows app screenshots.`,
      `- [Features](${location("#features")}): Connection map and device details.`,
      `- [Questions](${location("#questions")}): Compatibility, hardware limits, and privacy.`,
      `- [Downloads](${location("#download")}): macOS Apple Silicon, macOS Intel, and Windows 64-bit builds.`,
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
    files["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(site.url!)}</loc></url></urlset>\n`;
  }
  return files;
}
