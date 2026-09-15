import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceTopology, type InventoryDevice } from '../shared/topology';
import type { Port } from '../shared/types';
const ports: Port[] = [{ id:'p', name:'Left USB', connector:'USB-C', location:'Left', status:'connected', protocol:'USB', capabilities:[], devices:[], evidence:'detected', source:'test' }];
const device = (name: string, extra: Partial<InventoryDevice> = {}): InventoryDevice => ({ name, detail:'USB', port:'Left USB', portId:'p', ...extra });
test('stable parent IDs distinguish hubs with identical names', () => {
  const nodes = deviceTopology(ports, [device('Hub', {id:'a', kind:'hub'}), device('Hub', {id:'b', kind:'hub'}), device('Mouse', {parentId:'b', parentName:'Hub'})]);
  assert.equal(nodes.find(n => n.name === 'Mouse')?.parent, 'device:1');
});
test('ambiguous hub names and system inventory remain explicitly unmapped', () => {
  const nodes = deviceTopology(ports, [device('Hub', {kind:'hub'}), device('Hub', {kind:'hub'}), device('Mouse', {parentName:'Hub'}), device('Monitor', {portId:undefined, port:'System inventory'})]);
  assert.equal(nodes.find(n => n.name === 'Mouse')?.uncertain, true);
  assert.equal(nodes.find(n => n.name === 'Monitor')?.uncertain, true);
});
test('cyclic inventory is repaired into a reachable graph', () => {
  const nodes = deviceTopology(ports, [device('A', {id:'a', parentId:'b'}), device('B', {id:'b', parentId:'a'})]);
  for (const node of nodes) {
    const seen = new Set<string>();
    let current = node;
    while (current.parent) {
      assert.ok(!seen.has(current.id)); seen.add(current.id);
      current = nodes.find(n => n.id === current.parent)!;
      assert.ok(current);
    }
    assert.equal(current.id, 'computer');
  }
});
