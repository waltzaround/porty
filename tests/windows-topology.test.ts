import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWindowsScan, type WindowsData, type WindowsPort } from '../electron/collectors/windows';
import { portInventory } from '../shared/port-inventory';
import { monitorAssociations } from '../shared/monitor-associations';

const port = (Hub: string, Number: number, DriverKey?: string, extra: Partial<WindowsPort> = {}): WindowsPort => ({
  Hub, Number, DriverKey, PropertiesKnown: true, UserConnectable: true, TypeC: false,
  CompanionPort: 0, Protocols: 2, Flags: 0, Status: DriverKey ? 1 : 0, Speed: 2, ...extra,
});
function fixture(): WindowsData {
  return { usb: {
    Hubs: [
      { Path: 'root', InstanceId: 'USB\\ROOT_HUB30\\PRIVATE_ROOT', IsRoot: true },
      { Path: 'hub-a', InstanceId: 'USB\\VID_1111&PID_2222\\PRIVATE_A', IsRoot: false },
      { Path: 'hub-b', InstanceId: 'USB\\VID_1111&PID_2222\\PRIVATE_B', IsRoot: false },
    ],
    Devices: [
      { InstanceId: 'USB\\ROOT_HUB30\\PRIVATE_ROOT', Name: 'Root hub' },
      { InstanceId: 'USB\\VID_1111&PID_2222\\PRIVATE_A', ParentId: 'USB\\ROOT_HUB30\\PRIVATE_ROOT', DriverKey: 'driver-a', Name: 'Generic USB Hub', BusName: 'Desk hub' },
      { InstanceId: 'USB\\VID_1111&PID_2222\\PRIVATE_B', ParentId: 'USB\\ROOT_HUB30\\PRIVATE_ROOT', DriverKey: 'driver-b', Name: 'Generic USB Hub', BusName: 'Desk hub' },
      { InstanceId: 'USB\\VID_3333&PID_4444\\PRIVATE_CAMERA', ParentId: 'USB\\VID_1111&PID_2222\\PRIVATE_B', DriverKey: 'driver-camera', Name: 'USB Composite Device', BusName: 'Webcam' },
      { InstanceId: 'USB\\VID_3333&PID_4444&MI_00\\PRIVATE_INTERFACE', ParentId: 'USB\\VID_3333&PID_4444\\PRIVATE_CAMERA', Name: 'Webcam' },
      { InstanceId: 'USB\\PRIVATE_FUNCTION', ParentId: 'USB\\VID_3333&PID_4444\\PRIVATE_CAMERA', Name: 'Webcam audio function' },
    ],
    Ports: [port('root', 1, 'driver-a'), port('root', 2, 'driver-b'), port('hub-a', 1), port('hub-b', 1, 'driver-camera'), port('hub-b', 2)],
  } };
}
test('Windows keeps identical hubs separate and assigns a composite webcam to its exact hub socket', () => {
  const scan = parseWindowsScan(fixture());
  assert.equal(scan.ports.length, 2);
  assert.equal(scan.devices.length, 3);
  assert.deepEqual(scan.ports[0].devices.map(d => d.name), ['Desk hub']);
  assert.deepEqual(scan.ports[1].devices.map(d => d.name), ['Desk hub', 'Webcam']);
  const webcam = scan.devices.find(d => d.name === 'Webcam')!;
  const hub = scan.devices.find(d => d.id === webcam.parentId)!;
  assert.equal(hub.kind, 'hub');
  assert.deepEqual(hub.hubPorts?.[0].deviceIds, [webcam.id]);
  assert.equal(hub.hubPorts?.[1].status, 'available');
  const groups = portInventory(scan);
  assert.equal(groups.length, 3);
  assert.equal(groups.filter(g => g.name === 'Webcam').length, 0);
  assert.deepEqual(groups.slice(1).map(g => g.ports.length), [1, 2]);
  assert.ok(!JSON.stringify(scan).includes('PRIVATE'));
  assert.ok(!JSON.stringify(scan).includes('driver-'));
});
test('Windows retains orphan hubs and suppresses their known internal sockets', () => {
  const data = fixture();
  data.usb!.Ports = data.usb!.Ports.filter(p => p.Hub !== 'root');
  data.usb!.Ports[1].UserConnectable = false;
  const scan = parseWindowsScan(data);
  assert.equal(scan.ports.length, 0);
  assert.equal(scan.devices.filter(d => d.kind === 'hub').length, 2);
  const groups = portInventory(scan).slice(1);
  assert.deepEqual(groups.map(g => g.ports.length), [1, 1]);
  assert.ok(groups.every(g => g.detail.includes('not reported')));
});
test('Windows unresolved driver identity stays unreported rather than picking an identical product', () => {
  const data = fixture();
  data.usb!.Ports[0].DriverKey = 'missing-driver';
  const scan = parseWindowsScan(data);
  assert.match(scan.ports[0].devices[0].name, /^USB device/);
  assert.equal(scan.ports[0].devices[0].kind, 'device');
});
test('Windows pairs hub branches only with a common container and explicit companion upstream route', () => {
  const data = fixture();
  const a = data.usb!.Devices![1], b = data.usb!.Devices![2];
  a.ContainerId = b.ContainerId = '12345678-1234-4321-abcd-123456789abc';
  data.usb!.Ports[0].CompanionPort = 2;
  data.usb!.Ports[1].Flags = 1;
  data.usb!.Ports[1].Protocols = 4;
  const scan = parseWindowsScan(data);
  assert.equal(scan.ports.length, 1);
  assert.equal(scan.devices[1].linkSpeed, '5 Gb/s or higher');
  assert.equal(scan.ports[0].capabilities.find(c => c.label === 'Current link')?.value, '480 Mb/s + 5 Gb/s or higher');
  assert.equal(portInventory(scan).length, 2);
  assert.equal(portInventory(scan)[1].ports.length, 2);
  assert.ok(!JSON.stringify(scan).includes(a.ContainerId));
  data.usb!.Ports[0].CompanionPort = 0;
  assert.equal(portInventory(parseWindowsScan(data)).length, 3);
});
test('Windows topology ancestry cycles terminate without inventing a host mapping', () => {
  const data = fixture();
  data.usb!.Ports = [];
  data.usb!.Devices![1].ParentId = data.usb!.Devices![2].InstanceId;
  data.usb!.Devices![2].ParentId = data.usb!.Devices![1].InstanceId;
  const scan = parseWindowsScan(data);
  assert.equal(scan.ports.length, 0);
  assert.equal(scan.devices.length, 3);
  assert.ok(portInventory(scan).length > 1);
});
test('Windows internal motherboard devices remain in inventory without becoming external sockets', () => {
  const data = fixture();
  data.usb!.Devices!.push({ InstanceId: 'USB\\PRIVATE_LIGHTING', ParentId: data.usb!.Devices![0].InstanceId, DriverKey: 'lighting', Name: 'Motherboard lighting' });
  data.usb!.Ports.push(port('root', 3, 'lighting', { UserConnectable: false }));
  const scan = parseWindowsScan(data);
  assert.ok(scan.devices.some(d => d.name === 'Motherboard lighting'));
  assert.equal(scan.ports.length, 2);
  assert.ok(portInventory(scan).every(g => g.name !== 'Motherboard lighting'));
});

