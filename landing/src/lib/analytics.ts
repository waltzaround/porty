import { releaseVersion } from "./releases";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackDownload(release: { id: string; url?: string }, location: "page" | "dialog") {
  if (!release.url || typeof window === "undefined") return;
  const url = new URL(release.url);
  const fileName = decodeURIComponent(url.pathname.split("/").pop() || "");
  // Keep the native link working even when analytics is blocked or unavailable.
  try {
    window.gtag?.("event", "download_click", {
      send_to: "G-68EK891W8D",
      download_platform: release.id,
      release_version: releaseVersion,
      download_location: location,
      file_name: fileName,
      file_extension: fileName.split(".").pop(),
      link_url: release.url,
      transport_type: "beacon",
    });
  } catch {
    // Download navigation must never depend on analytics succeeding.
  }
}
