import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOrder } from "./flowGraph.js";
import type { FlowNode } from "./types.js";

function node(
  id: string,
  nextId: string | null = null,
  prevId: string | null = null,
  detailsId: string | null = null,
): FlowNode {
  return { id, nextId, prevId, detailsId };
}

function toMap(nodes: FlowNode[]): Map<string, FlowNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

describe("buildOrder", () => {
  it("orders a linear chain from head to tail", () => {
    const nodes = toMap([
      node("a", "b", null),
      node("b", "c", "a"),
      node("c", null, "b"),
    ]);

    assert.deepEqual(buildOrder(nodes), ["a", "b", "c"]);
  });

  it("starts chains at nodes whose previous link is missing from the map", () => {
    const nodes = toMap([
      node("orphan", "b", "missing"),
      node("b", null, "orphan"),
    ]);

    assert.deepEqual(buildOrder(nodes), ["orphan", "b"]);
  });

  it("handles multiple disconnected chains", () => {
    const nodes = toMap([
      node("a1", "a2", null),
      node("a2", null, "a1"),
      node("b1", "b2", null),
      node("b2", null, "b1"),
    ]);

    assert.deepEqual(buildOrder(nodes), ["a1", "a2", "b1", "b2"]);
  });

  it("treats nodes without previous links as chain heads", () => {
    const nodes = toMap([
      node("solo", null, null),
      node("head", "tail", null),
      node("tail", null, "head"),
    ]);

    assert.deepEqual(buildOrder(nodes), ["solo", "head", "tail"]);
  });

  it("returns an empty array for an empty map", () => {
    assert.deepEqual(buildOrder(new Map()), []);
  });

  it("does not revisit nodes when following next links", () => {
    const nodes = toMap([
      node("a", "b", null),
      node("b", "a", "a"),
    ]);

    assert.deepEqual(buildOrder(nodes), ["a", "b"]);
  });
});
