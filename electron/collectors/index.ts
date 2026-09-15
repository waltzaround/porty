import { scanMac } from "./macos";
import { scanWindows } from "./windows";
import path from "node:path";
export async function scanMachine(
  nativeDir = path.join(process.cwd(), "electron", "native"),
) {
  if (process.platform === "darwin") return scanMac();
  if (process.platform === "win32") return scanWindows(nativeDir);
  throw new Error(
    "Native port discovery is available on macOS and Windows. You can explore the sample machine on this platform.",
  );
}
