import Graph from "graphology";
import type { BuiltGraph } from "../build-graph.js";
import { mulberry32, SEED } from "./rng.js";

// Build an undirected graphology graph with deterministic initial
// positions (seeded), so ForceAtlas2 reproduces the same layout.
export function toGraphology(built: BuiltGraph): Graph {
  const graph = new Graph({ type: "undirected" });
  const rand = mulberry32(SEED);
  for (const node of built.nodes) {
    // Seeded scatter in a disk; FA2 refines from here deterministically.
    const angle = rand() * Math.PI * 2;
    const radius = 1 + rand() * 100;
    graph.addNode(String(node.id), {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      name: node.name,
    });
  }
  for (const e of built.edges) {
    const a = String(e.a);
    const b = String(e.b);
    if (!graph.hasEdge(a, b)) graph.addEdge(a, b, { weight: e.weight });
  }
  return graph;
}
