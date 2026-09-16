import { createHash } from 'node:crypto';
import { windowsContainer } from './windows-container';
import type { ConnectedDevice } from '../../shared/types';
import { mergeWindowsCompanions, type WindowsData, type WindowsPort } from './windows';

const key = (value?: string) => (value ?? '').toLowerCase();
const pathKey = (value: string) => key(value).replace(/^\\[\\?][?\\]\\/, '');
export const windowsDeviceId = (value: string) => `win-device-${createHash('sha256').update(key(value)).digest('hex').slice(0, 16)}`;
const id = windowsDeviceId;
const speed = (p: WindowsPort) => p.Flags & 4 ? '10 Gb/s or higher' : p.Flags & 1 ? '5 Gb/s or higher' : ['1.5 Mb/s', '12 Mb/s', '480 Mb/s', '5 Gb/s or higher'][p.Speed];

export function windowsTopology(data: WindowsData) {
  const enabled = Array.isArray(data.usb?.Hubs) && Array.isArray(data.usb?.Devices);
  const hubs = new Map((data.usb?.Hubs ?? []).map(h => [pathKey(h.Path), h]));
  const hubIds = new Set([...hubs.values()].map(h => key(h.InstanceId)));
  const roots = new Set([...hubs.values()].filter(h => h.IsRoot).map(h => key(h.InstanceId)));
  const raw = data.usb?.Devices ?? [];
  const records = new Map(raw.filter(d => d.InstanceId).map(d => [key(d.InstanceId), d]));
  const byDriver = new Map<string, typeof raw>();
  for (const d of raw) if (d.DriverKey) byDriver.set(key(d.DriverKey), [...(byDriver.get(key(d.DriverKey)) ?? []), d]);
  const ports = data.usb?.Ports ?? [];
  const atPort = new Map<WindowsPort, string>();
  for (const p of ports) {
    const matches = p.Status === 1 && p.DriverKey ? byDriver.get(key(p.DriverKey)) ?? [] : [];
    if (matches.length === 1) atPort.set(p, key(matches[0].InstanceId));
  }
  const devices = new Map<string, ConnectedDevice>();
  const containers = new Map<string, string>();
  function containerFor(value?: string) {
    const identity = windowsContainer(value);
    if (!identity) return undefined;
    if (!containers.has(identity)) containers.set(identity, `container-${containers.size + 1}`);
    return containers.get(identity);
  }
  const routes = new Map<WindowsPort, string>();
  mergeWindowsCompanions(ports).forEach((group, i) => group.forEach(p => routes.set(p, String(i + 1))));
  for (const [instance, d] of records) {
    // Composite interfaces are functions of one physical device, not extra cables.
    if (roots.has(instance) || /&mi_[0-9a-f]{2}/i.test(instance)) continue;
    const p = ports.find(p => atPort.get(p) === instance);
    const parent = key(d.ParentId);
    const parentRecord = records.get(parent);
    if (!p && parentRecord && !hubIds.has(parent)) continue;
    const children = raw.filter(child => key(child.ParentId) === instance);
    const friendly = data.devices?.find(other => key(other.PNPDeviceID) === instance)?.Name ?? d.Name;
    const interfaceNames = [...new Set(children.map(child => data.devices?.find(other => key(other.PNPDeviceID) === key(child.InstanceId))?.Name ?? child.Name).filter(name => !/composite|generic|usb input|usb audio|usb video/i.test(name)))];
    const name = d.BusName || (/composite device/i.test(friendly) && interfaceNames.length === 1 ? interfaceNames[0] : friendly);
    const container = containerFor(d.ContainerId);
    devices.set(instance, {
      id: id(instance), name, kind: hubIds.has(instance) ? 'hub' : 'device',
      physicalDeviceId: container,
      detail: p ? speed(p) ?? 'USB link speed not reported' : 'USB device · upstream port not reported',
      linkSpeed: p ? speed(p) : undefined,
      ...(parentRecord && !roots.has(parent) ? { parentId: id(parent), parentName: parentRecord.Name } : {}),
      usb: { internal: p?.PropertiesKnown ? !p.UserConnectable : undefined,
        vendorId: /^[\dA-F]{4}$/i.test(p?.Vid ?? '') ? parseInt(p!.Vid!, 16) : (/VID_([\dA-F]{4})/i.test(instance) ? parseInt(instance.match(/VID_([\dA-F]{4})/i)![1], 16) : undefined),
        productId: /^[\dA-F]{4}$/i.test(p?.Pid ?? '') ? parseInt(p!.Pid!, 16) : (/PID_([\dA-F]{4})/i.test(instance) ? parseInt(instance.match(/PID_([\dA-F]{4})/i)![1], 16) : undefined),
        containerId: container,
        route: p ? routes.get(p) : undefined,
      },
    });
  }
  for (const device of devices.values()) if (device.parentId) {
    const parent = [...devices.values()].find(d => d.id === device.parentId);
    if (parent) device.parentName = parent.name;
  }
  for (const hub of hubs.values()) {
    const device = devices.get(key(hub.InstanceId));
    if (!device) continue;
    device.hubPorts = mergeWindowsCompanions(ports.filter(p => pathKey(p.Hub) === pathKey(hub.Path)))
      .filter(group => group.some(p => p.PropertiesKnown))
      .map(group => {
        const members = group.flatMap(p => { const d = devices.get(atPort.get(p) ?? ''); return d ? [d] : []; });
        return { number: group[0].Number, connector: group.some(p => p.TypeC) ? 'USB-C' : 'USB (unclassified)',
          status: group.some(p => p.Status === 1) ? 'connected' : group.every(p => p.Status === 0) ? 'available' : 'unknown',
          internal: group.some(p => p.PropertiesKnown && !p.UserConnectable),
          devices: members.map(d => d.name), deviceIds: members.map(d => d.id!),
        };
      });
  }
  function forPort(group: WindowsPort[]) {
    const direct = new Set(group.flatMap(p => atPort.has(p) ? [atPort.get(p)!] : []));
    const result: ConnectedDevice[] = [];
    for (const [instance, device] of devices) {
      let cursor = instance;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        if (direct.has(cursor)) {
          result.push(direct.has(instance) ? { ...device, parentId: undefined, parentName: undefined } : device);
          break;
        }
        seen.add(cursor);
        cursor = key(records.get(cursor)?.ParentId);
      }
    }
    // Preserve occupied ports even if Windows could not resolve their device identity.
    for (const p of group) if (p.Status === 1 && !atPort.has(p)) result.push({
      id: id(`${p.Hub}:${p.Number}`), name: `USB device ${p.Vid ?? 'unknown'}:${p.Pid ?? 'unknown'}`,
      kind: 'device', detail: speed(p) ?? 'USB link speed not reported', linkSpeed: speed(p),
    });
    return result;
  }
  return { enabled, devices: [...devices.values()], forPort, containerFor,
    isHost: (group: WindowsPort[]) => !enabled || group.every(p => hubs.get(pathKey(p.Hub))?.IsRoot === true),
  };
}
