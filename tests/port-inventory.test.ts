import test from 'node:test';
import assert from 'node:assert/strict';
import { portInventory } from '../shared/port-inventory';
import { demoScan } from '../shared/demo';

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
