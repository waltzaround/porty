import { ArrowUpRight } from "lucide-react";
import { SiteHeader } from "./SiteHeader";
import { GuideFooter } from "./Guides";
import { changelog, releaseNotesUrl } from "@/lib/changelog";

export function Changelog() {
  return (
    <>
      <SiteHeader currentPage="changelog" />
      <main id="main" className="container changelog-main">
        <header className="changelog-title">
          <h1>Changelog</h1>
          <p>Updates, improvements, and fixes to Porty.</p>
        </header>
        <div className="changelog-entries">
          {changelog.map((release, index) => (
            <article className="changelog-entry" id={`v${release.version}`} key={release.version} aria-labelledby={`release-${release.version}`}>
              <div className="changelog-meta">
                <a className="changelog-version" href={`#v${release.version}`}>v{release.version}</a>
                <time dateTime={release.publishedAt}>{new Intl.DateTimeFormat("en-NZ", {
                  day: "numeric", month: "long", year: "numeric", timeZone: "Pacific/Auckland",
                }).format(new Date(release.publishedAt))}</time>
                <span className="changelog-status">{index === 0 ? "Latest preview" : "Preview"}</span>
              </div>
              <div className="changelog-content">
                <h2 id={`release-${release.version}`}>{release.title}</h2>
                <ul>{release.changes.map((change) => <li key={change}>{change}</li>)}</ul>
                <a className="changelog-release-link" href={releaseNotesUrl(release.version)}>
                  Release notes & downloads <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </main>
      <GuideFooter />
    </>
  );
}
