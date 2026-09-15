import type { ConnectedDevice, Connector, Port, Scan } from './types';
export interface DevicePortGroup { id: string; name: string; detail: string; ports: Port[] }

// Keep the host inventory intact; downstream records are a separate presentation
// inventory so they cannot alter physical host mapping or power attribution.
export function portInventory(scan: Scan): DevicePortGroup[] {
  const groups: DevicePortGroup[] = [{ id: 'host', name: scan.machine.name, detail: 'Built-in ports', ports: scan.ports }];
  const seen = new Set<string>();
  const attached = scan.ports.flatMap(port => port.devices.map(device => ({ device, port })));
  const inventory = [...attached, ...scan.devices.filter(d => !attached.some(({ device }) => d.id ? device.id === d.id : device.name === d.name && device.detail === d.detail)).map(device => ({ device, port: undefined }))];
  function row(id: string, name: string, connector: Connector, devices: ConnectedDevice[], status: Port['status'], note: string): Port {
    const links = [...new Set(devices.flatMap(d => d.linkSpeed ? [d.linkSpeed] : []))];
    return { id, name, connector, devices, status, location: 'Attached device', protocol: connector === 'Ethernet' ? 'Ethernet interface' : connector === 'Display (unclassified)' ? 'Display connection' : 'USB', evidence: 'detected', source: 'Detected device inventory', note,
      capabilities: links.length && connector !== 'Ethernet' ? [{ label:'Current link', value:links.join(' + '), evidence:'detected', detail:'Negotiated USB device link; not a cable rating or network speed.' }] : [],
    };
  }
  for (const { device, port } of inventory) {
    const key = device.id ?? `${port?.id ?? 'system'}:${device.name}:${device.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const isNetwork = /ethernet|\bLAN\b|10\/100\/1000/i.test(device.name);
    if (device.kind !== 'hub' && device.kind !== 'display' && !isNetwork && port) continue;
    if (device.kind === 'power') continue;
    const group: DevicePortGroup = { id:`device:${key}`, name:device.name, detail: device.parentName ? `Via ${device.parentName}${port ? ` · ${port.name}` : ''}` : port ? `Connected to ${scan.machine.name} · ${port.name}` : 'Physical upstream mapping not reported', ports:[] };
    if (device.kind === 'hub') {
      const children = inventory.filter(({ device: child, port: upstream }) => upstream?.id === port?.id && (child.parentId ? child.parentId === device.id : child.parentName === device.name && inventory.filter(x => x.port?.id === port?.id && x.device.name === device.name).length === 1)).map(x => x.device);
      const covered = new Set<ConnectedDevice>();
      (device.hubPorts ?? []).forEach((hp, index) => {
        const members = children.filter(d => hp.deviceIds?.length ? !!d.id && hp.deviceIds.includes(d.id) : hp.devices.includes(d.name) && children.filter(c => c.name === d.name).length === 1);
        members.forEach(d => covered.add(d));
        group.ports.push(row(`${group.id}:port:${index}`, `Port ${hp.number || index + 1}`, hp.connector, members, hp.status, 'Reported hub port. USB 2 and USB 3 branches can share a physical socket; a USB connection does not establish an Ethernet cable connection.'));
      });
      for (const child of children.filter(d => !covered.has(d))) {
        group.ports.push(row(`${group.id}:link:${child.id ?? group.ports.length}`, child.name, 'USB (unclassified)', [child], 'connected', 'Detected downstream connection. Socket number and connector shape were not reported.'));
      }
      if (!group.ports.length) group.detail += ' · Downstream port records not reported';
    } else if (device.kind === 'display') {
      group.ports.push(row(`${group.id}:display`, 'Active display input', 'Display (unclassified)', [device], 'connected', 'Current display connection. Input connector and additional monitor sockets are not reported. A separate USB hub is only associated with this monitor when the system reports that relationship.'));
    } else if (isNetwork) {
      group.ports.push(row(`${group.id}:ethernet`, 'Ethernet', 'Ethernet', [device], 'unknown', 'The network adapter is detected. Ethernet cable presence and negotiated network speed are not reported by the USB inventory.'));
    }
    if (!group.ports.length && device.kind !== 'hub') {
      group.ports.push(row(`${group.id}:connection`, 'Detected USB connection', 'USB (unclassified)', [device], 'connected', 'Device reported in system inventory. Physical upstream port and connector shape are not reported.'));
    }
    groups.push(group);
  }
  return groups;
}
