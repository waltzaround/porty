import type { TopologyNode } from "./topology";
export const NODE_WIDTH = 214;
export const NODE_HEIGHT = 64;
export type PositionedNode = TopologyNode & { x: number; y: number };

/** Centre parents on their children, reserving one row for each leaf. */
export function layoutTopology(nodes: TopologyNode[], rootId = "computer") {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, TopologyNode[]>();
  for (const node of nodes)
    if (node.parent)
      children.set(node.parent, [...(children.get(node.parent) ?? []), node]);
  const positioned: PositionedNode[] = [];
  const visited = new Set<string>();
  let row = 0;
  function place(id: string, depth: number): PositionedNode | undefined {
    const node = byId.get(id);
    if (!node || visited.has(id)) return;
    visited.add(id);
    const childPositions = (children.get(id) ?? [])
      .map((child) => place(child.id, depth + 1))
      .filter((child): child is PositionedNode => !!child);
    const y = childPositions.length
      ? (childPositions[0].y + childPositions[childPositions.length - 1].y) / 2
      : 40 + row++ * (NODE_HEIGHT + 24);
    const result = { ...node, x: 40 + depth * (NODE_WIDTH + 76), y };
    positioned.push(result);
    return result;
  }
  place(rootId, 0);
  return {
    nodes: positioned,
    width: Math.max(400, ...positioned.map((node) => node.x + NODE_WIDTH + 40)),
    height: Math.max(
      260,
      ...positioned.map((node) => node.y + NODE_HEIGHT + 40),
    ),
  };
}

export function connectionPath(from: PositionedNode, to: PositionedNode) {
  const x1 = from.x + NODE_WIDTH,
    y1 = from.y + NODE_HEIGHT / 2,
    x2 = to.x,
    y2 = to.y + NODE_HEIGHT / 2;
  const middle = (x1 + x2) / 2,
    direction = Math.sign(y2 - y1),
    radius = Math.min(18, Math.abs(y2 - y1) / 2);
  return `M ${x1} ${y1} H ${middle - radius} Q ${middle} ${y1} ${middle} ${y1 + direction * radius} V ${y2 - direction * radius} Q ${middle} ${y2} ${middle + radius} ${y2} H ${x2}`;
}
