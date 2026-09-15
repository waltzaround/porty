import { useState, type MouseEvent } from "react";
import { ArrowDownToLine, ArrowUpRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SiteHeader({ home = false, currentPage, onDownload }: {
  home?: boolean;
  currentPage?: "changelog";
  onDownload?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = [
    { label: "Changelog", href: "/changelog/", current: currentPage === "changelog" },
    { label: "GitHub", href: "https://github.com/waltzaround/porty" },
    { label: "FAQ", href: home ? "#questions" : "/#questions" },
  ];
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header" id="top">
        <div className="container header-inner">
          <a className="brand" href={home ? "#top" : "/"} aria-label="Porty home">
            <img src="/porty.svg" alt="" width="34" height="34" />
            <span>porty<span className="brand-period">.</span></span>
          </a>
          <nav aria-label="Main navigation" className="desktop-nav">
            {links.map((link) => <a key={link.href} href={link.href} aria-current={link.current ? "page" : undefined}>{link.label}</a>)}
          </nav>
          <div className="header-actions">
            <Button asChild className="nav-download">
              <a href={home ? "#download" : "/#download"} onClick={(event) => { setMobileOpen(false); onDownload?.(event); }}>
                Get Porty <ArrowDownToLine />
              </a>
            </Button>
            <button className="mobile-toggle" aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen} aria-controls="mobile-nav" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobileOpen && <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile navigation">
          {links.map((link) => <a key={link.href} href={link.href} aria-current={link.current ? "page" : undefined} onClick={() => setMobileOpen(false)}>
            {link.label}<ArrowUpRight size={18} aria-hidden="true" />
          </a>)}
        </nav>}
      </header>
    </>
  );
}
