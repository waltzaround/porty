# Porty landing page

## Production deployment

The site is hosted with Cloudflare Workers static assets at **https://porty.walt.online**, using `wrangler.jsonc`. After `npm ci`, run `npx wrangler login` if needed, then `npm run deploy`. This builds the indexable static site and uploads only `dist/` using Wrangler. The domain is configured as a Worker custom domain.

Public build settings and version-specific GitHub download URLs live in `.env.production`; it contains no secrets. Publish and verify the corresponding GitHub release assets before deploying new download URLs. Windows and macOS previews are labelled unsigned. Mac downloads offer separate Apple Silicon and Intel builds and require macOS 12 or later.

A standalone Vite + React + TypeScript site with Tailwind CSS 4 and shadcn/ui (Radix) components. It has its own dependency lockfile and does not ship inside the desktop app.

## Develop and build

From this directory, using Node.js 22.12+:

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Development runs at http://127.0.0.1:5180. The static output is `dist/`; preview uses port 4180. The build renders the React page into HTML, then hydrates it in the browser. No Node server is needed for hosting. The build-only renderer in `.prerender/` is excluded from `dist/`. No source maps are emitted. Fonts are self-hosted; the page does not request hardware access. Production website analytics are described below.

## SEO and AI search

Set the real public HTTPS origin in `SITE_URL` in `.env.local` or the build environment. The site currently expects to be hosted at the domain root. Then run:

```sh
npm run build:public
npm test
```

`build:public` fails if the domain is missing or indexing is disabled. Ordinary `npm run build` supports local previews: without a domain it adds `noindex`, omits canonical URLs, and does not generate a sitemap. Set `SITE_INDEXABLE=false` for hosted previews even when the domain is configured. Preview robots.txt permits crawling so search engines can read the HTML's `noindex` directive; this is not access control.

The build generates:

- Full page HTML, including all FAQ answers and download options. The FAQ and download section work without JavaScript.
- A descriptive title and summary, canonical URL, Open Graph and Twitter metadata for the homepage, guide index, and each guide.
- `WebSite`, `WebPage`, and `SoftwareApplication` JSON-LD with supported platforms, features, version, and screenshots. There are no invented offers, ratings, or reviews.
- `robots.txt` and a production-only `sitemap.xml` containing five canonical pages: the homepage, `/guides/`, and three troubleshooting guides. Section anchors are not separate pages.
- Static guide articles, sources, screenshots, related links, and per-page `Article` and breadcrumb structured data. Guides remain readable and navigable without JavaScript.
- A real `404.html`; Cloudflare uses `404-page` handling for unknown URLs.
- `/llms.txt`, a readable product summary generated from the same facts and FAQ used on the page. This is an optional convenience for tools that read it, not a ranking mechanism. Google explicitly says it does not use this file for Search or its generative AI features.

Product facts live in `src/lib/product.ts`; release version and links live in `src/lib/releases.ts`. Keep these and the preview status current when releasing. The HTML and text summary are the same for people and crawlers; there is no user-agent-specific content.

### Maintaining the guides and images

Guide content lives in `src/lib/guides.ts`. The static build and browser entry use the same route list and content. Adding an article there adds it to the guide index, homepage cards, related guides, sitemap, and product summary. Use original explanations, primary sources, and clearly labelled actual hardware captures. Check each new guide in the production preview, including direct navigation without JavaScript.

The shared header in `src/components/SiteHeader.tsx` links to Changelog, GitHub, and the homepage FAQ. Published release summaries live in `src/lib/changelog.ts`, newest first, and render at `/changelog/` as static HTML with its own metadata and sitemap entry. Add a summary, the GitHub publication timestamp, and the version when publishing a release; display dates use New Zealand time. The full notes and downloads link to the corresponding GitHub release.

Before building, `scripts/optimize-images.mjs` generates AVIF and WebP variants at 640, 960, and the original image width (1180 pixels for the Mac Port Explorer, 1440 for the connection map). `HeroImage` uses a responsive picture with WebP fallback, and the first Port Explorer image is preloaded as AVIF. The original PNG remains available for social metadata. If you change compression settings, regenerate the variants; changed source images are detected by modification time. The browser test checks that mobile loads only one modern hero variant and does not fetch the original PNG.

Search Console is the source of truth for indexing and query impressions. A successfully submitted sitemap is a discovery signal, not confirmation that each URL has been indexed. Analytics already records `download_click` for actual installer-link clicks; this measures download intent rather than completed installs. Compare Search Console query/page data and organic download clicks as traffic accumulates.

### When the domain is live

