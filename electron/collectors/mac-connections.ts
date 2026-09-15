import type { ConnectedDevice, Port } from "../../shared/types";
import { detected, unknown } from "../../shared/profiles";
import {
  readCable,
  readPowerSources,
  readConnectionDiagnostics,
} from "./whatcable";
type Raw = Record<string, any>;
export const children = (n: Raw): Raw[] =>
  Array.isArray(n.IORegistryEntryChildren) ? n.IORegistryEntryChildren : [];
export function descendants(nodes: Raw[]): Raw[] {
  return nodes.flatMap((n) => [n, ...descendants(children(n))]);
}
// Keep registry children out of the property list and preserve the scanner's
// existing exclusion of device serial numbers and UUIDs.
const visibleProperty = (key: string) =>
  key !== "IORegistryEntryChildren" && !/serial|uuid/i.test(key);
function formatProperty(value: unknown): string {
  if (value instanceof Uint8Array)
    return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
  if (Array.isArray(value)) return `[${value.map(formatProperty).join(", ")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value).filter(([key]) => visibleProperty(key))
      .map(([key, entry]) => `${key}: ${formatProperty(entry)}`).join(", ")}}`;
  return String(value);
}
export function readIOKitProperties(node: Raw) {
  return Object.entries(node).filter(([key]) => visibleProperty(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value: formatProperty(value) }));
}
// Interfaces inherit product names and IDs from their device. Those properties
// alone do not make an interface (or a function driver) another USB device.
const isDevice = (n: Raw) => /^(?:IOUSBHostDevice|IOUSBDevice)$/.test(n.IOObjectClass ?? "");
const deviceName = (n: Raw) =>
  String(n["USB Product Name"] ?? (n.IORegistryEntryName !== "IOUSBHostDevice" ? n.IORegistryEntryName : undefined) ?? (Number(n.bDeviceClass) === 9 ? "USB hub" : "USB device"));

function registryNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (value instanceof Uint8Array && value.length > 0 && value.length <= 4)
    return value.reduce((total, byte, i) => total + byte * 2 ** (8 * i), 0);
}
const portNumber = (node: Raw) => registryNumber(node.PortNumber ?? node["usb-port-number"] ?? node.port);
function internalPort(node: Raw): boolean | undefined {
  // tIOUSBHostPortType in Apple's IOUSBHostFamilyDefinitions.h:
  // 0 standard, 1 captive, 2 internal, 5 USB-C. Missing is not external.
  const type = registryNumber(node["usb-port-type"] ?? node.PortType);
  return type === 1 || type === 2 ? true : type === 0 || type === 5 ? false : undefined;
}

export function readUSBDevices(
  nodes: Raw[],
  parentName?: string,
  parentId?: string,
): ConnectedDevice[] {
  const containers = new Map<string, string>();
  function walk(nodes: Raw[], parentName?: string, parentId?: string, route = "", internal?: boolean): ConnectedDevice[] {
  return nodes.flatMap((n) => {
    if (!isDevice(n)) {
      const hubPort = /USB.*HubPort/.test(n.IOObjectClass ?? "");
      const number = hubPort ? portNumber(n) : undefined;
      return walk(children(n), parentName, parentId, number ? `${route}/${number}` : route, hubPort ? internalPort(n) : internal);
    }
    const name = deviceName(n);
    const hub =
      Number(n.bDeviceClass) === 9 || /USB.*Hub/.test(n.IOObjectClass ?? "");
    const speeds: Record<number, string> = {
      0: "1.5 Mb/s",
      1: "12 Mb/s",
      2: "480 Mb/s",
      3: "5 Gb/s",
      4: "10 Gb/s or higher",
    };
    // Hub interface/driver layers can sit between the hub device and port nodes.
    function hubPorts(branch: Raw[]): Raw[] {
      return branch.flatMap((c) =>
        isDevice(c)
          ? []
          : /USB.*HubPort/.test(c.IOObjectClass ?? "")
            ? [c]
            : hubPorts(children(c)),
      );
    }
    const rawContainer = typeof n.kUSBContainerID === "string" ? n.kUSBContainerID.toLowerCase() : undefined;
    if (rawContainer && !/^0+$/.test(rawContainer.replaceAll("-", "")) && !containers.has(rawContainer))
      containers.set(rawContainer, `usb-container-${n.IORegistryEntryID ?? n.locationID ?? containers.size}`);
    const device: ConnectedDevice = {
      id:
        n.IORegistryEntryID !== undefined
          ? `usb-${n.IORegistryEntryID}`
          : n.locationID !== undefined
            ? `usb-location-${n.locationID}`
            : undefined,
      name,
      parentName,
      parentId,
      usb: {
        containerId: rawContainer ? containers.get(rawContainer) : undefined,
        vendorId: registryNumber(n.idVendor),
        productId: registryNumber(n.idProduct),
        locationId: registryNumber(n.locationID),
        route,
        internal,
      },
      linkSpeed: speeds[n["Device Speed"] ?? n.DeviceSpeed],
      kind: hub ? "hub" : "device",
      detail: [
        n["USB Vendor Name"],
        hub ? "USB hub" : "USB",
        speeds[n["Device Speed"] ?? n.DeviceSpeed],
      ]
        .filter(Boolean)
        .join(" · "),
      ...(hub
        ? {
            hubPorts: hubPorts(children(n)).map((p) => {
              const attached = walk(children(p)).filter(d => !d.parentName);
              return {
                number: portNumber(p) ?? 0,
                internal: internalPort(p),
                connector:
                  p.UsbConnector === 0 || p.UsbConnector === 3
                    ? ("USB-A" as const)
                    : p.UsbCPortNumber ||
                        p.UsbConnector === 9 ||
                        p.UsbConnector === 10
                      ? ("USB-C" as const)
                      : ("USB (unclassified)" as const),
                status: attached.length
                  ? ("connected" as const)
                  : ("available" as const),
                devices: attached.map((d) => d.name),
                deviceIds: attached.flatMap((d) => d.id ? [d.id] : []),
              };
            }),
          }
        : {}),
    };
    return [device, ...walk(children(n), name, device.id, route)];
  });
  }
  return walk(nodes, parentName, parentId);
}

