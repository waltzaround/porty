import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import { releases, releaseVersion } from "./lib/releases";
import { crawlFiles, renderMetadata, siteSettings } from "./lib/seo";

export function generateSite(environment: Record<string, string | undefined>) {
  const site = siteSettings(environment);
  return {
    indexable: site.indexable,
    html: renderToString(<StrictMode><App /></StrictMode>),
    head: renderMetadata(site, releaseVersion),
    files: crawlFiles(site, releaseVersion, releases),
  };
}
