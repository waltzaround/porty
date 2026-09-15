import { parse } from "plist";
import { command } from "./command";
import { detected, getMacProfile, unknown } from "../../shared/profiles";
import type { Port, Scan } from "../../shared/types";
import { getDisplaySupport } from "../../shared/display";
import { applyPhysicalConnections, readUSBDevices } from "./mac-connections";
import { applyCurrentPower, attachCurrentDisplay, readCurrentDisplayMode, readDisplayIdentity } from "./mac-current";
import { applyAudioStats, applyCardStats, applyDisplayAudioStats } from "./mac-media";
type Raw = Record<string, any>;
const array = (value: any): Raw[] => (Array.isArray(value) ? value : []);
const uniqueDevices = (devices: Port["devices"]) =>
  devices.filter(
    (device, i) =>
      devices.findIndex((d) =>
        device.id
          ? d.id === device.id
          : d.name === device.name && d.detail === device.detail,
      ) === i,
  );

export function parseMacScan(
  data: Raw,
  registry: Raw[] | null,
  os: string,
  durationMs = 0,
  physical: Raw[] | null = null,
  battery: Raw | null = null,
): Scan {
  const hardware = array(data.SPHardwareDataType)[0] ?? {};
  const model = String(hardware.machine_model ?? "Unknown Mac");
  const profile = getMacProfile(model, String(hardware.chip_type ?? ""));
  const ports: Port[] = profile?.ports ?? [];
  const warnings: string[] = [];
  if (!profile)
    warnings.push(
      "No verified model profile is bundled for this Mac. Empty HDMI, audio, card-reader and charging ports may be missing. Detected USB ports still appear below.",
    );
  if (registry === null)
    warnings.push(
      "The USB registry could not be read. USB connection status is incomplete.",
    );
  const grouped = new Map<string, Raw[]>();
  for (const node of registry ?? []) {
    // ioreg also returns hub-port subtrees as roots; they belong under their hub.
    if (/USB.*HubPort/.test(String(node.IOObjectClass))) continue;
    const number = node.UsbCPortNumber;
    // Captive/internal ports must not appear as user-accessible connectors.
    if (
      !number &&
      node.PortType !== 0 &&
      node.UsbConnector !== 0 &&
      node.UsbConnector !== 3
    )
      continue;
    const id = number
      ? `mac-usbc-${number}`
      : `mac-usb-${node.locationID ?? node.IORegistryEntryName}`;
    grouped.set(id, [...(grouped.get(id) ?? []), node]);
  }
  for (const [id, nodes] of grouped) {
    let port = ports.find((p) => p.id === id);
    if (!port) {
      const isC = !!nodes[0].UsbCPortNumber;
      const isA = nodes.some(
        (n) => n.UsbConnector === 0 || n.UsbConnector === 3,
      );
      const usb3 = nodes.some((n) => n["UsbProtocol (3.x)"]);
      port = {
        id,
        name: isC
          ? `USB-C ${nodes[0].UsbCPortNumber}`
          : `USB port ${ports.length + 1}`,
        connector: isC ? "USB-C" : isA ? "USB-A" : "USB (unclassified)",
        location: "Location not reported",
        protocol: usb3 ? "USB 3.x" : "USB",
        status: "unknown",
        evidence: "detected",
        source: "macOS IORegistry",
        devices: [],
        capabilities: [
          detected(
            "USB support",
            usb3 ? "USB 3.x" : "USB",
            "USB protocol reported by the host controller. This does not establish the maximum link speed.",
          ),
          unknown("Data transfer"),
          unknown("Display output"),
          unknown("Charging input"),
          unknown("Power output"),
        ],
      };
      ports.push(port);
    }
    port.devices = uniqueDevices(
      readUSBDevices(nodes.flatMap((n) => array(n.IORegistryEntryChildren))),
    );
    port.status = port.devices.length ? "connected" : "available";
    port.evidence = "detected";
    port.source = profile
      ? "macOS IORegistry + model specifications"
      : "macOS IORegistry";
    port.note =
      "Connection status covers enumerated USB and Thunderbolt devices. Charging-only cables and some display connections may not be visible.";
    if (port.devices.length) {
      port.capabilities = port.capabilities.filter(
        (c) => c.label !== "Current link",
      );
      const links = [...new Set(port.devices.filter((d) => !d.parentName).flatMap((d) => d.linkSpeed ? [d.linkSpeed] : []))];
      port.capabilities.push(
        links.length ? detected(
          "Current link",
          links.join(" + "),
          "Currently negotiated links of devices directly attached to this connector. USB 2 and USB 3 companion links may both be active. Downstream hub devices are excluded; this is not measured transfer throughput.",
        ) : unknown("Current link", "The attached device’s negotiated speed was not reported."),
      );
    }
  }
  for (const bus of array(data.SPThunderboltDataType)) {
    for (const [key, receptacle] of Object.entries(bus)) {
      if (
        !key.startsWith("receptacle_") ||
        !receptacle ||
        typeof receptacle !== "object"
      )
        continue;
      const r = receptacle as Raw;
      const id = `mac-usbc-${r.receptacle_id_key}`;
      let port = ports.find((p) => p.id === id);
      if (!port && /usb4/i.test(String(bus._name)) && r.receptacle_id_key) {
        port = {
          id,
          name: `USB-C ${r.receptacle_id_key}`,
          connector: "USB-C",
          location: "Location not reported",
          protocol: "Thunderbolt / USB4",
          status: "unknown",
          evidence: "detected",
          source: "macOS System Information",
          devices: [],
          capabilities: [
            unknown("Data transfer"),
            unknown("Display output"),
            unknown("Charging input"),
            unknown("Power output"),
          ],
        };
        ports.push(port);
      }
      if (!port) continue;
      if (r.current_speed_key)
        port.capabilities.push(
          detected(
            "Controller limit",
            String(r.current_speed_key),
            "Reported by System Information. “Up to” is an upper bound and may include asymmetric display bandwidth; it is not a measured transfer rate.",
          ),
        );
      const attached = array(bus._items).filter(
        (d) =>
          !d.receptacle_id_key ||
          String(d.receptacle_id_key) === String(r.receptacle_id_key),
      );
      if (
        attached.length &&
        !String(r.receptacle_status_key).includes("no_devices")
      ) {
        port.devices.push(
          ...attached.map((d) => ({
            name: String(d.device_name_key ?? d._name ?? "Thunderbolt device"),
            detail: String(d.vendor_name_key ?? "Thunderbolt connection"),
          })),
        );
        port.status = "connected";
      }
    }
  }
  if (physical) applyPhysicalConnections(ports, physical);
  else
    warnings.push(
      "Physical connection and power records are unavailable. Charging cables may not appear.",
    );
  applyCurrentPower(ports, battery);
  applyCardStats(ports, physical ?? [], array(data.SPCardReaderDataType));
  applyAudioStats(ports, Array.isArray(data.SPAudioDataType) ? data.SPAudioDataType : undefined);
  const devices: Scan["devices"] = [];
  function walkUSB(items: Raw[]) {
    for (const item of items) {
      if (item.vendor_id || item.product_id)
        devices.push({
          name: String(item._name ?? "USB device"),
          detail: String(item.speed ?? "USB connection"),
        });
      walkUSB(array(item._items));
    }
  }
  walkUSB(array(data.SPUSBDataType));
  for (const gpu of array(data.SPDisplaysDataType))
    for (const display of array(gpu.spdisplays_ndrvs)) {
      if (
        display.spdisplays_online === "spdisplays_no" ||
        display.spdisplays_builtin === "spdisplays_yes" ||
        display.spdisplays_connection_type === "spdisplays_internal"
      )
        continue;
      devices.push({
        id: `mac-display-${display._spdisplays_displayID ?? devices.length}`,
        kind: "display",
        name: String(display._name ?? "External display"),
        displayMode: readCurrentDisplayMode(display),
        displayIdentity: readDisplayIdentity(display),
        detail: String(
          display._spdisplays_resolution ??
            display.spdisplays_resolution ??
            "Display connection; physical port not reported",
        ),
      });
    }
  // Virtual/USB graphics drivers do not establish a native DisplayPort route.
  const externalDisplays = devices.filter((d) => d.kind === "display");
  applyDisplayAudioStats(externalDisplays, array(data.SPAudioDataType));
  if (!array(data.SPDisplaysDataType).some((gpu) => /DisplayLink|virtual|airplay/i.test(String(gpu._name)))) {
    attachCurrentDisplay(ports, externalDisplays, physical ?? []);
  }
  return {
    machine: {
      name: profile?.name ?? String(hardware.machine_name ?? "Mac"),
      model,
      chip: String(hardware.chip_type ?? hardware.cpu_type ?? ""),
      os,
      platform: "darwin",
    },
    ports: ports.map((port) => ({ ...port, display: getDisplaySupport(port) })),
    devices: uniqueDevices(devices),
    warnings,
    scannedAt: new Date().toISOString(),
    durationMs,
    demo: false,
  };
}

