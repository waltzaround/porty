export const changelog = [
  {
    version: "1.0.6",
    publishedAt: "2026-09-18T09:05:00Z",
    title: "Clearer monitor and power readings",
    changes: [
      "Separate HiDPI desktop size from backing pixels, including portrait displays.",
      "Keep native display transport consistent across port and device views.",
      "Improve monitor hub labels and distinguish USB data speed from display connections.",
      "Show current power input, negotiated limits, and advertised maximum power separately.",
    ],
  },
  {
    version: "1.0.5",
    publishedAt: "2026-09-16T11:01:11Z",
    title: "Dock grouping and connection history",
    changes: [
      "Group supported docks and their displays together, with stacked resolutions and refresh rates.",
      "Track connections and state changes in a session event log, with live USB and display events on macOS.",
      "Recover from startup problems with reload, basic graphics, and diagnostic log options.",
      "Keep scans responsive when individual hardware queries fail or time out.",
    ],
  },
  {
    version: "1.0.4",
    publishedAt: "2026-09-15T19:19:34Z",
    title: "Mac startup fix",
    changes: [
      "Fixed an Apple Silicon startup crash caused by an invalid app signature.",
      "Added checks to catch invalid Mac app signatures before a release is published.",
    ],
  },
  {
    version: "1.0.3",
    publishedAt: "2026-09-15T10:03:50Z",
    title: "The first public preview",
    changes: [
      "Explore your computer’s ports, connected devices, and USB hubs on macOS and Windows.",
      "Follow hub branches in the connection map, with zoom, fit-to-view, and branch focus.",
      "Inspect reported connection speeds, active display resolutions, and refresh rates.",
      "Download native builds for Apple Silicon, Intel Macs, and Windows 64-bit PCs.",
    ],
  },
] as const;

export const releaseNotesUrl = (version: string) => `https://github.com/waltzaround/porty/releases/tag/v${version}`;
