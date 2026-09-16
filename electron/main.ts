import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  nativeTheme,
  powerMonitor,
} from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { scanMachine } from "./collectors";
import { Monitoring } from './monitoring';
import { healthLog, troubleshooting, windowRecovery } from './app-health';

let mainWindow: BrowserWindow | null = null;
let monitoring: Monitoring;
let recovery: ReturnType<typeof windowRecovery> | undefined;
if (app.commandLine.hasSwitch('disable-gpu')) app.disableHardwareAcceleration();
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
    titleBarStyle: process.platform === "win32" ? "default" : "hiddenInset",
    ...(process.platform === "darwin"
      ? {
          vibrancy: "sidebar" as const,
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_web, _permission, callback) => callback(false),
  );
  const window = mainWindow;
  const load = () => devUrl ? window.loadURL(devUrl) : window.loadFile(path.join(__dirname, '../dist/index.html'));
  recovery = windowRecovery(window, load);
  mainWindow.on("closed", () => {
    mainWindow = null;
    recovery = undefined;
  });
  await load().catch(() => recovery?.failed('initial-load-failed'));
}
app.setName("Porty");
app.whenReady().then(async () => {
  app.setAppLogsPath();
  healthLog('app-start', `${app.getVersion()} ${process.platform} ${process.arch} Electron ${process.versions.electron}`);
  const nativeDir = app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(app.getAppPath(), 'electron/native');
  monitoring = new Monitoring(signal => scanMachine(nativeDir, signal), update => {
    if (mainWindow && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send('porty:update', update);
  }, process.platform === 'darwin' ? path.join(app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'build'), 'native/porty-events') : undefined);
  app.dock?.setIcon(iconPath);
  nativeTheme.on("updated", () => {
    if (process.platform !== "win32" || !mainWindow) return;
    const dark = nativeTheme.shouldUseDarkColors;
    mainWindow.setBackgroundColor(dark ? "#202127" : "#f5f5f7");
  });
  ipcMain.handle("porty:scan", (event) => {
    validate(event);
    return monitoring.scan();
  });
  ipcMain.handle('porty:ready', event => { validate(event); recovery?.ready(); });
  ipcMain.handle('porty:issue', (event, issue) => { validate(event); if (issue === 'renderer-error') healthLog('renderer-error-boundary'); });
  ipcMain.handle('porty:history', event => { validate(event); return monitoring.snapshot(); });
  ipcMain.handle('porty:clear-history', event => { validate(event); monitoring.clear(); });
  ipcMain.handle('porty:monitoring', (event, enabled: unknown) => { validate(event); if (typeof enabled !== 'boolean') throw new Error('Invalid monitoring state'); monitoring.setEnabled(enabled); });
  powerMonitor.on('resume', () => { if (monitoring.snapshot().monitoring.enabled) { monitoring.history.add({ type: 'info', name: 'Mac or PC woke from sleep', detail: 'Checking the current connections. Changes while asleep may not have been observed.', source: 'monitor' }); void monitoring.scan().catch(() => {}); } });
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
          { label: 'Reload Porty', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
          ...(!app.isPackaged ? [{ role: "toggleDevTools" as const }] : []),
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
        ],
      },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
      { label: 'Help', submenu: [{ label: 'Troubleshooting…', click: () => void troubleshooting() }] },
    ]),
  );
  await createWindow();
  monitoring.setEnabled(true);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}).catch(() => { healthLog('app-initialization-failed'); void troubleshooting(); });
app.on('before-quit', () => monitoring?.stop());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
