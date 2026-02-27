import { describe, expect, it } from "vitest";
import { tarjanScc } from "../src/core/tarjan.js";

describe("tarjanScc", () => {
  it("finds strongly connected components", () => {
    const nodes = ["a", "b", "c", "d", "e"];
    const adjacency = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a", "d"])],
      ["d", new Set(["e"])],
      ["e", new Set()]
    ]);

    const components = tarjanScc(nodes, adjacency);

    expect(components).toEqual([
      ["a", "b", "c"],
      ["d"],
      ["e"]
    ]);
  });
});
