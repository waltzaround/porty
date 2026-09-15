import type { ConnectedDevice } from './types';

// Only explicit enclosure identity is evidence. Names, timing and host ports are not.
export function monitorAssociations(input: ConnectedDevice[]): Map<string, ConnectedDevice> {
  const devices = input.filter((d, i) => d.id && input.findIndex(other => other.id === d.id) === i);
  const result = new Map<string, ConnectedDevice>();
  for (const display of devices.filter(d => d.kind === 'display' && d.physicalDeviceId)) {
    const members = devices.filter(d => d.physicalDeviceId === display.physicalDeviceId);
    if (members.filter(d => d.kind === 'display').length !== 1) continue;
    const hubs = members.filter(d => d.kind === 'hub' && d.usb?.internal !== true);
    // Two branches are accepted only as an unambiguous USB 2/3 companion pair.
    const pair = hubs.length === 2 && hubs[0].usb?.route !== undefined
      && hubs[0].usb.route === hubs[1].usb?.route
      && hubs.filter(d => d.linkSpeed === '480 Mb/s').length === 1
      && hubs.filter(d => /^(5|10|20) Gb\/s/.test(d.linkSpeed ?? '')).length === 1;
    if (hubs.length !== 1 && !pair) continue;
    for (const member of [display, ...hubs]) result.set(member.id!, display);
  }
  return result;
}
