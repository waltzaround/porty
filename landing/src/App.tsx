import { useRef, useState, type MouseEvent } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  Fingerprint,
  LockKeyhole,
  Menu,
  Monitor,
  Network,
  ShieldCheck,
  Usb,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProductScreenshots } from "@/components/ProductScreenshots";
import { releases, releaseVersion } from "@/lib/releases";
import { product, questions } from "@/lib/product";

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <a
      className={`brand${inverse ? " inverse" : ""}`}
      href="#top"
      aria-label="Porty home"
    >
      <img src="/porty.svg" alt="" width="34" height="34" />
      <span>
        porty<span className="brand-period">.</span>
      </span>
    </a>
  );
}

function AppleMark() {
  return (
    <svg
      width="19"
      height="21"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.2 12.4c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.7-1.8-3.3-1.9-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.9.9-3.6 2.2-1.5 2.7-.4 6.7 1.1 8.8.7 1 1.5 2.1 2.6 2 1 0 1.4-.7 2.8-.7 1.3 0 1.7.7 2.9.7s1.9-1 2.6-2c.8-1.2 1.2-2.4 1.2-2.5-.1 0-2-.8-2-3.1ZM15 5.6c.6-.8 1.1-1.8 1-2.9-.9 0-2 .6-2.7 1.3-.6.7-1.2 1.8-1 2.8 1 .1 2.1-.5 2.7-1.2Z" />
    </svg>
  );
}

function WindowsMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1 1h8v8H1zm10 0h8v8h-8zM1 11h8v8H1zm10 0h8v8h-8z" />
    </svg>
  );
}

