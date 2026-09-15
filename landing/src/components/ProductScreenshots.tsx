import { useRef, useState } from "react";
import { Expand, LayoutGrid, Network, PanelRight } from "lucide-react";
import { HeroImage } from "./HeroImage";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const screenshots = [
  {
    id: "map",
    label: "Connection map",
    icon: Network,
    src: "/screenshots/mac-hero.png",
    alt: "Generated hero based on Porty running on a MacBook Pro, showing its Dell monitor, USB hub branches, Ethernet adapter, and power connection.",
  },
  {
    id: "ports",
    label: "Port explorer",
    icon: LayoutGrid,
    src: "/screenshots/ports.png",
    alt: "Porty's real Windows port inventory, showing connected USB-C and USB ports with their negotiated links and downstream devices.",
  },
  {
    id: "details",
    label: "Device details",
    icon: PanelRight,
    src: "/screenshots/details.png",
    alt: "Porty's USB2.0 Hub detail drawer alongside the connection map, showing a 480 Mb/s link and four reported hub paths.",
  },
];

export function ProductScreenshots() {
  const [active, setActive] = useState("map");
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const current = screenshots.find((shot) => shot.id === active)!;
  return (
    <section
      id="in-action"
      className="product-section container screenshot-showcase"
      aria-label="Porty product views"
    >
      <Tabs value={active} onValueChange={setActive}>
        <div className="screenshots-topline">
          <TabsList
            aria-label="Product screenshots"
            className="screenshot-tabs"
          >
            {screenshots.map((shot) => (
              <TabsTrigger value={shot.id} key={shot.id}>
                <shot.icon size={14} />
                {shot.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <span className="screenshot-platform">{active === "map" ? "macOS" : "Windows"} · Dark appearance</span>
        </div>
        <div className="screenshot-stage">
          <div className="screenshot-stage-grid" aria-hidden="true" />
          {screenshots.map((shot) => (
            <TabsContent
              value={shot.id}
              key={shot.id}
              className="screenshot-panel"
            >
              <button
                ref={active === shot.id ? trigger : undefined}
                className="screenshot-frame"
                onClick={() => setOpen(true)}
                aria-label={`Enlarge ${shot.label.toLowerCase()} screenshot`}
              >
                {shot.id === "map" ? <HeroImage alt={shot.alt} /> : <img
                  src={shot.src}
                  width="1440"
                  height="900"
                  alt={shot.alt}
                  loading={shot.id === "map" ? "eager" : "lazy"}
                  fetchPriority={shot.id === "map" ? "high" : "auto"}
                />}
                <span className="enlarge-hint">
                  <Expand size={13} />
                  Enlarge
                </span>
              </button>
            </TabsContent>
          ))}
        </div>
      </Tabs>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="screenshot-lightbox"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{current.label}</DialogTitle>
            <DialogDescription>
              {active === "map" ? "Generated from a live Mac app screenshot." : "Windows app screenshot."} Scroll to view the full image.
            </DialogDescription>
          </DialogHeader>
          <div className="screenshot-lightbox-scroll">
            {current.id === "map" ? <HeroImage alt={current.alt} enlarged /> : <img
              src={current.src}
              width="1440"
              height="900"
              alt={current.alt}
            />}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
