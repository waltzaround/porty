import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import Site from "./Site";
import { guidePath, guides } from "./lib/guides";
import { releases, releaseVersion } from "./lib/releases";
import { crawlFiles, renderMetadata, siteSettings } from "./lib/seo";

export function generateSite(environment: Record<string, string | undefined>) {
  const site = siteSettings(environment);
  return {
    indexable: site.indexable,
    pages: ["/", "/guides/", ...guides.map(guidePath)].map((path) => ({
      path,
      html: renderToString(<StrictMode><Site path={path} /></StrictMode>),
      head: renderMetadata(site, releaseVersion, path),
    })),
    files: crawlFiles(site, releaseVersion, releases),
  };
}
