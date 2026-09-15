import path from "node:path";
import { createHash } from "node:crypto";
import { command } from "./command";
import { detected, unknown } from "../../shared/profiles";
import type { Connector, Port, Scan } from "../../shared/types";
import { getDisplaySupport } from "../../shared/display";
import { windowsTopology } from "./windows-topology";
import { parseWindowsDisplays, type WindowsDisplay } from "./windows-displays";
export interface WindowsPort {
  Hub: string;
  Number: number;
  PropertiesKnown: boolean;
  UserConnectable: boolean;
  TypeC: boolean;
  CompanionHub?: string;
  CompanionPort: number;
  Protocols: number;
  Flags: number;
  Status: number;
  Speed: number;
  Vid?: string;
  Pid?: string;
  DriverKey?: string;
}
export interface WindowsData {
  displays?: { Displays?: WindowsDisplay[]; Warnings?: string[] };
  machine?: { Manufacturer?: string; Model?: string };
  os?: { Caption?: string };
  cpu?: { Name?: string };
  usb?: { Ports: WindowsPort[]; Warnings?: string[];
    Hubs?: { Path: string; InstanceId: string; IsRoot: boolean }[];
    Devices?: { InstanceId: string; ParentId?: string; DriverKey?: string; Name: string; ContainerId?: string; BusName?: string }[];
  };
  connectors?: {
    ExternalReferenceDesignator?: string;
    ExternalConnectorType?: number[];
  }[];
  devices?: { Name: string; PNPDeviceID: string }[];
  warnings?: string[];
}
const hubKey = (hub: string) =>
  hub.toLowerCase().replace(/^\\[\\?][?\\]\\/, "");
const portKey = (hub: string, number: number) => `${hubKey(hub)}:${number}`;

