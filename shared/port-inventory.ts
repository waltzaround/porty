import type { ConnectedDevice, Connector, Port, Scan } from './types';
import { monitorAssociations } from './monitor-associations';

export interface DevicePortGroup { id: string; name: string; detail: string; ports: Port[] }
type Hub = { key: string; branches: ConnectedDevice[] };
const networkDevice = (device: ConnectedDevice) => /ethernet|\bLAN\b|10[\/_]100[\/_]1000/i.test(device.name);

function row(id: string, name: string, connector: Connector, devices: ConnectedDevice[], status: Port['status'], note: string): Port {
  const links = [...new Set(devices.flatMap(d => d.linkSpeed ? [d.linkSpeed] : []))];
  return { id, name, connector, devices, status, location: 'Attached device', protocol: connector === 'Ethernet' ? 'Ethernet interface' : connector === 'Display (unclassified)' ? 'Display connection' : 'USB', evidence: 'detected', source: 'Detected device inventory', note,
    capabilities: links.length && connector !== 'Ethernet' ? [{ label: 'Current link', value: links.join(' + '), evidence: 'detected', detail: 'Negotiated USB device link; not a cable rating or network speed.' }] : [],
  };
}

// Pair only a unique USB 2/3 hub pair with a shared container AND upstream route.
// Names alone are not identity; separate hubs can use identical product names.
function companionHubs(devices: ConnectedDevice[]): Hub[] {
  const grouped = new Map<string, ConnectedDevice[]>();
  for (const [i, hub] of devices.filter(d => d.kind === 'hub').entries()) {
    const key = hub.usb?.containerId && hub.usb.route !== undefined
      ? `${hub.usb.containerId}:${hub.usb.route}` : hub.id ?? `hub-${i}`;
    grouped.set(key, [...(grouped.get(key) ?? []), hub]);
  }
  return [...grouped].flatMap(([key, branches]) => {
    const slow = branches.filter(d => d.linkSpeed === '480 Mb/s');
    const fast = branches.filter(d => /^(5|10|20) Gb\/s/.test(d.linkSpeed ?? ''));
    return branches.length === 2 && slow.length === 1 && fast.length === 1
      ? [{ key, branches }]
      : branches.map((branch, i) => ({ key: `${key}:${i}`, branches: [branch] }));
  });
}