function ReleaseOptions() {
  return (
    <div className="release-list">
      {releases.map((release) => (
        <div className="release-option" key={release.id}>
          <span className="release-os">
            {release.id === "windows" ? <WindowsMark /> : <AppleMark />}
          </span>
          <div>
            <strong>{release.name}</strong>
            <span>{release.detail}</span>
          </div>
          {release.url ? (
            <Button asChild className="release-link">
              <a href={release.url}>
                Download <ArrowDownToLine />
              </a>
            </Button>
          ) : (
            <span className="release-pending">Coming soon</span>
          )}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [info, setInfo] = useState<"privacy" | "release" | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const rememberFocus = () => {
    dialogTrigger.current = document.activeElement as HTMLElement;
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    dialogTrigger.current?.focus();
  };
  const openDownload = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    rememberFocus();
    setMobileOpen(false);
    setDownloadOpen(true);
  };
  const openInfo = (value: "privacy" | "release") => {
    rememberFocus();
    setInfo(value);
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header" id="top">
        <div className="container header-inner">
          <Logo />
          <nav aria-label="Main navigation" className="desktop-nav">
            <a href="#features">Features</a>
            <a href="#in-action">Screenshots</a>
            <a href="#questions">FAQ</a>
          </nav>
          <div className="header-actions">
            <Button asChild className="nav-download">
              <a href="#download" onClick={openDownload}>Get Porty <ArrowDownToLine /></a>
            </Button>
            <button
              className="mobile-toggle"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav
            id="mobile-nav"
            className="mobile-nav"
            aria-label="Mobile navigation"
          >
            {[
              ["Features", "#features"],
              ["Screenshots", "#in-action"],
              ["FAQ", "#questions"],
            ].map(([name, href]) => (
              <a key={href} href={href} onClick={() => setMobileOpen(false)}>
                {name}
                <ArrowUpRight size={18} />
              </a>
            ))}
          </nav>
        )}
      </header>
      <main id="main">
        <section className="hero container">
          <div className="hero-heading">
            <h1>
              Know your
              <br />
              <span>connections.</span>
              <span className="headline-port" aria-hidden="true">
                <span />
              </span>
            </h1>
          </div>
          <div className="hero-aside">
            <p>{product.summary}</p>
            <div className="hero-actions">
              <Button asChild className="primary-cta">
                <a href="#download" onClick={openDownload}>Get Porty <ArrowDownToLine size={17} /></a>
              </Button>
              <a href="#in-action" className="text-link">
                View screenshots <ArrowDown size={16} />
              </a>
            </div>
            <div className="platform-note">
              <AppleMark />
              <WindowsMark />
              <span>macOS & Windows</span>
            </div>
          </div>
        </section>
        <ProductScreenshots />
        <section
          className="connector-strip container"
          aria-label="Connection types"
        >
          <div>
            <Usb />
            USB-C
          </div>
          <div>
            <Zap />
            Thunderbolt
          </div>
          <div>
            <Monitor />
            HDMI & DisplayPort
          </div>
          <div>
            <Network />
            Hubs & docks
          </div>
        </section>
        <section className="features-section container" id="features">
          <div className="section-heading">
            <div>
              <h2>Ports, devices, and connections.</h2>
            </div>
            <p>
              Follow USB connections through hubs and inspect the readings your
              system reports.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature-card real-map-feature">
              <div className="feature-copy">
                <h3>Connection map</h3>
                <p>
                  View connected devices, zoom, and focus on individual hub
                  branches.
                </p>
              </div>
              <div className="feature-real-map">
                <img
                  src="/screenshots/branch-map.png"
                  width="1182"
                  height="652"
                  alt="A real USB2.0 Hub branch in Porty, connecting the A50 X and C922 webcam through downstream hubs."
                  loading="lazy"
                />
              </div>
            </article>
            <article className="feature-card real-details-feature">
              <div className="feature-copy">
                <h3>Device details</h3>
                <p>
                  Inspect a device’s current link and reported downstream ports.
                </p>
              </div>
              <div className="feature-real-details">
                <img
                  src="/screenshots/hub-current.png"
                  width="380"
                  height="94"
                  alt="Actual Porty readings: connected through USB 1, current link 480 Mb/s."
                  loading="lazy"
                />
                <img
                  src="/screenshots/hub-paths.png"
                  width="380"
                  height="232"
                  alt="The four actual reported hub paths, including the Generic USB Hub and A50 X."
                  loading="lazy"
                />
              </div>
            </article>
          </div>
        </section>
        <section className="privacy-section">
          <div className="container privacy-inner">
            <div className="privacy-emblem" aria-hidden="true">
              <Fingerprint size={61} strokeWidth={1} />
              <span>
                <LockKeyhole size={15} />
              </span>
            </div>
            <div className="privacy-copy">
              <h2>Runs locally.</h2>
              <p>Hardware scans stay on your computer.</p>
            </div>
            <div className="privacy-points">
              <span>
                <ShieldCheck />
                Local hardware scans
              </span>
              <span>
                <Check />
                No account required
              </span>
              <span>
                <Check />
                No remote telemetry
              </span>
              <button onClick={() => openInfo("privacy")}>
                Privacy details <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        </section>
        <section className="faq-section container" id="questions">
          <div>
            <h2>Frequently asked questions</h2>
          </div>
          <div className="faq-list">
            {questions.map(([question, answer], index) => (
              <details name="porty-faq" key={question}>
                <summary id={`question-${index}`}>{question}<ChevronDown aria-hidden="true" /></summary>
                <div role="region" aria-labelledby={`question-${index}`}><div>{answer}</div></div>
              </details>
            ))}
          </div>
        </section>
        <section className="download-section container" id="download">
          <div className="download-card">
            <div
              className="download-decoration decoration-left"
              aria-hidden="true"
            >
              <span />
              <i />
            </div>
            <div className="download-content">
              <img src="/porty.svg" alt="" width="52" height="52" />
              <h2>Get Porty</h2>
              <details className="download-options">
                <summary className="primary-cta download-summary">Get Porty <ArrowDownToLine size={17} /></summary>
                <ReleaseOptions />
              </details>
              <div className="download-platforms">
                <AppleMark />
                <span>macOS</span>
                <span className="platform-divider" />
                <WindowsMark />
                <span>Windows</span>
              </div>
            </div>
            <div
              className="download-decoration decoration-right"
              aria-hidden="true"
            >
              <span />
              <i />
            </div>
          </div>
        </section>
      </main>
      <footer className="container site-footer">
        <div className="footer-top">
          <div>
            <Logo />
          </div>
          <nav aria-label="Footer navigation">
            <a href="#features">The app</a>
            <button onClick={() => openInfo("release")}>Release notes</button>
            <button onClick={() => openInfo("privacy")}>Privacy</button>
            <a href="#top">
              Back to top <ArrowUpRight size={14} />
            </a>
          </nav>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Porty</span>
          <a className="footer-credit" href="https://walt.online" rel="author">
            Made by Walter Lim
          </a>
          <button onClick={() => openInfo("release")}>
            <span />v{releaseVersion} · In preview
          </button>
        </div>
      </footer>
      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent
          className="download-dialog"
          onCloseAutoFocus={restoreFocus}
        >
          <DialogHeader>
            <img src="/porty.svg" width="42" height="42" alt="" />
            <DialogTitle>Get Porty</DialogTitle>
            <DialogDescription>
              Choose the Porty build for your computer.
            </DialogDescription>
          </DialogHeader>
          <ReleaseOptions />
          <div className="release-note">
            <p>
              Preview release. Download links will appear as builds become
              available.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={info !== null}
        onOpenChange={(open) => !open && setInfo(null)}
      >
        <DialogContent className="info-dialog" onCloseAutoFocus={restoreFocus}>
          <DialogHeader>
            <DialogTitle>
              {info === "privacy"
                ? "Privacy"
                : `What’s new in Porty ${releaseVersion}`}
            </DialogTitle>
            <DialogDescription>
              {info === "privacy"
                ? "How Porty handles your data."
                : "The latest desktop preview."}
            </DialogDescription>
          </DialogHeader>
          {info === "privacy" ? (
            <div className="info-copy">
              <p>
                Porty reads hardware information locally. There are no accounts,
                remote telemetry, or uploaded crash reports. Raw hardware
                serials and machine identifiers are excluded from scan reports.
              </p>
              <p>
                This landing page shows screenshots captured in the actual
                Windows app. It cannot inspect your computer’s ports and does
                not ask for hardware access. Fonts and page assets are served
                with the site; there are no analytics scripts.
              </p>
              <p>
                If you choose a download, your browser will contact the release
                host to retrieve it.
              </p>
            </div>
          ) : (
            <div className="info-copy">
              <ul>
                <li>
                  Improved USB hub and downstream-device detection on Windows.
                </li>
                <li>
                  Active Windows displays, with resolution and refresh rate.
                </li>
                <li>
                  A refined dark connection map with device icons, zoom,
                  fit-to-view, and branch focus.
                </li>
                <li>
                  Polished detail drawers and device search that preserves
                  upstream connections.
                </li>
                <li>Smaller Windows packages and tighter release checks.</li>
              </ul>
              <p>
                These are preview builds. Public release signing and broader
                hardware validation are in progress.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default App;