1. Deploy only `dist/`. Redirect HTTP and alternate hostnames to the canonical HTTPS origin with permanent redirects. Return a real 404 for unknown paths instead of rewriting every URL to the homepage.
2. Enable Brotli/gzip at the host. Cache hashed `/assets/` files for a year with `immutable`; revalidate HTML, `robots.txt`, `sitemap.xml`, and `llms.txt`. Give screenshot files a short cache lifetime or revalidation because captures keep their filenames.
3. Check the public page returns HTTP 200, has the correct canonical and `index, follow`, and serves its sitemap. Hosted previews should retain `noindex`.
4. Verify the domain in Google Search Console and Bing Webmaster Tools; submit `/sitemap.xml`. Use URL Inspection to check the rendered page and request indexing. Check the Search Console controls for inclusion in Google's generative AI features.
5. Verify the host/CDN does not challenge or block search crawlers, including OAI-SearchBot. The generated wildcard `Allow: /` permits crawling; training crawler preferences are separate from search discovery.
6. Check the live URL in PageSpeed Insights and inspect social link previews. Review Search Console queries and indexing after launch; neither indexing nor AI citations are guaranteed.

References: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [llms.txt proposal](https://llmstxt.org/).

The GitHub landing workflow reads the committed public `.env.production` settings. Pull-request builds always disable indexing. The workflow builds and tests the site and produces an artifact; deploy the site using Wrangler as described above.

## Download links

Production links point to the versioned Windows setup executable and the Apple Silicon (`mac-arm64.dmg`) and Intel (`mac-x64.dmg`) installers on the same GitHub release. The macOS preview workflow adds both Mac architectures to a published Windows preview; see [RELEASING.md](../RELEASING.md). After the release finishes, update `VITE_RELEASE_VERSION` and all three `VITE_DOWNLOAD_*` URLs in `.env.production`, build and test, then deploy. Keep `VITE_WINDOWS_UNSIGNED` and `VITE_MAC_UNSIGNED` true for previews without publisher signing; update those flags and the preview copy when signed releases become available.

For local overrides, copy `.env.example` to `.env.local`. Vite values are public, so never put credentials here. Missing or non-HTTPS URLs show “Coming soon” rather than a broken download.

## Design and interaction

The page uses Porty’s existing mark, warm ivory surfaces, violet accents, and DM Sans. Its product gallery leads with a real MacBook Pro Port Explorer capture in light appearance (`mac-ports.png`). The next tabs show an image-generated dark treatment of a live MacBook Pro connection map (`mac-hero.png`) and a real Windows detail drawer. Each tab labels its platform and appearance and has a keyboard-accessible lightbox. The feature cards also use actual app captures, not illustrative UI.

To refresh the images on the Windows development machine, run `npm run build` followed by `npm run capture:product` from the repository root. This launches a separate Electron instance, selects dark appearance, scans real hardware, and uses normal UI controls to focus a hub branch and open its drawer. Full screenshots and element captures are copied to `landing/public/screenshots`; private capture metadata stays in `.artifacts/product-captures`. The current script selects the local USB2.0 Hub branch. Adapt that selection for another machine. No hardware values or text are rewritten for the screenshots.

Buttons, tabs, accordion and dialog source in `src/components/ui/` comes from the official shadcn/ui `new-york` registry and is locally owned. The FAQ uses native HTML details so its answers work before JavaScript loads. `components.json` supports adding more components. shadcn/ui is MIT licensed; its notice is included in `THIRD_PARTY_NOTICES.md`.

## Browser checks

```sh
npx playwright install chromium
npm test
```

The tests start the production preview and cover raw HTML, no-JavaScript access, hydration, metadata and crawl-file consistency, preview/public URL validation, desktop and mobile interaction, keyboard dismissal, focus restoration, accessibility, and overflow. They also check that build-only code and source maps are absent from `dist/`. To use an already installed Chromium browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Build before running tests.

## Website analytics

Google Analytics uses measurement ID `G-68EK891W8D` and loads only on `porty.walt.online`. Local previews and the desktop app do not load it. The privacy dialog discloses website analytics.

Actual download links send one `download_click` event with `download_platform` (`windows`, `mac-arm`, or `mac-intel`), `release_version`, `download_location` (`page` or `dialog`), `file_name`, `file_extension`, and `link_url`. Opening the download chooser and unavailable builds do not count. Links continue working when analytics is unavailable; events queued before the Google script loads are processed when it becomes available.

Use `download_click` for download intent; it does not establish that a file finished downloading or was installed. This custom name avoids duplicating GA's automatic `file_download` event. Register the platform, version, and location parameters as event-scoped custom dimensions in GA if you want to use them in reports. You can mark `download_click` as a key event in GA.
