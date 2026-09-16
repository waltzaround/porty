import type { ConnectedDevice, Port } from "./types";
import { monitorAssociations } from "./monitor-associations";

export interface DisplayConnection {
  device: ConnectedDevice;
  evidence: "reported" | "inferred";
  reason: string;
}
export interface PhysicalDeviceGroup {
  id: string;
  name: string;
  kind: "dock" | "hub" | "monitor";
  members: ConnectedDevice[];
  upstreamPortId?: string;
  parentGroupId?: string;
  displays: DisplayConnection[];
  displayLink: boolean;
  // Only the sole directly connected enclosure can summarize host charging.
  powerPort?: Port;
  linkSpeed?: string;
}

export type LocatedDevice = ConnectedDevice & { portId?: string };
export function locatedDevices(
  ports: Port[],
  inventory: ConnectedDevice[],
): LocatedDevice[] {
  return [
    ...ports.flatMap((p) => p.devices.map((d) => ({ ...d, portId: p.id }))),
    ...inventory,
  ].filter(
    (d, i, all) => !d.id || all.findIndex((other) => other.id === d.id) === i,
  );
}

// Physical membership follows IDs and captive parent links. Product names only
// choose the label after membership is established; they never merge devices.
export function physicalDeviceGroups(
  ports: Port[],
  input: LocatedDevice[],
): PhysicalDeviceGroup[] {
  const devices = input.filter(
    (d, i) => d.id && input.findIndex((other) => other.id === d.id) === i,
  );
  const hubs = devices.filter((d) => d.kind === "hub");
  const pairs = new Map<string, LocatedDevice[]>();
  for (const hub of hubs) {
    const peers = hubs.filter(
      (d) =>
        d.portId === hub.portId &&
        d.usb?.containerId &&
        d.usb.containerId === hub.usb?.containerId &&
        d.usb.route !== undefined &&
        d.usb.route === hub.usb?.route,
    );
    const companion =
      peers.length === 2 &&
      peers.filter((d) => d.linkSpeed === "480 Mb/s").length === 1 &&
      peers.filter((d) => /^(5|10|20) Gb\/s/.test(d.linkSpeed ?? "")).length ===
        1;
    const branches = companion ? peers : [hub];
    const key = branches
      .map((d) => d.id!)
      .sort()
      .join("+");
    pairs.set(key, branches);
  }
  const pairOf = new Map(
    [...pairs].flatMap(([key, branches]) =>
      branches.map((d) => [d.id!, key] as const),
    ),
  );
  function root(key: string): string {
    const seen = new Set<string>();
    while (!seen.has(key)) {
      seen.add(key);
      const parents = pairs
        .get(key)!
        .map((d) =>
          d.usb?.internal === true && d.parentId
            ? pairOf.get(d.parentId)
            : undefined,
        );
      if (
        !parents.length ||
        !parents[0] ||
        parents.some((p) => p !== parents[0]) ||
        seen.has(parents[0])
      )
        break;
      key = parents[0];
    }
    return key;
  }
  const groups = new Map<string, PhysicalDeviceGroup>();
  const owner = new Map<string, PhysicalDeviceGroup>();
  for (const [key, branches] of pairs) {
    const rootKey = root(key),
      roots = pairs.get(rootKey)!;
    if (!groups.has(rootKey))
      groups.set(rootKey, {
        id: `physical:${rootKey}`,
        name: roots[0].name,
        kind: "hub",
        members: [],
        upstreamPortId: roots[0].portId,
        displays: [],
        displayLink: false,
        linkSpeed:
          [
            ...new Set(
              roots.flatMap((d) => (d.linkSpeed ? [d.linkSpeed] : [])),
            ),
          ].join(" + ") || undefined,
      });
    const group = groups.get(rootKey)!;
    for (const branch of branches) {
      group.members.push(branch);
      owner.set(branch.id!, group);
    }
  }
  // Walk only non-removable links; a removable graphics adapter stays separate.
  for (let pass = 0; pass < devices.length; pass++) {
    let added = false;
    for (const d of devices) {
      const parent = d.parentId ? owner.get(d.parentId) : undefined;
      if (
        owner.has(d.id!) ||
        d.kind === "display" ||
        d.kind === "power" ||
        d.usb?.internal !== true ||
        !parent ||
        parent.upstreamPortId !== d.portId
      )
        continue;
      parent.members.push(d);
      owner.set(d.id!, parent);
      added = true;
    }
    if (!added) break;
  }
  // Standalone USB graphics adapters are also distinct physical devices.
  for (const d of devices.filter(
    (d) => d.kind !== "hub" && d.usb?.vendorId === 0x17e9 && !owner.has(d.id!),
  )) {
    const group: PhysicalDeviceGroup = {
      id: `physical:${d.id}`,
      name: d.name,
      kind: "dock",
      members: [d],
      upstreamPortId: d.portId,
      displays: [],
      displayLink: true,
      linkSpeed: d.linkSpeed,
    };
    groups.set(d.id!, group);
    owner.set(d.id!, group);
  }
  for (const [key, group] of groups) {
    const roots = pairs.get(key) ?? group.members;
    const parentGroups = roots.flatMap((d) =>
      d.parentId && owner.get(d.parentId) ? [owner.get(d.parentId)!] : [],
    );
    if (
      parentGroups.length === roots.length &&
      parentGroups.every((p) => p === parentGroups[0]) &&
      parentGroups[0] !== group
    )
      group.parentGroupId = parentGroups[0].id;
    group.displayLink = group.members.some((d) => d.usb?.vendorId === 0x17e9);
    const named =
      group.members.find(
        (d) => /\bdock(?:ing)?\b/i.test(d.name) && !/^generic\b/i.test(d.name),
      ) ?? group.members.find((d) => d.usb?.vendorId === 0x17e9);
    if (named) group.name = named.name;
    if (named || group.displayLink) group.kind = "dock";
  }
  const result = [...groups.values()];
  const enclosure = monitorAssociations(devices);
  const displays = devices.filter(
    (d) =>
      d.kind === "display" &&
      !["virtual", "internal"].includes(d.displayRoute?.transport ?? ""),
  );
  const assigned = new Set<string>();
  function attach(
    group: PhysicalDeviceGroup,
    device: ConnectedDevice,
    evidence: DisplayConnection["evidence"],
    reason: string,
  ) {
    group.displays.push({ device, evidence, reason });
    assigned.add(device.id!);
    if (group.kind !== "monitor") group.kind = "dock";
  }
  for (const display of displays) {
    const matching = result.filter((g) =>
      g.members.some((d) => enclosure.get(d.id!)?.id === display.id),
    );
    if (matching.length === 1) {
      const group = matching[0];
      group.kind = "monitor";
      group.name = display.name;
      attach(
        group,
        display,
        "reported",
        "Display and USB hub share an OS-reported physical device identity.",
      );
      continue;
    }
    if (display.displayRoute?.deviceId) {
      const target = owner.get(display.displayRoute.deviceId);
      // Conflicting host routes are not resolved by presentation heuristics.
      if (
        target &&
        (!display.portId ||
          !target.upstreamPortId ||
          target.upstreamPortId === display.portId)
      )
        attach(
          target,
          display,
          "reported",
          "Display adapter ancestry matches this device.",
        );
      continue;
    }
    if (!display.portId) continue;
    const candidates = result.filter(
      (g) => g.upstreamPortId === display.portId && !g.parentGroupId,
    );
    if (candidates.length !== 1) continue;
    const target = candidates[0];
    // Preserve the familiar USB-C monitor label when this connection has a
    // single display and no separately identified dock enclosure.
    if (
      target.kind === "hub" &&
      displays.filter((d) => d.portId === display.portId).length === 1 &&
      display.portMapping
    ) {
      target.kind = "monitor";
      target.name = display.name;
    }
    attach(
      target,
      display,
      "inferred",
      "Display and USB share this connection; the enclosure boundary is not reported.",
    );
  }
  const videoPort = (p: Port) =>
    ["USB-C", "HDMI", "DisplayPort", "Display (unclassified)"].includes(
      p.connector,
    );
  const possible = result.filter((g) => {
    const port = ports.find((p) => p.id === g.upstreamPortId);
    return (
      g.displayLink ||
      (!g.parentGroupId &&
        port?.connection?.active &&
        port.connection.transports.some((t) =>
          /DisplayPort|HDMI|Thunderbolt|CIO/i.test(t),
        ))
    );
  });
  // This fallback needs a complete, quiet host-port inventory. It is labelled
  // inference and recalculated on every scan; missing ports are not "disconnected".
  if (possible.length === 1) {
    const target = possible[0],
      port = ports.find((p) => p.id === target.upstreamPortId);
    const otherGraphics = devices.some(
      (d) =>
        d.usb?.vendorId === 0x17e9 &&
        !target.members.some((m) => m.id === d.id),
    );
    if (
      port?.connection?.active &&
      !otherGraphics &&
      ports
        .filter(videoPort)
        .every((p) => p === port || p.connection?.active === false)
    ) {
      for (const display of displays.filter(
        (d) =>
          !assigned.has(d.id!) &&
          !d.portId &&
          !d.displayRoute?.deviceId &&
          !d.physicalDeviceId,
      )) {
        if (display.displayRoute?.transport === "usb" && !target.displayLink)
          continue;
        attach(
          target,
          display,
          "inferred",
          "Only one display-capable dock connection is active. The operating system does not report this display’s exact route.",
        );
      }
    }
  }
  for (const group of result) {
    const port = ports.find((p) => p.id === group.upstreamPortId);
    if (
      port?.connection?.active &&
      !group.parentGroupId &&
      group.members.every(
        (d) => !d.parentId || group.members.some((m) => m.id === d.parentId),
      ) &&
      result.filter((g) => g.upstreamPortId === port.id && !g.parentGroupId)
        .length === 1
    )
      group.powerPort = port;
  }
  return result;
}
