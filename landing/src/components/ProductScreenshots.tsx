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
    id: "ports",
    label: "Port explorer",
    icon: LayoutGrid,
    src: "/screenshots/mac-ports.png",
    alt: "Porty running on a MacBook Pro, showing USB-C, HDMI, SD card, audio, and MagSafe ports with their connection speeds, display modes, and power readings.",
    platform: "macOS",
    appearance: "Light",
    description: "Mac app screenshot.",
  },
  {
    id: "map",
    label: "Connection map",
    icon: Network,
    src: "/screenshots/mac-hero.png",
    alt: "Generated hero based on Porty running on a MacBook Pro, showing its Dell monitor, USB hub branches, Ethernet adapter, and power connection.",
    platform: "macOS",
    appearance: "Dark",
    description: "Generated from a live Mac app screenshot.",
  },
  {
    id: "details",
    label: "Device details",
    icon: PanelRight,
    src: "/screenshots/details.png",
    alt: "Porty's USB2.0 Hub detail drawer alongside the connection map, showing a 480 Mb/s link and four reported hub paths.",
    platform: "Windows",
    appearance: "Dark",
    description: "Windows app screenshot.",
  },
];

export function ProductScreenshots() {
  const [active, setActive] = useState(screenshots[0].id);
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
          <span className="screenshot-platform">{current.platform} · {current.appearance} appearance</span>
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
                {shot.id !== "details" ? <HeroImage name={shot.id === "ports" ? "mac-ports" : "mac-hero"} alt={shot.alt} priority={shot.id === "ports"} /> : <img
                  src={shot.src}
                  width="1440"
                  height="900"
                  alt={shot.alt}
                  loading="lazy"
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
              {current.description} Scroll to view the full image.
            </DialogDescription>
          </DialogHeader>
          <div className="screenshot-lightbox-scroll">
            {current.id !== "details" ? <HeroImage name={current.id === "ports" ? "mac-ports" : "mac-hero"} alt={current.alt} enlarged /> : <img
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
