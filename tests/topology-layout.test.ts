import test from "node:test";
import assert from "node:assert/strict";
import {
  layoutTopology,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "../shared/topology-layout";
import { deviceTopology, type TopologyNode } from "../shared/topology";

const tree: TopologyNode[] = [
  { id: "computer", name: "Computer", detail: "Host" },
  { id: "hub", parent: "computer", name: "Hub", detail: "USB" },
  { id: "camera", parent: "hub", name: "Camera", detail: "USB" },
  { id: "receiver", parent: "hub", name: "Receiver", detail: "USB" },
  { id: "screen", parent: "computer", name: "Screen", detail: "Display" },
];
test("branch layout centres parents and leaves space between nodes", () => {
  const result = layoutTopology(tree);
  assert.equal(result.nodes.length, tree.length);
  const find = (id: string) => result.nodes.find((node) => node.id === id)!;
  assert.equal(find("hub").y, (find("camera").y + find("receiver").y) / 2);
  assert.equal(find("computer").y, (find("hub").y + find("screen").y) / 2);
  for (const a of result.nodes)
    for (const b of result.nodes) {
      if (a.id === b.id) continue;
      assert.ok(
        a.x + NODE_WIDTH <= b.x ||
          b.x + NODE_WIDTH <= a.x ||
          a.y + NODE_HEIGHT <= b.y ||
          b.y + NODE_HEIGHT <= a.y,
        `${a.id} overlaps ${b.id}`,
      );
    }
});
test("focusing a branch includes its descendants without reparenting devices", () => {
  const before = JSON.stringify(tree);
  assert.deepEqual(
    layoutTopology(tree, "hub")
      .nodes.map((node) => node.id)
      .sort(),
    ["camera", "hub", "receiver"],
  );
  assert.equal(JSON.stringify(tree), before);
});
test("missing ports keep devices reachable and explicitly unmapped", () => {
  const topology = deviceTopology(
    [],
    [
      {
        name: "Detached path",
        detail: "USB",
        port: "Missing port",
        portId: "gone",
      },
    ],
  );
  assert.equal(topology[1].parent, "computer");
  assert.equal(topology[1].uncertain, true);
  assert.equal(layoutTopology(topology).nodes.length, 2);
});
