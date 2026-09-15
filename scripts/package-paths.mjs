import path from "node:path";
import { existsSync } from "node:fs";
export function packagePaths() {
  if (process.platform === "win32") return { executable: path.resolve("release/win-unpacked/Porty.exe"), resources: path.resolve("release/win-unpacked/resources") };
  const app = ["release/mac-arm64/Porty.app", "release/mac/Porty.app"].find(existsSync);
  if (!app) throw new Error("Build an unpacked app first.");
  return { executable: path.resolve(app, "Contents/MacOS/Porty"), resources: path.resolve(app, "Contents/Resources") };
}
