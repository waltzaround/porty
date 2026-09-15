export const changelog = [
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
