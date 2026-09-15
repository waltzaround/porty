import test from 'node:test';
import assert from 'node:assert/strict';
import { portInventory } from '../shared/port-inventory';
import { demoScan } from '../shared/demo';
import { parseMacScan } from '../electron/collectors/macos';
import { readUSBDevices } from '../electron/collectors/mac-connections';
import dellTree from './fixtures/mac-dell-usb-tree.json';
import type { ConnectedDevice } from '../shared/types';

function dockScan() {
  const scan = parseMacScan({ SPHardwareDataType: [{ machine_model: 'Mac16,5', chip_type: 'Apple M4 Max' }] }, dellTree, 'macOS');
  const port = scan.ports.find(p => p.id === 'mac-usbc-2')!;
  port.devices.push({ id: 'display', name: 'DELL U2721DE', kind: 'display', detail: '2560 × 1440', portMapping: 'Matched to active display identity' });
  return { scan, port };
}

test('live Dell tree produces one connection group, four sockets and one Ethernet adapter', () => {
  const { scan, port } = dockScan();
  const before = JSON.stringify(scan);
  const groups = portInventory(scan);
  assert.equal(groups.length, 2);
  assert.equal(groups[1].name, 'DELL U2721DE');
  assert.match(groups[1].detail, /Display and USB share this connection/);
  const sockets = groups[1].ports.filter(p => p.connector.startsWith('USB'));
  assert.equal(sockets.length, 4);
  assert.ok(sockets.every(p => p.status === 'available' && !p.devices.length));
  assert.equal(groups[1].ports.filter(p => p.connector === 'Ethernet').length, 1);
  assert.equal(groups[1].ports.filter(p => p.connector === 'Display (unclassified)').length, 1);
  assert.equal(port.devices.filter(d => /LAN/.test(d.name)).length, 1);
  assert.equal(port.devices.filter(d => d.kind === 'hub').length, 4); // Internal branches remain inspectable.
  assert.equal(JSON.stringify(scan), before);
  assert.ok(!before.includes('fixture-container-'));
});

test('grouping uses topology rather than Dell or USB product names', () => {
  const { scan, port } = dockScan();
  for (const d of port.devices) if (d.kind === 'hub') d.name = 'Generic dock hub';
  port.devices.find(d => d.kind === 'display')!.name = 'Another USB-C monitor';
  const group = portInventory(scan)[1];
  assert.equal(group.name, 'Another USB-C monitor');
  assert.equal(group.ports.length, 6);
  // A dock without a display still collapses captive sub-hubs and companions.
  port.devices = port.devices.filter(d => d.kind !== 'display');
  assert.equal(portInventory(scan).length, 2);
  assert.equal(portInventory(scan)[1].ports.length, 5);
});

test('USB 2 accessories on a companion path occupy one downstream socket', () => {
  const { scan, port } = dockScan();
  const hub = port.devices.find(d => d.kind === 'hub' && !d.parentId && d.linkSpeed === '480 Mb/s')!;
  const hp = hub.hubPorts!.find(p => p.number === 1)!;
  const mouse: ConnectedDevice = { id: 'mouse', parentId: hub.id, parentName: hub.name, name: 'Mouse', detail: 'USB', linkSpeed: '12 Mb/s' };
  port.devices.push(mouse); hp.deviceIds = ['mouse']; hp.devices = ['Mouse']; hp.status = 'connected';
  const sockets = portInventory(scan)[1].ports.filter(p => p.connector.startsWith('USB'));
  assert.equal(sockets.length, 4);
  assert.equal(sockets.filter(p => p.status === 'connected').length, 1);
  assert.equal(sockets.find(p => p.status === 'connected')!.devices[0].id, 'mouse');
});

test('external hubs stay separate and missing identity never merges companion sockets', () => {
  const { scan, port } = dockScan();
  const root = port.devices.find(d => d.kind === 'hub' && !d.parentId)!;
  const hp = root.hubPorts!.find(p => p.number === 1)!;
  hp.status = 'connected'; hp.deviceIds = ['external']; hp.devices = ['External hub'];
  port.devices.push({ id: 'external', parentId: root.id, parentName: root.name, name: 'External hub', kind: 'hub', detail: 'USB', usb: { internal: false }, hubPorts: [{ number: 1, connector: 'USB-A', status: 'available', devices: [] }] });
  const groups = portInventory(scan);
  assert.equal(groups.length, 3);
  assert.equal(groups[2].name, 'External hub');
  for (const d of port.devices) if (d.usb) d.usb.containerId = undefined;
  const unpaired = portInventory(scan).find(g => g.name === 'DELL U2721DE')!;
  assert.ok(unpaired.ports.filter(p => p.connector.startsWith('USB')).length > 4);
});