export function applyPhysicalConnections(ports: Port[], physical: Raw[]) {
  for (const node of physical) {
    const type = node.PortTypeDescription;
    const id =
      type === "USB-C"
        ? `mac-usbc-${node.PortNumber}`
        : type === "MagSafe 3"
          ? "mac-magsafe"
          : type === "HDMI"
            ? "mac-hdmi"
            : type === "SD Card"
              ? "mac-sd"
              : undefined;
    if (!id || typeof node.ConnectionActive !== "boolean") continue;
    const port = ports.find((p) => p.id === id);
    if (!port) continue;
    const active = node.ConnectionActive;
    const branch = descendants(children(node));
    const transports =
      active && Array.isArray(node.TransportsActive)
        ? node.TransportsActive.map(String)
        : [];
    port.connection = {
      active, transports, cable: [], power: [],
      iokitProperties: readIOKitProperties(node),
    };
    // Enumeration and physical connection are independent. Keep an enumerated device
    // connected if the two OS snapshots happened on either side of a plug event.
    port.status = active || port.devices.length ? "connected" : "available";
    port.note =
      "Connection state includes the physical connector, data devices and power delivery. Cable ratings remain unknown unless explicitly reported.";
    if (!active) continue; // Firmware retains old identities after unplugging.
    const powerSources = readPowerSources(branch);
    port.connection.powerSources = powerSources;
    port.connection.diagnostics = readConnectionDiagnostics(node);
    const pd = powerSources.find((s) => s.name === "USB-PD");
    const selected = pd?.profiles.find((p) => p.selected);
    const watts = selected?.watts;
    if (type === "USB-C" || type === "MagSafe 3") {
      port.connection.cable = readCable(
        node,
        branch,
        (selected?.amps ?? 0) > 3,
      );
    }
    if (watts !== undefined)
      port.connection.power.push(
        detected(
          "Selected power input",
          `${watts} W`,
          `Selected USB-PD contract: ${selected!.volts} V @ ${selected!.amps.toFixed(2)} A. This is an input limit, not measured power draw or accessory output.`,
        ),
      );
    if (pd?.profiles.length)
      port.connection.power.push(
        detected(
          "Charger advertised maximum",
          `${Math.max(...pd.profiles.map((p) => p.watts))} W`,
          "Highest power in the source's reported USB-PD profiles. This is distinct from the selected contract and actual power draw.",
        ),
      );
    const adapter = branch.find(
      (n) =>
        n.IOObjectClass === "IOPortTransportProtocolAppleUVDM" ||
        (n["User String"] && n.ParentComponentName === "SOP"),
    );
    const userString =
      typeof adapter?.["User String"] === "string"
        ? adapter["User String"].trim()
        : "";
    const product =
      typeof adapter?.Product === "string" ? adapter.Product.trim() : "";
    const candidate =
      userString || (!["0", "EV"].includes(product) ? product : "");
    const name =
      candidate && !/[\x00-\x1f\x7f]/.test(candidate)
        ? candidate
        : "USB-C power source";
    if (pd)
      port.devices.push({
        id: `${id}-power`,
        kind: "power",
        name,
        detail: [
          adapter?.Vendor,
          "USB Power Delivery",
          watts !== undefined ? `${watts} W selected input` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
    if (transports.length)
      port.capabilities.push(
        detected(
          "Active connection",
          transports.join(" · "),
          "Transports currently active on this physical connector. CC is the USB-C configuration channel.",
        ),
      );
  }
}
