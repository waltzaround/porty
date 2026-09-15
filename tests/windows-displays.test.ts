import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWindowsDisplays, type WindowsDisplay } from '../electron/collectors/windows-displays';
import { parseWindowsScan } from '../electron/collectors/windows';
import { portInventory } from '../shared/port-inventory';
import { currentPortValues } from '../shared/current';
import { getDisplaySupport } from '../shared/display';

const display = (Id: string, changes: Partial<WindowsDisplay> = {}): WindowsDisplay => ({
  Id, Name: 'DELL U2715H', Technology: 10, Width: 2560, Height: 1440,
  RefreshNumerator: 59951, RefreshDenominator: 1000, ...changes,
});
test('Windows identical monitors remain distinct and show current modes in port inventory', () => {
  const scan = parseWindowsScan({ displays: { Displays: [display('a'), display('b'), display('c', { Technology: 5 })] } });
  assert.equal(scan.devices.length, 3);
  assert.equal(new Set(scan.devices.map(d => d.id)).size, 3);
  const groups = portInventory(scan).slice(1);
  assert.equal(groups.length, 3);
  for (const group of groups) {
    assert.equal(group.ports.length, 1);
    const port = group.ports[0];
    assert.equal(currentPortValues(port).resolution.value, '2560 × 1440');
    assert.equal(currentPortValues(port).refresh.value, '59.951 Hz');
    assert.equal(getDisplaySupport(port).status, 'unknown');
    assert.equal(port.connector, 'Display (unclassified)');
  }
  assert.match(scan.devices[2].detail, /^HDMI/);
  assert.ok(scan.devices.every(d => !d.parentId && !d.portMapping));
});
test('Windows display targets deduplicate by route and keep stable IDs across scan order changes', () => {
  const first = parseWindowsDisplays([display('a'), display('b'), display('a')]);
  const reordered = parseWindowsDisplays([display('b'), display('a')]);
  assert.equal(first.length, 2);
  assert.equal(first[0].id, reordered[1].id);
  assert.equal(first[1].id, reordered[0].id);
  assert.deepEqual(parseWindowsDisplays([display('b')]).map(d => d.id), [first[1].id]);
});
test('Windows missing timing and invalid refresh values stay unreported', () => {
  for (const changes of [{ RefreshDenominator: 0 }, { RefreshNumerator: 0 }, { RefreshNumerator: Infinity }, { RefreshDenominator: -1 }]) {
    const device = parseWindowsDisplays([display('a', changes)])[0];
    assert.equal(device.displayMode?.refreshHz, undefined);
    assert.ok(!device.detail.includes('Hz'));
  }
  const device = parseWindowsDisplays([display('a', { Width: 0, Height: undefined })])[0];
  assert.equal(device.displayMode, undefined);
  assert.equal(device.kind, 'display');
  assert.ok(!device.detail.includes('2560'));
});
test('Windows retains displays independently of USB query failures and unknown names', () => {
  const scan = parseWindowsScan({ displays: { Displays: [display('a', { Name: ' ', Technology: -1 })] }, warnings: ['Native USB queries failed.'] });
  assert.equal(scan.devices[0].name, 'Display 1');
  assert.equal(scan.devices[0].kind, 'display');
  assert.ok(scan.warnings.includes('Native USB queries failed.'));
  assert.deepEqual(parseWindowsDisplays(), []);
  assert.equal(parseWindowsScan({}).devices.length, 0);
});
test('Windows built-in panels are labelled and raw target identities are not exported', () => {
  const scan = parseWindowsScan({ displays: { Displays: [display('PRIVATE_PATH', { Technology: 11, Internal: true })] } });
  assert.match(scan.devices[0].detail, /Embedded DisplayPort.*Built-in panel/);
  assert.ok(!JSON.stringify(scan).includes('PRIVATE_PATH'));
  assert.ok(!JSON.stringify(scan).includes('DevicePath'));
});