test('ambiguous monitors and independent host cables remain separate', () => {
  const { scan, port } = dockScan();
  port.devices.push({ id: 'second-monitor', name: 'Second monitor', kind: 'display', detail: 'Display', portMapping: 'Same upstream connection' });
  let groups = portInventory(scan);
  assert.equal(groups.find(g => g.name === 'DELL U2721DE')!.ports.length, 1);
  assert.equal(groups.find(g => g.name === 'Second monitor')!.ports.length, 1);
  const secondPort = scan.ports.find(p => p.id === 'mac-usbc-1')!;
  secondPort.devices = structuredClone(port.devices.filter(d => d.kind !== 'display'));
  groups = portInventory(scan);
  assert.equal(new Set(groups.map(g => g.id)).size, groups.length);
  assert.equal(groups.flatMap(g => g.ports).filter(p => p.connector === 'Ethernet').length, 2);
});

test('USB interfaces and driver layers cannot become duplicate physical devices', () => {
  const nodes = [{ IOObjectClass: 'IOUSBHostDevice', IORegistryEntryID: 1, 'USB Product Name': 'USB Ethernet', IORegistryEntryChildren: [
    { IOObjectClass: 'IOUSBHostInterface', IORegistryEntryID: 2, 'USB Product Name': 'USB Ethernet', idVendor: 1, idProduct: 2 },
    { IOObjectClass: 'IOUSBHostInterface', IORegistryEntryID: 3, 'USB Product Name': 'USB Ethernet', idVendor: 1, idProduct: 2 },
    { IOObjectClass: 'AppleUSBHostDeviceUserClient', IORegistryEntryID: 4, 'USB Product Name': 'USB Ethernet' },
  ] }];
  assert.equal(readUSBDevices(nodes).length, 1);
});

test('binary hub port metadata retains real numbering and internal flags', () => {
  const devices = readUSBDevices([{ IOObjectClass: 'IOUSBHostDevice', bDeviceClass: 9, IORegistryEntryID: 1, IORegistryEntryChildren: [
    { IOObjectClass: 'AppleUSB30HubPort', 'usb-port-number': Buffer.from([3, 0, 0, 0]), 'usb-port-type': Buffer.from([1, 0, 0, 0]), IORegistryEntryChildren: [{ IOObjectClass: 'IOUSBHostDevice', IORegistryEntryID: 2 }] },
    { IOObjectClass: 'AppleUSB30HubPort', 'usb-port-number': Buffer.from([2, 0, 0, 0]), 'usb-port-type': Buffer.from([0, 0, 0, 0]) },
  ] }]);
  assert.equal(devices[0].hubPorts![0].number, 3);
  assert.equal(devices[0].hubPorts![0].internal, true);
  assert.equal(devices[0].hubPorts![1].internal, false);
  assert.equal(devices[1].usb?.internal, true);
  assert.equal(devices[1].usb?.route, '/3');
});

test('downstream ports appear under their hub without mutating the host inventory', () => {
  const scan = demoScan();
  const host = scan.ports[0];
  const original = scan.ports.length;
  host.devices = [
    {id:'hub', name:'Monitor USB hub', kind:'hub', detail:'USB hub', hubPorts:[{number:1, connector:'USB-A', status:'connected', devices:['Disk'], deviceIds:['disk']}, {number:2, connector:'USB-A', status:'available', devices:[]}]},
    {id:'disk', parentId:'hub', parentName:'Monitor USB hub', name:'Disk', detail:'USB storage', linkSpeed:'5 Gb/s'},
    {id:'lan', parentId:'hub', parentName:'Monitor USB hub', name:'USB Ethernet', detail:'USB LAN', linkSpeed:'480 Mb/s'},
  ];
  const groups = portInventory(scan);
  assert.equal(groups[0].name, scan.machine.name);
  const hub = groups.find(g => g.name === 'Monitor USB hub')!;
  assert.equal(hub.ports.length, 3);
  assert.equal(hub.ports[0].devices[0].id, 'disk');
  assert.equal(hub.ports[1].status, 'available');
  const ethernet = groups.find(g => g.name === 'USB Ethernet')!.ports[0];
  assert.equal(ethernet.connector, 'Ethernet');
  assert.equal(ethernet.status, 'unknown');
  assert.equal(ethernet.capabilities.length, 0);
  assert.equal(scan.ports.length, original);
});
test('unmapped monitors and USB devices are included without inventing connector shape', () => {
  const scan = demoScan(); scan.ports.forEach(p => { p.devices=[]; });
  scan.devices = [{id:'monitor', name:'Monitor', kind:'display', detail:'1920 x 1080', displayMode:{resolution:'1080p', width:1920, height:1080, refreshHz:60}}, {id:'usb', name:'External USB', detail:'USB'}];
  const groups = portInventory(scan);
  assert.equal(groups.find(g => g.name === 'Monitor')!.ports[0].connector, 'Display (unclassified)');
  assert.equal(groups.find(g => g.name === 'External USB')!.ports[0].connector, 'USB (unclassified)');
});
