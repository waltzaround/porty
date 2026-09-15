import type { ConnectedDevice, Port } from "./types";
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
}
export function deviceTopology(
  ports: Port[],
  devices: InventoryDevice[],
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
  // A malformed or cyclic inventory must never make the graph recursive.
  for (const node of nodes) {
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
      parent = nodes.find((n) => n.id === parent)?.parent;
    }
  }
  return nodes;
}