export async function scanMac(): Promise<Scan> {
  const start = Date.now();
  const [system, usb, version, physical, battery] = await Promise.allSettled([
    command(
      "/usr/sbin/system_profiler",
      [
        "SPHardwareDataType",
        "SPThunderboltDataType",
        "SPUSBDataType",
        "SPDisplaysDataType",
        "SPCardReaderDataType",
        "SPAudioDataType",
        "-json",
      ],
      40000,
    ),
    command("/usr/sbin/ioreg", ["-a", "-l", "-r", "-c", "AppleUSBHostPort"]),
    command("/usr/bin/sw_vers", ["-productVersion"]),
    command("/usr/sbin/ioreg", ["-a", "-l", "-r", "-c", "IOPort"]),
    command("/usr/sbin/ioreg", ["-a", "-l", "-r", "-c", "AppleSmartBattery"]),
  ]);
  if (system.status === "rejected")
    throw new Error(
      "macOS System Information could not be read. Try scanning again.",
    );
  let registry: Raw[] | null = null;
  if (usb.status === "fulfilled") {
    try {
      registry = array(parse(usb.value));
    } catch {
      /* Surface incomplete detection in the scan. */
    }
  }
  let physicalPorts: Raw[] | null = null;
  if (physical.status === "fulfilled") {
    try {
      physicalPorts = array(parse(physical.value));
    } catch {
      /* Report missing physical state. */
    }
  }
  let powerTelemetry: Raw | null = null;
  if (battery.status === "fulfilled") {
    try {
      powerTelemetry = array(parse(battery.value))[0] ?? null;
    } catch {
      /* Current power remains unreported when optional telemetry is unavailable. */
    }
  }
  return parseMacScan(
    JSON.parse(system.value),
    registry,
    `macOS ${version.status === "fulfilled" ? version.value.trim() : ""}`,
    Date.now() - start,
    physicalPorts,
    powerTelemetry,
  );
}
