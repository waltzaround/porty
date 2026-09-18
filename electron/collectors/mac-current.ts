import type {
  ConnectedDevice,
  DisplayResolution,
  Port,
} from "../../shared/types";
import { detected } from "../../shared/profiles";
type Raw = Record<string, any>;

export function readDisplayIdentity(display: Raw): string | undefined {
  const vendor = String(display["_spdisplays_display-vendor-id"] ?? "");
  const product = String(display["_spdisplays_display-product-id"] ?? "");
  if (!/^[\da-f]{1,4}$/i.test(vendor) || !/^[\da-f]{1,4}$/i.test(product))
    return;
  return `${parseInt(vendor, 16)}:${parseInt(product, 16)}`;
}

function displayIdentities(nodes: Raw[]): string[] {
  return nodes.flatMap((node) => {
    const edid = node.EDID;
    const identity =
      node.IOObjectClass === "IOPortTransportStateDisplayPort" &&
      node.Active === true &&
      edid instanceof Uint8Array &&
      edid.length >= 128 &&
      [0, 255, 255, 255, 255, 255, 255, 0].every((byte, i) => edid[i] === byte)
        ? // Only manufacturer/product bytes are used. Serial bytes stay out of the scan.
          [`${(edid[8] << 8) | edid[9]}:${edid[10] | (edid[11] << 8)}`]
        : [];
    return [
      ...identity,
      ...displayIdentities(
        Array.isArray(node.IORegistryEntryChildren)
          ? node.IORegistryEntryChildren
          : [],
      ),
    ];
  });
}

export function readCurrentDisplayMode(
  display: Raw,
): DisplayResolution | undefined {
  const text = String(
    display._spdisplays_resolution ?? display.spdisplays_resolution ?? "",
  );
  const logical = text.match(/(\d+)\s*[x×]\s*(\d+)/i);
  const backing = String(display._spdisplays_pixels ?? "").match(/(\d+)\s*[x×]\s*(\d+)/i);
  const pixels = logical ?? backing;
  if (!pixels || Number(pixels[1]) <= 0 || Number(pixels[2]) <= 0) return;
  const hz =
    text.match(/(?:@|at)\s*(\d+(?:\.\d+)?)\s*Hz/i) ??
    String(display.spdisplays_refresh_rate ?? "").match(
      /^(\d+(?:\.\d+)?)(?:\s*Hz)?$/i,
    );
  return {
    resolution: `${pixels[1]} × ${pixels[2]}`,
    width: Number(pixels[1]),
    height: Number(pixels[2]),
    ...(hz && Number(hz[1]) > 0 ? { refreshHz: Number(hz[1]) } : {}),
    ...(logical && backing && (logical[1] !== backing[1] || logical[2] !== backing[2]) ? {
      logicalWidth: Number(logical[1]), logicalHeight: Number(logical[2]),
      pixelWidth: Number(backing[1]), pixelHeight: Number(backing[2]),
      hiDPI: Number(backing[1]) > Number(logical[1]) && Number(backing[2]) > Number(logical[2]),
    } : {}),
  };
}

// Match active port EDIDs to System Information by manufacturer/product, only
// when the relationship is unique. Identical monitors remain ambiguous.
export function attachCurrentDisplay(
  ports: Port[],
  monitors: ConnectedDevice[],
  physical: Raw[] = [],
) {
  const routes = physical
    .filter((node) => node.ConnectionActive === true)
    .flatMap((node) => {
      const id =
        node.PortTypeDescription === "USB-C"
          ? `mac-usbc-${node.PortNumber}`
          : node.PortTypeDescription === "HDMI"
            ? "mac-hdmi"
            : undefined;
      const port = ports.find((p) => p.id === id);
      return port
        ? [
            ...new Set(displayIdentities(node.IORegistryEntryChildren ?? [])),
          ].map((identity) => ({ port, identity }))
        : [];
    });
  let matched = false;
  for (const monitor of monitors) {
    if (
      ['usb', 'virtual', 'internal'].includes(monitor.displayRoute?.transport ?? '') ||
      !monitor.displayIdentity ||
      monitors.filter((d) => d.displayIdentity === monitor.displayIdentity)
        .length !== 1
    )
      continue;
    const candidates = routes.filter(
      (route) => route.identity === monitor.displayIdentity,
    );
    if (candidates.length !== 1) continue;
    monitor.displayRoute = { ...monitor.displayRoute, transport: 'native' };
    monitor.portMapping = "Monitor matched to this port’s active display identity.";
    candidates[0].port.devices.push({ ...monitor });
    matched = true;
  }
  if (matched || routes.length) return;
  if (ports.some(p => p.devices.some(d => d.usb?.vendorId === 0x17e9)) || monitors.some(d => ['usb', 'virtual', 'internal'].includes(d.displayRoute?.transport ?? ''))) return;
  // When identity is unavailable, a single native monitor and a single active
  // video connection can still be associated, with the inference disclosed.
  if (monitors.length !== 1) return;
  const videoPorts = ports.filter((p) =>
    ["USB-C", "HDMI", "DisplayPort"].includes(p.connector),
  );
  const active = videoPorts.filter(
    (p) =>
      p.connection?.active &&
      p.connection.transports.some((t) => /DisplayPort|HDMI/i.test(t)),
  );
  if (
    active.length !== 1 ||
    videoPorts.some((p) => p !== active[0] && p.connection?.active !== false)
  )
    return;
  monitors[0].displayRoute = { ...monitors[0].displayRoute, transport: 'native' };
  active[0].devices.push({
    ...monitors[0],
    portMapping:
      "Port association inferred from the only active native display connection.",
  });
}

const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function applyCurrentPower(ports: Port[], battery: Raw | null) {
  if (battery?.ExternalConnected !== true) return;
  const power = battery.PowerTelemetryData?.SystemPowerIn;
  if (!nonnegative(power)) return;
  const inputs = ports.filter(
    (p) =>
      p.connection?.active &&
      p.connection.power.some((c) => c.label === "Selected power input"),
  );
  if (inputs.length !== 1) return; // System-wide telemetry cannot identify competing inputs.
  const port = inputs[0];
  const selected = port
    .connection!.powerSources?.find((s) => s.name === "USB-PD")
    ?.profiles.find((p) => p.selected);
  const adapter = battery.AdapterDetails;
  if (
    !selected ||
    adapter?.AdapterVoltage !== Math.round(selected.volts * 1000) ||
    adapter?.Current !== Math.round(selected.amps * 1000)
  )
    return;
  const watts = power / 1000;
  if (watts > selected.watts * 1.1) return; // Ignore inconsistent plug/negotiation snapshots.
  port.connection!.power.unshift(
    detected(
      "Current power input",
      `${Number(watts.toFixed(1))} W`,
      "Latest macOS power telemetry at the Mac’s input, including system use and battery charging. Associated with the only reported USB-PD input whose contract matches the active adapter. Refreshed with each scan; accessory output is not measured here.",
    ),
  );
}
