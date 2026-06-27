import type { FlowNode } from "./types.js";

export function buildOrder(nodesById: Map<string, FlowNode>): string[] {
  const nodes = Array.from(nodesById.values());
  const getPrev = (n: FlowNode) => (n.prevId ? [n.prevId] : []);
  const getNext = (n: FlowNode) => (n.nextId ? n.nextId : null);

  const visited = new Set<string>();
  const orderedIds: string[] = [];

  const candidates = nodes.filter((n) => {
    const prevIds = getPrev(n);
    if (prevIds.length === 0) return true;
    return prevIds.every((pid) => !nodesById.has(pid));
  });

  for (const start of candidates) {
    if (visited.has(start.id)) continue;

    let current: FlowNode | null | undefined = start;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      orderedIds.push(current.id);
      const nextId = getNext(current);
      current = nextId ? nodesById.get(nextId) : null;
    }
  }

  return orderedIds;
}
