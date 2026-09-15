# Porty landing page

## Production deployment

The site is hosted with Cloudflare Workers static assets at **https://porty.walt.online**, using `wrangler.jsonc`. After `npm ci`, run `npx wrangler login` if needed, then `npm run deploy`. This builds the indexable static site and uploads only `dist/` using Wrangler. The domain is configured as a Worker custom domain.

Public build settings and version-specific GitHub download URLs live in `.env.production`; it contains no secrets. Publish the corresponding GitHub release before deploying a new download URL. Windows previews are labelled unsigned; macOS downloads stay unavailable until their URLs are configured.

A standalone Vite + React + TypeScript site with Tailwind CSS 4 and shadcn/ui (Radix) components. It has its own dependency lockfile and does not ship inside the desktop app.

## Develop and build

From this directory, using Node.js 22.12+:

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Development runs at http://127.0.0.1:5180. The static output is `dist/`; preview uses port 4180. The build renders the React page into HTML, then hydrates it in the browser. No Node server is needed for hosting. The build-only renderer in `.prerender/` is excluded from `dist/`. No source maps are emitted. Fonts are self-hosted; the page uses no analytics, third-party font requests, or hardware access.

## SEO and AI search

Set the real public HTTPS origin in `SITE_URL` in `.env.local` or the build environment. The site currently expects to be hosted at the domain root. Then run:

```sh
npm run build:public
npm test
```

`build:public` fails if the domain is missing or indexing is disabled. Ordinary `npm run build` supports local previews: without a domain it adds `noindex`, omits canonical URLs, and does not generate a sitemap. Set `SITE_INDEXABLE=false` for hosted previews even when the domain is configured. Preview robots.txt permits crawling so search engines can read the HTML's `noindex` directive; this is not access control.

The build generates:

- Full page HTML, including all FAQ answers and download options. The FAQ and download section work without JavaScript.
- A descriptive title and summary, canonical URL, Open Graph and Twitter metadata using an actual app screenshot.
- `WebSite`, `WebPage`, and `SoftwareApplication` JSON-LD with supported platforms, features, version, and screenshots. There are no invented offers, ratings, or reviews.
- `robots.txt` and a production-only `sitemap.xml` containing the canonical homepage. Section anchors are not separate pages.
- `/llms.txt`, a readable product summary generated from the same facts and FAQ used on the page. This is an optional convenience for tools that read it, not a ranking mechanism. Google explicitly says it does not use this file for Search or its generative AI features.

Product facts live in `src/lib/product.ts`; release version and links live in `src/lib/releases.ts`. Keep these and the preview status current when releasing. The HTML and text summary are the same for people and crawlers; there is no user-agent-specific content.

### When the domain is live

1. Deploy only `dist/`. Redirect HTTP and alternate hostnames to the canonical HTTPS origin with permanent redirects. Return a real 404 for unknown paths instead of rewriting every URL to the homepage.
2. Enable Brotli/gzip at the host. Cache hashed `/assets/` files for a year with `immutable`; revalidate HTML, `robots.txt`, `sitemap.xml`, and `llms.txt`. Give screenshot files a short cache lifetime or revalidation because captures keep their filenames.
3. Check the public page returns HTTP 200, has the correct canonical and `index, follow`, and serves its sitemap. Hosted previews should retain `noindex`.
4. Verify the domain in Google Search Console and Bing Webmaster Tools; submit `/sitemap.xml`. Use URL Inspection to check the rendered page and request indexing. Check the Search Console controls for inclusion in Google's generative AI features.
5. Verify the host/CDN does not challenge or block search crawlers, including OAI-SearchBot. The generated wildcard `Allow: /` permits crawling; training crawler preferences are separate from search discovery.
6. Check the live URL in PageSpeed Insights and inspect social link previews. Review Search Console queries and indexing after launch; neither indexing nor AI citations are guaranteed.

References: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google AI search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide), [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [llms.txt proposal](https://llmstxt.org/).

The GitHub landing workflow accepts repository variables `PORTY_SITE_URL`, `PORTY_SITE_INDEXABLE`, `PORTY_DOWNLOAD_WINDOWS`, `PORTY_DOWNLOAD_MAC_ARM64`, `PORTY_DOWNLOAD_MAC_X64`, and `PORTY_RELEASE_VERSION`. Pull-request builds always disable indexing. The workflow produces an artifact; it does not publish the site.

## Download links

Copy `.env.example` to `.env.local`, add the three public HTTPS artifact URLs, and rebuild. Vite values are public, so never put credentials here. Missing or non-HTTPS URLs show “Coming soon” rather than a broken download. The user is supplying release URLs separately. Update preview-release copy when signed public releases become available.

## Design and interaction

The page uses Porty’s existing mark, warm ivory surfaces, violet accents, and DM Sans. Its product gallery shows real screenshots of the built Windows app running against live hardware, presented in CSS frames with a keyboard-accessible lightbox. It offers connection-map, port-explorer, and detail-drawer views. The feature cards also use actual app captures, not illustrative UI.

To refresh the images on the Windows development machine, run `npm run build` followed by `npm run capture:product` from the repository root. This launches a separate Electron instance, selects dark appearance, scans real hardware, and uses normal UI controls to focus a hub branch and open its drawer. Full screenshots and element captures are copied to `landing/public/screenshots`; private capture metadata stays in `.artifacts/product-captures`. The current script selects the local USB2.0 Hub branch. Adapt that selection for another machine. No hardware values or text are rewritten for the screenshots.

Buttons, tabs, accordion and dialog source in `src/components/ui/` comes from the official shadcn/ui `new-york` registry and is locally owned. The FAQ uses native HTML details so its answers work before JavaScript loads. `components.json` supports adding more components. shadcn/ui is MIT licensed; its notice is included in `THIRD_PARTY_NOTICES.md`.

## Browser checks

```sh
npx playwright install chromium
npm test
```

The tests start the production preview and cover raw HTML, no-JavaScript access, hydration, metadata and crawl-file consistency, preview/public URL validation, desktop and mobile interaction, keyboard dismissal, focus restoration, accessibility, and overflow. They also check that build-only code and source maps are absent from `dist/`. To use an already installed Chromium browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Build before running tests.