// Presentation groups never rewrite host ancestry or power attribution.
// Captive links stay in the device inspector, but are not counted as sockets.
export function portInventory(scan: Scan): DevicePortGroup[] {
  const groups: DevicePortGroup[] = [{ id: 'host', name: scan.machine.name, detail: 'Built-in ports', ports: scan.ports }];
  const attached = scan.ports.flatMap(p => p.devices);
  const associations = monitorAssociations([...attached, ...scan.devices]);
  const enclosures = new Map<string, DevicePortGroup>();
  function enclosure(device: ConnectedDevice) {
    const display = device.id ? associations.get(device.id) : undefined;
    if (!display) return undefined;
    if (!enclosures.has(display.id!)) {
      const target = { id: `monitor:${display.id}`, name: display.name, detail: 'Display and USB hub matched by physical device identity', ports: [] };
      enclosures.set(display.id!, target);
      groups.push(target);
    }
    return enclosures.get(display.id!);
  }
  const unmapped = scan.devices.filter(d => !attached.some(a => d.id ? a.id === d.id : a.name === d.name && a.detail === d.detail));
  const sources = [...scan.ports.map(port => ({ port, devices: port.devices })), { port: undefined, devices: unmapped }];
  for (const { port, devices: input } of sources) {
    const devices = input.filter((d, i) => !d.id || input.findIndex(other => other.id === d.id) === i);
    const hubs = companionHubs(devices);
    const hubByDevice = new Map(hubs.flatMap(h => h.branches.flatMap(d => d.id ? [[d.id, h] as const] : [])));
    const monitors = devices.filter(d => d.kind === 'display');
    // A shared connector establishes a connection group, not necessarily the
    // enclosure of every component (a dock can sit before a monitor).
    const monitor = port?.connector === 'USB-C' && monitors.length === 1 && monitors[0].portMapping ? monitors[0] : undefined;
    const ownerGroups = new Map<string, DevicePortGroup>();
    const baseDetail = port ? `Connected to ${scan.machine.name} · ${port.name}` : 'Physical upstream mapping not reported';
    function ancestorHub(hub: Hub): Hub {
      const seen = new Set<Hub>();
      while (!seen.has(hub)) {
        seen.add(hub);
        const parents = hub.branches.map(d => d.usb?.internal === true && d.parentId ? hubByDevice.get(d.parentId) : undefined);
        if (!parents.length || parents.some(p => !p || p !== parents[0])) break;
        hub = parents[0]!;
      }
      return hub;
    }
    function group(key: string, name: string, detail = baseDetail) {
      if (!ownerGroups.has(key)) ownerGroups.set(key, { id: `device:${port?.id ?? 'system'}:${key}`, name, detail, ports: [] });
      return ownerGroups.get(key)!;
    }
    function owner(hub: Hub) {
      const root = ancestorHub(hub);
      const matched = root.branches.map(enclosure);
      if (matched[0] && matched.every(group => group === matched[0])) return matched[0];
      if (monitor && root.branches.every(d => !d.parentId && !d.parentName))
        return group(monitor.id ?? monitor.name, monitor.name, `${baseDetail} · Display and USB share this connection`);
      const first = root.branches[0];
      return group(root.key, first.name, first.parentName ? `Via ${first.parentName}${port ? ` · ${port.name}` : ''}` : baseDetail);
    }
    for (const hub of hubs) {
      const target = owner(hub);
      const children = devices.filter(d => d.parentId
        ? hub.branches.some(b => b.id === d.parentId)
        : !!d.parentName && hub.branches.some(b => b.name === d.parentName) && devices.filter(b => b.name === d.parentName && b.kind === 'hub').length === 1);
      const covered = new Set<ConnectedDevice>();
      const sockets = new Map<string, NonNullable<ConnectedDevice['hubPorts']>>();
      hub.branches.forEach((branch, branchIndex) => (branch.hubPorts ?? []).forEach((hp, index) => {
        const key = hp.number > 0 ? String(hp.number) : `${branchIndex}:${index}`;
        sockets.set(key, [...(sockets.get(key) ?? []), hp]);
      }));
      for (const [key, paths] of [...sockets].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
        const members = children.filter(d => paths.some(hp => hp.deviceIds?.length ? !!d.id && hp.deviceIds.includes(d.id) : hp.devices.includes(d.name) && children.filter(c => c.name === d.name).length === 1));
        members.forEach(d => covered.add(d));
        // A captive USB 3 path can have an idle USB 2 companion. Neither is a socket.
        if (paths.some(p => p.internal === true)) continue;
        const connectors = [...new Set(paths.map(p => p.connector))].filter(c => c !== 'USB (unclassified)');
        const connector = connectors.length === 1 ? connectors[0] : 'USB (unclassified)';
        const status = members.length || paths.some(p => p.status === 'connected') ? 'connected' : paths.every(p => p.status === 'available') ? 'available' : 'unknown';
        target.ports.push(row(`${target.id}:${hub.key}:port:${key}`, `USB port ${target.ports.filter(p => p.connector.startsWith('USB')).length + 1}`, connector, members, status,
          `Reported downstream socket on ${hub.branches[0].name}, hub port ${key}. ${paths.length > 1 ? 'USB 2 and USB 3 companion paths are combined. ' : ''}Socket position on the enclosure is not reported.`));
      }
      for (const child of children.filter(d => !covered.has(d) && d.usb?.internal !== true))
        target.ports.push(row(`${target.id}:link:${child.id ?? target.ports.length}`, child.name, 'USB (unclassified)', [child], 'connected', 'Detected downstream connection. Socket number and connector shape were not reported.'));
    }
    for (const [i, device] of devices.entries()) {
      if (device.kind === 'power' || device.kind === 'hub') continue;
      if (device.kind === 'display') {
        const target = enclosure(device) ?? group(device.id ?? device.name, device.name, monitor === device ? `${baseDetail} · Display and USB share this connection` : port ? baseDetail : `${device.detail} · Host socket not reported`);
        target.ports.push(row(`${target.id}:display`, 'Active display input', 'Display (unclassified)', [device], 'connected', device.id && associations.has(device.id) ? 'Display and USB hub share an OS-reported physical device identity. Each connection keeps its own upstream route; the display host socket may be unreported.' : port ? 'Current display route. USB components in this group share the host connection; the operating system does not identify every enclosure boundary.' : 'Active display reported by the operating system. Physical host socket and USB hub ownership are not reported.'));
      } else if (networkDevice(device)) {
        const parent = device.parentId ? hubByDevice.get(device.parentId) : undefined;
        const target = device.usb?.internal === true && parent ? owner(parent) : group(device.id ?? `network-${i}`, device.name, device.parentName ? `Via ${device.parentName}${port ? ` · ${port.name}` : ''}` : baseDetail);
        target.ports.push(row(`${target.id}:ethernet:${device.id ?? i}`, 'Ethernet', 'Ethernet', [device], 'unknown', 'One detected Ethernet adapter. Its USB interfaces are part of this adapter. Cable presence and network link speed are not reported by the USB inventory.'));
      } else if (!port && !device.parentId && !device.parentName && device.usb?.internal !== true) {
        const target = group(device.id ?? `usb-${i}`, device.name);
        target.ports.push(row(`${target.id}:connection`, 'Detected USB connection', 'USB (unclassified)', [device], 'connected', 'Device reported in system inventory. Physical upstream port and connector shape are not reported.'));
      }
    }
    groups.push(...ownerGroups.values());
  }
  return groups;
}
