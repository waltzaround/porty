import { app, BrowserWindow, dialog, shell } from "electron";
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";

export function healthLog(event: string, detail = "") {
  // Fixed event categories and error types only: no scan contents, hardware
  // identifiers, command output, user paths, or uploaded crash reports.
  try {
    const directory = app.getPath("logs");
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "startup.log");
    try {
      if (statSync(file).size > 200_000)
        renameSync(file, path.join(directory, "startup.previous.log"));
    } catch {
      /* First run or rotation unavailable. */
    }
    appendFileSync(
      file,
      `${new Date().toISOString()} ${event} ${detail.replace(/[\r\n]/g, " ").slice(0, 200)}\n`,
      { mode: 0o600 },
    );
  } catch {
    /* A blocked log location must never block the interface. */
  }
}
export async function showStartupLog() {
  const error = await shell.openPath(app.getPath("logs"));
  if (error)
    await dialog.showMessageBox({
      type: "info",
      message: "The diagnostic folder could not be opened.",
      detail:
        "Your device policy may restrict access. Porty can still retry loading the interface.",
    });
}
export function restartWithBasicGraphics() {
  app.relaunch({
    args: [
      ...process.argv.slice(1).filter((arg) => arg !== "--disable-gpu"),
      "--disable-gpu",
    ],
  });
  app.quit();
}
export async function troubleshooting() {
  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "Porty troubleshooting",
    message: "Trouble starting Porty or seeing a device?",
    detail:
      "A blank window and an unavailable hardware reading are different failures. Use View → Reload Porty to retry the interface.\n\nIf macOS asks to allow an accessory, unlock the Mac, reconnect the cable, and approve that accessory. Charging can work even when data access is blocked. A managed Mac may require your administrator. Porty does not need microphone, camera, screen-recording, or full-disk access for its hardware inventory.\n\nStartup diagnostics stay on this computer and contain no hardware scan data.",
    buttons: [
      "Open startup diagnostics",
      "Restart with basic graphics",
      "Close",
    ],
    defaultId: 2,
    cancelId: 2,
  });
  if (response === 0) await showStartupLog();
  if (response === 1) restartWithBasicGraphics();
}
export function windowRecovery(
  window: BrowserWindow,
  reload: () => Promise<void>,
) {
  let ready = false,
    prompting = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  async function failed(reason: string) {
    clear();
    healthLog("interface-failure", reason);
    if (prompting || window.isDestroyed()) return;
    prompting = true;
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      title: "Porty could not show its interface",
      message: "Porty is running, but its interface did not finish loading.",
      detail:
        "You can retry without reinstalling. If it happens again, the startup diagnostics record which part failed. This does not establish that a macOS permission was denied.",
      buttons: [
        "Reload Porty",
        "Open startup diagnostics",
        "Restart with basic graphics",
        "Close",
      ],
      defaultId: 0,
      cancelId: 3,
    });
    prompting = false;
    if (window.isDestroyed()) return;
    if (response === 0) void reload().catch(() => failed("reload-failed"));
    if (response === 1) await showStartupLog();
    if (response === 2) restartWithBasicGraphics();
  }
  const loading = () => {
    clear();
    ready = false;
    timer = setTimeout(() => {
      if (!ready) void failed("startup-timeout");
    }, 15000);
  };
  window.webContents.on("did-start-loading", loading);
  window.webContents.on(
    "did-fail-load",
    (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) void failed(`load-error-${code}`);
    },
  );
  window.webContents.on(
    "preload-error",
    (_event, _path, error) => void failed(`preload-${error.name}`),
  );
  window.webContents.on(
    "render-process-gone",
    (_event, details) =>
      void failed(`renderer-${details.reason}-${details.exitCode}`),
  );
  window.on("unresponsive", () => void failed("interface-unresponsive"));
  window.on("closed", clear);
  loading();
  return {
    ready: () => {
      ready = true;
      clear();
      healthLog("interface-ready");
    },
    failed,
  };
}
