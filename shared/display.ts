import type {
  Connector,
  DisplayMode,
  DisplayResolution,
  DisplaySupport,
  Port,
} from "./types";

export const DISPLAY_SOURCE = "https://support.apple.com/en-us/101571";

export function defaultDisplaySupport(connector: Connector): DisplaySupport {
  if (
    ["USB-A", "SD card", "Audio", "MagSafe", "Ethernet"].includes(connector)
  ) {
    return {
      status: "unsupported",
      note: "No native video output. USB graphics adapters are separate devices with their own limits.",
    };
  }
  return {
    status: "unknown",
    note: "Maximum resolution and refresh rate are not reported for this port. A connector type or a connected display’s current mode does not establish the port’s maximum.",
  };
}

// These are paired, published modes, never a cross-product of resolution and Hz.
export function m4DisplaySupport(chip: string): DisplaySupport {
  return {
    status: "supported",
    evidence: "specification",
    modes: [
      { resolution: "8K", width: 7680, height: 4320, refreshHz: 60 },
      { resolution: "6K", width: 6144, height: 3456, refreshHz: 60 },
      { resolution: "5K", width: 5120, height: 2880, refreshHz: 120 },
      { resolution: "4K", width: 3840, height: 2160, refreshHz: 240 },
    ],
    // Common native formats within the published resolution limits. Apple
    // does not publish individual maximum refresh rates for these formats;
    // the connected display, cable and adapter determine available timings.
    additionalResolutions: [
      { resolution: "5K2K", width: 5120, height: 2160 },
      { resolution: "DCI 4K", width: 4096, height: 2160 },
      { resolution: "Dual QHD", width: 5120, height: 1440 },
      { resolution: "UWQHD+", width: 3840, height: 1600 },
      { resolution: "QHD+", width: 3200, height: 1800 },
      { resolution: "UWQHD", width: 3440, height: 1440 },
      { resolution: "Dual FHD", width: 3840, height: 1080 },
      { resolution: "WQXGA", width: 2560, height: 1600 },
      { resolution: "1440p · QHD", width: 2560, height: 1440 },
      { resolution: "UW FHD", width: 2560, height: 1080 },
      { resolution: "WUXGA", width: 1920, height: 1200 },
      { resolution: "1080p · FHD", width: 1920, height: 1080 },
      { resolution: "UXGA", width: 1600, height: 1200 },
      { resolution: "WSXGA+", width: 1680, height: 1050 },
      { resolution: "SXGA+", width: 1400, height: 1050 },
      { resolution: "900p · HD+", width: 1600, height: 900 },
      { resolution: "WXGA+", width: 1440, height: 900 },
      { resolution: "SXGA", width: 1280, height: 1024 },
      { resolution: "WXGA", width: 1280, height: 800 },
      { resolution: "HD", width: 1366, height: 768 },
      { resolution: "720p · HD", width: 1280, height: 720 },
      { resolution: "XGA", width: 1024, height: 768 },
      { resolution: "SVGA", width: 800, height: 600 },
      { resolution: "VGA", width: 640, height: 480 },
    ],
    source: DISPLAY_SOURCE,
    note: "Available resolutions and refresh rates depend on the display, cable, adapter and other connected displays. Common formats are included; refresh rates are shown where published. Display counts are shared across the Mac, alongside its built-in display.",
    configurations: /\bM4 Max\b/i.test(chip)
      ? [
          {
            displays: 2,
            detail: "Each up to 8K 60 Hz, 5K 120 Hz or 4K 240 Hz.",
          },
          {
            displays: 3,
            detail:
              "Two at 6K 60 Hz or 4K 144 Hz; one at 8K 60 Hz, 5K 120 Hz or 4K 240 Hz.",
          },
          { displays: 4, detail: "Each up to 6K 60 Hz or 4K 144 Hz." },
        ]
      : /\bM4 Pro\b/i.test(chip)
        ? [
            { displays: 1, detail: "Up to 8K 60 Hz, 5K 120 Hz or 4K 240 Hz." },
            { displays: 2, detail: "Each up to 6K 60 Hz or 4K 144 Hz." },
          ]
        : [],
  };
}

export function getDisplaySupport(port: Port): DisplaySupport {
  return port.display ?? defaultDisplaySupport(port.connector);
}

export function displayResolutions(
  display: DisplaySupport,
): DisplayResolution[] {
  if (display.status !== "supported") return [];
  const resolutions = new Map<string, DisplayResolution>();
  for (const mode of [
    ...(display.additionalResolutions ?? []),
    ...display.modes,
  ]) {
    const key = `${mode.width}x${mode.height}`;
    const existing = resolutions.get(key);
    if (!existing || (mode.refreshHz ?? 0) > (existing.refreshHz ?? 0)) {
      resolutions.set(key, mode);
    }
  }
  return [...resolutions.values()].sort(
    (a, b) => b.width * b.height - a.width * a.height || b.width - a.width,
  );
}

export function displayLimits(display: DisplaySupport): {
  resolution?: DisplayMode;
  refresh?: DisplayMode;
} {
  if (display.status !== "supported") return {};
  return {
    resolution: [...display.modes].sort(
      (a, b) =>
        b.width * b.height - a.width * a.height || b.refreshHz - a.refreshHz,
    )[0],
    refresh: [...display.modes].sort(
      (a, b) =>
        b.refreshHz - a.refreshHz || b.width * b.height - a.width * a.height,
    )[0],
  };
}

export function formatMode(mode: DisplayMode): string {
  return `${mode.resolution} at ${mode.refreshHz} Hz`;
}
