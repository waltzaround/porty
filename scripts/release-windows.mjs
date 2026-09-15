import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
if (process.platform !== "win32") throw new Error("Build Windows releases on Windows.");
if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK) throw new Error("Signing is required. Configure CSC_LINK or WIN_CSC_LINK and the corresponding certificate password. Use dist:win for an unsigned test build.");
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error("Release tag must match package.json version.");
function run(file, args) { execFileSync(file, args, { stdio: "inherit", windowsHide: true }); }
run(process.execPath, [process.env.npm_execpath, "test"]);
run(process.execPath, [process.env.npm_execpath, "run", "build"]);
run(process.execPath, ["node_modules/electron-builder/cli.js", "--win", "--publish", "never", "--config.electronDist=node_modules/electron/dist", "--config.forceCodeSigning=true"]);
run(process.execPath, ["scripts/verify-package.mjs"]);
run(process.execPath, ["scripts/report-size.mjs"]);
const shell = path.join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
run(shell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", "scripts/verify-signatures.ps1", "-Version", version]);
run(process.execPath, ["scripts/smoke-packaged.mjs"]);
