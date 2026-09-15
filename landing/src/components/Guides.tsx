import { ArrowRight, ArrowUpRight } from "lucide-react";
import { guidePath, guides, type Guide } from "@/lib/guides";

export function GuideCards({ exclude }: { exclude?: string }) {
  return (
    <div className="guide-cards">
      {guides.filter((guide) => guide.slug !== exclude).map((guide) => (
        <a className="guide-card" href={guidePath(guide)} key={guide.slug}>
          <span className="eyebrow">{guide.platform}</span>
          <h3>{guide.title}</h3>
          <p>{guide.description}</p>
          <span className="guide-card-link">Read guide <ArrowRight size={16} aria-hidden="true" /></span>
        </a>
      ))}
    </div>
  );
}

function GuideHeader() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="/" aria-label="Porty home">
            <img src="/porty.svg" alt="" width="34" height="34" />
            <span>porty<span className="brand-period">.</span></span>
          </a>
          <nav className="guide-nav" aria-label="Main navigation">
            <a href="/guides/">Guides</a>
            <a href="/#download" className="guide-download">Get Porty <ArrowUpRight size={15} aria-hidden="true" /></a>
          </nav>
        </div>
      </header>
    </>
  );
}

function GuideFooter() {
  return (
    <footer className="container guide-footer">
      <a href="/">Porty for macOS & Windows</a>
      <a href="https://github.com/waltzaround/porty">GitHub</a>
      <a href="https://walt.online" rel="author">Made by Walter Lim</a>
      <a href="/#privacy">Privacy</a>
    </footer>
  );
}

export function GuideIndex() {
  return (
    <>
      <GuideHeader />
      <main className="container guide-index" id="main">
        <p className="eyebrow">Practical hardware guides</p>
        <h1>Make sense of your USB connections.</h1>
        <p className="guide-intro">Find a device, follow its hub, and understand the speed your computer reports. Start with these step-by-step guides for Mac and Windows.</p>
        <GuideCards />
        <p className="guide-index-note">Written for Porty’s preview release. Hardware readings vary by computer, cable, and device; each guide explains what a reading can and cannot tell you.</p>
      </main>
      <GuideFooter />
    </>
  );
}

export function GuidePage({ guide }: { guide: Guide }) {
  return (
    <>
      <GuideHeader />
      <main id="main" className="container guide-main">
        <nav className="guide-breadcrumbs" aria-label="Breadcrumb">
          <a href="/">Porty</a><span aria-hidden="true">/</span><a href="/guides/">Guides</a>
        </nav>
        <article className="guide-article">
          <header className="guide-title">
            <p className="eyebrow">{guide.platform} · Troubleshooting</p>
            <h1>{guide.title}</h1>
            <p className="guide-intro">{guide.summary}</p>
            <p className="guide-byline">By <a href="https://walt.online" rel="author">Walter Lim</a> · Porty</p>
          </header>
          <nav className="guide-toc" aria-label="On this page">
            <strong>On this page</strong>
            <ol>{guide.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>)}</ol>
          </nav>
          {guide.sections.map((section) => (
            <section className="guide-section" id={section.id} key={section.id}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.steps && <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
              {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
              {section.figure && (
                <figure>
                  <a href={section.figure.src} aria-label={`Open full screenshot: ${section.figure.alt}`}>
                    <img src={section.figure.src} alt={section.figure.alt} width={section.figure.width} height={section.figure.height} loading="lazy" />
                  </a>
                  <figcaption>{section.figure.caption}</figcaption>
                </figure>
              )}
            </section>
          ))}
          <section className="guide-sources" aria-labelledby="guide-sources-title">
            <h2 id="guide-sources-title">Sources & further reading</h2>
            <ul>{guide.sources.map((source) => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul>
          </section>
          <aside className="guide-cta" aria-label="Try Porty">
            <h2>See your own connection map.</h2>
            <p>Porty reads hardware information locally on macOS and Windows. Explore device links and hub branches without changing your drivers.</p>
            <a href="/#download">Get Porty <ArrowRight size={16} aria-hidden="true" /></a>
          </aside>
        </article>
        <section className="related-guides" aria-labelledby="related-title">
          <h2 id="related-title">Keep exploring</h2>
          <GuideCards exclude={guide.slug} />
        </section>
      </main>
      <GuideFooter />
    </>
  );
}
