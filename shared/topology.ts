import type { ConnectedDevice, Port } from "./types";
import type { PhysicalDeviceGroup } from './device-groups';
import { displayReadings } from './current';
export type InventoryDevice = ConnectedDevice & {
  port: string;
  portId?: string;
};
export interface TopologyNode {
  id: string;
  name: string;
  detail: string;
  parent?: string;
  device?: InventoryDevice;
  port?: Port;
  uncertain?: boolean;
  group?: PhysicalDeviceGroup;
}
export function deviceTopology(
  ports: Port[],
  devices: InventoryDevice[],
  groups: PhysicalDeviceGroup[] = [],
): TopologyNode[] {
  const nodes: TopologyNode[] = [
    { id: "computer", name: "Computer", detail: "Host" },
  ];
  const portIds = new Set(ports.map((port) => port.id));
  for (const port of ports.filter(
    (p) => p.connection?.active || devices.some((d) => d.portId === p.id),
  )) {
    nodes.push({
      id: `port:${port.id}`,
      name: port.name,
      detail: port.protocol,
      parent: "computer",
      port,
    });
  }
  devices.forEach((device, i) => {
    const candidates = devices
      .map((d, index) => ({ d, index }))
      .filter(
        ({ d, index }) =>
          index !== i &&
          d.portId === device.portId &&
          (device.parentId
            ? d.id === device.parentId
            : !!device.parentName &&
              d.name === device.parentName &&
              d.kind === "hub"),
      );
    const knownPort = device.portId && portIds.has(device.portId);
    const parent =
      candidates.length === 1
        ? `device:${candidates[0].index}`
        : knownPort
          ? `port:${device.portId}`
          : "computer";
    nodes.push({
      id: `device:${i}`,
      name: device.name,
      detail: device.linkSpeed || device.kind || "Device",
      device,
      parent,
      uncertain: candidates.length !== 1 && (!!device.parentName || !knownPort),
    });
  });
  const replacement = new Map<string, string>();
  for (const group of groups) {
    for (const node of nodes) if (node.device?.id && group.members.some(d => d.id === node.device!.id)) replacement.set(node.id, group.id);
    const port = ports.find(p => p.id === group.upstreamPortId);
    nodes.push({ id: group.id, name: group.name, detail: group.linkSpeed ?? `${group.displays.length} displays`,
      parent: group.parentGroupId ?? (port ? `port:${port.id}` : 'computer'), uncertain: !port && !group.parentGroupId, group,
      device: { id: group.id, name: group.name, detail: `${group.displays.length} displays · ${group.members.length} integrated components`, kind: 'hub', port: port?.name ?? 'System inventory', portId: port?.id, linkSpeed: group.linkSpeed },
    });
  }
  for (const node of nodes) {
    if (node.parent && replacement.has(node.parent)) node.parent = replacement.get(node.parent);
    const group = groups.find(g => g.displays.some(d => d.device.id === node.device?.id));
    if (group && node.device) {
      const connection = group.displays.find(d => d.device.id === node.device!.id)!;
      node.parent = group.id; node.uncertain = connection.evidence === 'inferred';
      node.name = displayReadings(group.displays.map(d => d.device)).find(d => d.id === node.device!.id)!.label;
      node.device = { ...node.device, parentName: group.name, portMapping: `${connection.evidence === 'inferred' ? 'Inferred: ' : ''}${connection.reason}` };
    }
  }
  const visible = nodes.filter(n => !replacement.has(n.id) && !(n.device?.kind === 'power' && groups.some(g => g.powerPort?.id === n.device?.portId)));
  // A malformed or cyclic inventory must never make the graph recursive.
  for (const node of visible) {
    const seen = new Set([node.id]);
    let parent = node.parent;
    while (parent) {
      if (seen.has(parent)) {
        node.parent =
          node.device?.portId && portIds.has(node.device.portId)
            ? `port:${node.device.portId}`
            : "computer";
        node.uncertain = true;
        break;
      }
      seen.add(parent);
      parent = visible.find((n) => n.id === parent)?.parent;
    }
  }
  return visible;
}