export function mergeWindowsCompanions(ports: WindowsPort[]): WindowsPort[][] {
  const parents = new Map<string, string>();
  function find(key: string): string {
    const parent = parents.get(key);
    if (!parent) {
      parents.set(key, key);
      return key;
    }
    if (parent === key) return key;
    const root = find(parent);
    parents.set(key, root);
    return root;
  }
  for (const p of ports) {
    const key = portKey(p.Hub, p.Number);
    find(key);
    if (p.CompanionPort) {
      const companion = portKey(p.CompanionHub || p.Hub, p.CompanionPort);
      parents.set(find(key), find(companion));
    }
  }
  const groups = new Map<string, WindowsPort[]>();
  for (const p of ports) {
    const root = find(portKey(p.Hub, p.Number));
    groups.set(root, [...(groups.get(root) ?? []), p]);
  }
  return [...groups.values()];
}
export function parseWindowsScan(data: WindowsData, durationMs = 0): Scan {
  const ports: Port[] = [];
  const raw = data.usb?.Ports ?? [];
  const topology = windowsTopology(data);
  const warnings = [...(data.warnings ?? []), ...(data.usb?.Warnings ?? []), ...(data.displays?.Warnings ?? [])];
  if (raw.some((p) => !p.PropertiesKnown))
    warnings.push(
      "Some hubs do not expose connector properties. Their logical ports are omitted because they cannot be distinguished from internal wiring.",
    );
  for (const group of mergeWindowsCompanions(raw)) {
    if (!topology.isHost(group)) continue;
    if (!group.some((p) => p.PropertiesKnown && p.UserConnectable)) continue;
    const p = group[0];
    const isC = group.some((p) => p.TypeC);
    const usb3 = group.some((p) => p.Protocols & 4);
    const usb2 = group.some((p) => p.Protocols & 2);
    const active = group.find((p) => p.Status === 1);
    const status = active
      ? "connected"
      : group.every((p) => p.Status === 0)
        ? "available"
        : "unknown";
    const protocol = usb3 ? "USB 3.x" : usb2 ? "USB 2.0" : "USB";
    const candidates = active ? (data.devices ?? []).filter((d) =>
        d.PNPDeviceID.toUpperCase().includes(
          `VID_${active.Vid}&PID_${active.Pid}`,
        ) && !/&MI_/i.test(d.PNPDeviceID),
      ) : [];
    const device = candidates.length === 1 ? candidates[0] : undefined;
    const speeds: Record<number, string> = {
      0: "1.5 Mb/s",
      1: "12 Mb/s",
      2: "480 Mb/s",
      3: "5 Gb/s or higher",
    };
    const link = active ? [...new Set(group.filter(p => p.Status === 1).map(p =>
      p.Flags & 4 ? "10 Gb/s or higher" : p.Flags & 1 ? "5 Gb/s or higher" : speeds[p.Speed] ?? "Not reported"
    ))].join(" + ") : "No data device";
    ports.push({
      id: `win-usb-${createHash("sha256").update(portKey(p.Hub, p.Number)).digest("hex").slice(0, 16)}`,
      name: `${isC ? "USB-C" : "USB"} ${ports.length + 1}`,
      connector: isC ? "USB-C" : "USB (unclassified)",
      location: `Hub ${hubKey(p.Hub).includes("root") ? "(root) " : ""}· port ${p.Number}`,
      status,
      protocol,
      source: "Windows USB hub driver",
      evidence: "detected",
      capabilities: [
        detected(
          "USB support",
          protocol,
          "Protocols returned by the Windows USB hub driver. Companion USB 2 and USB 3 paths are merged into one physical connector.",
        ),
        unknown(
          "Data transfer",
          "The hub protocol flags do not identify a precise maximum speed. USB 3.x alone does not distinguish 5, 10, or 20 Gb/s.",
        ),
        detected(
          "Current link",
          link,
          "Negotiated device speed reported by the USB hub. SuperSpeedPlus establishes a lower bound, not an exact rate.",
        ),
        unknown(
          "Thunderbolt / USB4",
          "Legacy USB hub queries cannot establish USB4 or Thunderbolt support for this specific connector.",
        ),
        unknown(
          "Display output",
          "USB-C shape does not imply DisplayPort Alt Mode. This requires firmware or manufacturer information.",
        ),
        unknown("Charging input"),
        unknown("Power output"),
      ],
      devices: topology.enabled ? topology.forPort(group) : active
        ? [
            {
              name: device?.Name ?? `USB device ${active.Vid}:${active.Pid}`,
              detail: link,
            },
          ]
        : [],
      note: isC
        ? "Charging-only and display-only connections may not be visible through USB hub queries."
        : "Windows confirms an external connector but does not identify its shape beyond “not USB-C”. It is not automatically classified as USB-A.",
    });
  }
  for (const item of data.connectors ?? []) {
    const name = item.ExternalReferenceDesignator?.trim();
    if (!name) continue;
    const connector: Connector | undefined = /HDMI/i.test(name)
      ? "HDMI"
      : /DisplayPort|\bDP\b/i.test(name)
        ? "DisplayPort"
        : /RJ.?45|Ethernet|\bLAN\b/i.test(name)
          ? "Ethernet"
          : /headphone|audio|line.?out/i.test(name)
            ? "Audio"
            : /\bSD(XC)?\b/i.test(name)
              ? "SD card"
              : undefined;
    if (!connector) continue;
    const id = `win-firmware-${name}`;
    if (ports.some((p) => p.id === id)) continue;
    ports.push({
      id,
      name,
      connector,
      location: "Firmware inventory",
      status: "unknown",
      protocol: connector,
      source: "Windows Win32_PortConnector / SMBIOS",
      evidence: "detected",
      devices: [],
      capabilities: [
        detected(
          "Connector",
          connector,
          "Identified from the firmware’s external connector label. Firmware data may be incomplete.",
        ),
        unknown("Capabilities"),
      ],
    });
  }
  warnings.push(
    "Windows firmware may omit empty video, audio and card-reader ports. USB-C power contracts and alternate modes are shown only when verified; unreported capabilities remain unknown.",
  );
  return {
    machine: {
      name:
        [data.machine?.Manufacturer, data.machine?.Model]
          .filter(Boolean)
          .join(" ") || "Windows PC",
      model: data.machine?.Model ?? "Unknown",
      chip: data.cpu?.Name ?? "",
      os: data.os?.Caption ?? "Windows",
      platform: "win32",
    },
    ports: ports.map((port) => ({ ...port, display: getDisplaySupport(port) })),
    devices: [...parseWindowsDisplays(data.displays?.Displays, topology.containerFor), ...(topology.enabled ? topology.devices : (data.devices ?? [])
      .filter((d) => !/root hub|host controller|composite device/i.test(d.Name))
      .map((d) => ({
        name: d.Name,
        detail: "USB device · physical connection may be listed above",
      })))],
    warnings: [...new Set(warnings)],
    scannedAt: new Date().toISOString(),
    durationMs,
    demo: false,
  };
}
export async function scanWindows(nativeDir: string) {
  const start = Date.now();
  const shell = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const output = await command(
    shell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(nativeDir, "scan-windows.ps1"),
    ],
    60000,
  );
  return parseWindowsScan(
    JSON.parse(output.replace(/^\uFEFF/, "").trim()),
    Date.now() - start,
  );
}
