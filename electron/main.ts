import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  nativeTheme,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { scanMachine } from "./collectors";
import type { Scan } from "../shared/types";

let mainWindow: BrowserWindow | null = null;
let pending: Promise<Scan> | null = null;
const devUrl = !app.isPackaged ? process.env.PORTY_DEV_URL : undefined;
const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(app.getAppPath(), "build/icon.png");
function validate(event: IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    throw new Error("Untrusted request");
}
function scan() {
  if (pending) return pending;
  pending = scanMachine(
    app.isPackaged
      ? path.join(process.resourcesPath, "native")
      : path.join(app.getAppPath(), "electron/native"),
  ).finally(() => {
    pending = null;
  });
  return pending;
}
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    title: "Porty",
    icon: iconPath,
    backgroundColor:
      process.platform === "darwin"
        ? "#00000000"
        : nativeTheme.shouldUseDarkColors
          ? "#202127"
          : "#f5f5f7",
    titleBarStyle: "hiddenInset",
    ...(process.platform === "darwin"
      ? {
          vibrancy: "sidebar" as const,
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {}),
    ...(process.platform === "win32"
      ? {
          titleBarOverlay: {
            color: nativeTheme.shouldUseDarkColors ? "#202127" : "#f5f5f7",
            symbolColor: nativeTheme.shouldUseDarkColors
              ? "#f1f1f3"
              : "#242426",
            height: 52,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_web, _permission, callback) => callback(false),
  );
  if (devUrl) await mainWindow.loadURL(devUrl);
  else await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.setName("Porty");
app.whenReady().then(async () => {
  app.dock?.setIcon(iconPath);
  nativeTheme.on("updated", () => {
    if (process.platform !== "win32" || !mainWindow) return;
    const dark = nativeTheme.shouldUseDarkColors;
    mainWindow.setBackgroundColor(dark ? "#202127" : "#f5f5f7");
    mainWindow.setTitleBarOverlay({
      color: dark ? "#202127" : "#f5f5f7",
      symbolColor: dark ? "#f1f1f3" : "#242426",
    });
  });
  ipcMain.handle("porty:scan", (event) => {
    validate(event);
    return scan();
  });
  ipcMain.handle("porty:external", async (event, value: unknown) => {
    validate(event);
    if (typeof value !== "string") throw new Error("Invalid link");
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      ![
        "support.apple.com",
        "www.intel.com",
        "learn.microsoft.com",
        "www.usb.org",
        "www.electronjs.org",
        "github.com",
      ].includes(url.hostname)
    )
      throw new Error("This source is not allowed.");
    if (
      url.hostname === "github.com" &&
      url.pathname !== "/darrylmorley/whatcable"
    )
      throw new Error("This source is not allowed.");
    await shell.openExternal(url.toString());
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "Porty",
              submenu: [
                { role: "about" as const },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : []),
      {
        label: "Edit",
        submenu: [{ role: "copy" }, { role: "paste" }, { role: "selectAll" }],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
        ],
      },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    ]),
  );
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