const container = '12345678-1234-4321-abcd-123456789abc';
function monitorFixture() {
  const data = fixture();
  data.usb!.Devices![1].ContainerId = container;
  data.displays = { Displays: [{ Id: 'monitor-a', Name: 'Desk monitor', Technology: 10, ContainerId: `{${container.toUpperCase()}}` }] };
  return data;
}
test('exact display/hub identity groups separate cables without changing ancestry or exporting identities', () => {
  const scan = parseWindowsScan(monitorFixture());
  const before = JSON.stringify(scan);
  const groups = portInventory(scan);
  const monitor = groups.find(g => g.name === 'Desk monitor')!;
  assert.equal(groups.length, 3); // Host, paired monitor, independent hub.
  assert.deepEqual(monitor.ports.map(p => p.connector).sort(), ['Display (unclassified)', 'USB (unclassified)']);
  assert.match(monitor.detail, /physical device identity/);
  assert.equal(monitorAssociations(scan.devices).size, 2);
  assert.ok(!scan.ports.some(p => p.devices.some(d => d.kind === 'display')));
  assert.ok(!scan.devices.find(d => d.kind === 'display')!.parentId);
  assert.equal(JSON.stringify(scan), before);
  assert.ok(!before.toLowerCase().includes(container));
});
test('missing, invalid, different and system identities never associate a monitor', () => {
  for (const value of [undefined, '', 'same-name', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-ffff-ffffffffffff', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']) {
    const data = monitorFixture();
    data.displays!.Displays![0].ContainerId = value;
    if (value !== 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') data.usb!.Devices![1].ContainerId = value;
    const scan = parseWindowsScan(data);
    assert.equal(monitorAssociations(scan.devices).size, 0, String(value));
    assert.equal(portInventory(scan).length, 4);
  }
});
test('duplicate display identity, independent hubs and built-in panels are ambiguous', () => {
  for (const variant of ['displays', 'hubs', 'internal']) {
    const data = monitorFixture();
    if (variant === 'displays') data.displays!.Displays!.push({ ...data.displays!.Displays![0], Id: 'monitor-b' });
    if (variant === 'hubs') data.usb!.Devices![2].ContainerId = container;
    if (variant === 'internal') data.displays!.Displays![0].Internal = true;
    assert.equal(monitorAssociations(parseWindowsScan(data).devices).size, 0, variant);
  }
});
test('explicit USB companion pair can associate with a unique monitor and association clears on unplug', () => {
  const data = monitorFixture();
  data.usb!.Devices![2].ContainerId = container;
  data.usb!.Ports[0].CompanionPort = 2;
  data.usb!.Ports[1].Flags = 1;
  const scan = parseWindowsScan(data);
  assert.equal(monitorAssociations(scan.devices).size, 3);
  assert.equal(portInventory(scan).length, 2);
  data.displays!.Displays = [];
  assert.equal(monitorAssociations(parseWindowsScan(data).devices).size, 0);
});
