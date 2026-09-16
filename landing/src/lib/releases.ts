// Set public HTTPS release URLs at build time. Never imply a download exists
// before a real artifact has been published.
function releaseUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export const macPreview = import.meta.env.VITE_MAC_UNSIGNED === "true";

export const releases = [
  {
    id: "mac-arm",
    name: "macOS",
    detail: macPreview ? "Apple Silicon · Unsigned preview" : "Apple Silicon",
    url: releaseUrl(import.meta.env.VITE_DOWNLOAD_MAC_ARM64),
  },
  {
    id: "mac-intel",
    name: "macOS",
    detail: macPreview ? "Intel · Unsigned preview" : "Intel",
    url: releaseUrl(import.meta.env.VITE_DOWNLOAD_MAC_X64),
  },
  {
    id: "windows",
    name: "Windows",
    detail: import.meta.env.VITE_WINDOWS_UNSIGNED === "true" ? "64-bit PC · Unsigned preview" : "64-bit PC",
    url: releaseUrl(import.meta.env.VITE_DOWNLOAD_WINDOWS),
  },
];
export const releaseVersion = import.meta.env.VITE_RELEASE_VERSION || "1.0.5";
