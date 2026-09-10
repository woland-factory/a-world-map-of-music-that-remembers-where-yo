import louvain from "graphology-communities-louvain";
import type Graph from "graphology";
import { mulberry32, SEED } from "./lib/rng.js";

export interface Clustering {
  regionByNode: Map<number, number>; // node id -> region id (0-based, dense)
  labels: Map<number, string>; // region id -> label (most central genre)
}

// Stage 6: Louvain community detection with a seeded RNG, then relabel
// regions to dense 0-based ids in a deterministic order, and label each
// by its highest-degree genre.
export function runCluster(graph: Graph): Clustering {
  const raw = louvain(graph, {
    rng: mulberry32(SEED + 7),
    resolution: 1,
  }) as Record<string, number>;

  // Group nodes by raw community.
  const members = new Map<number, number[]>();
  for (const [key, comm] of Object.entries(raw)) {
    const id = Number(key);
    const arr = members.get(comm) ?? [];
    arr.push(id);
    members.set(comm, arr);
  }

  // Deterministic region ordering: by the smallest node id in each community.
  const communities = [...members.entries()].sort(
    (a, b) => Math.min(...a[1]) - Math.min(...b[1]),
  );

  const regionByNode = new Map<number, number>();
  const labels = new Map<number, string>();
  communities.forEach(([, nodeIds], region) => {
    for (const id of nodeIds) regionByNode.set(id, region);
    // Label = highest-degree node in the community (tie: smallest id).
    let best = nodeIds[0];
    let bestDeg = -1;
    for (const id of nodeIds) {
      const deg = graph.degree(String(id));
      if (deg > bestDeg || (deg === bestDeg && id < best)) {
        best = id;
        bestDeg = deg;
      }
    }
    labels.set(region, graph.getNodeAttribute(String(best), "name"));
  });

  return { regionByNode, labels };
}
