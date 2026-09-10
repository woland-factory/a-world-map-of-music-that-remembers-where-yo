import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type Graph from "graphology";
import { buildGraph } from "./build-graph.js";
import { toGraphology } from "./lib/graphology.js";
import { runLayout } from "./layout.js";
import { runCluster } from "./cluster.js";
import { paths } from "./lib/paths.js";
import type { Atlas, EmittedGenre, Region } from "./types.js";

function round(n: number): number {
  // Fixed precision keeps output byte-identical across runs.
  return Math.round(n * 100) / 100;
}

// Stage 7: compose data/genres.json covering EVERY genre. Deterministic:
// same cache in, byte-identical file out, no network.
export function buildAtlas(): Atlas {
  const built = buildGraph();
  const graph: Graph = toGraphology(built);
  runLayout(graph);
  const { regionByNode, labels } = runCluster(graph);

  // Normalize coordinates into a stable bounds box.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const node of built.nodes) {
    xs.push(graph.getNodeAttribute(String(node.id), "x"));
    ys.push(graph.getNodeAttribute(String(node.id), "y"));
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const genres: EmittedGenre[] = built.nodes.map((node, i) => ({
    id: node.id,
    mbid: node.mbid,
    name: node.name,
    x: round(xs[i]),
    y: round(ys[i]),
    region: regionByNode.get(node.id) ?? 0,
    neighbors: node.neighbors,
  }));

  const regionIds = [...new Set(genres.map((g) => g.region))].sort((a, b) => a - b);
  const regions: Region[] = regionIds.map((id) => ({
    id,
    label: labels.get(id) ?? String(id),
  }));

  return {
    version: 1,
    generated: built.fetchedAt,
    source: "MusicBrainz",
    bounds: { minX: round(minX), maxX: round(maxX), minY: round(minY), maxY: round(maxY) },
    regions,
    genres,
  };
}

export function emit(): Atlas {
  const atlas = buildAtlas();
  mkdirSync(dirname(paths.atlas), { recursive: true });
  writeFileSync(paths.atlas, JSON.stringify(atlas));
  console.log(
    `emit: wrote ${atlas.genres.length} genres, ${atlas.regions.length} regions`,
  );
  return atlas;
}
