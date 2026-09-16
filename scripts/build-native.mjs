import { mkdir, copyFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
await mkdir("build/native", { recursive: true });
if (process.platform === 'darwin') {
  execFileSync('/usr/bin/clang', ['-fobjc-arc', '-O2', '-mmacosx-version-min=12.0', '-framework', 'Foundation', '-framework', 'IOKit', '-framework', 'CoreGraphics', 'electron/native/MacEvents.m', '-o', 'build/native/porty-events'], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', 'build/native/porty-events'], { stdio: 'inherit' });
}
if (process.platform === "win32") {
  await rm("build/native/Porty.Native.dll", { force: true });
  const shell = path.join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  execFileSync(shell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "scripts/build-native.ps1"], { stdio: "inherit", windowsHide: true });
  await copyFile("electron/native/scan-windows.ps1", "build/native/scan-windows.ps1");
}
