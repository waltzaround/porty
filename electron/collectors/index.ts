import { scanMac } from "./macos";
import { scanWindows } from "./windows";
import path from "node:path";
export async function scanMachine(
  nativeDir = path.join(process.cwd(), "electron", "native"),
  signal?: AbortSignal,
) {
  if (process.platform === "darwin") return scanMac(signal);
  if (process.platform === "win32") return scanWindows(nativeDir, signal);
  throw new Error(
    "Native port discovery is available on macOS and Windows. You can explore the sample machine on this platform.",
  );
}
