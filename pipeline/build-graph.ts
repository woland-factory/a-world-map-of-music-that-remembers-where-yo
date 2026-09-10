import { readJsonl } from "./lib/jsonl.js";
import { paths } from "./lib/paths.js";
import { loadGenresCache } from "./fetch-genres.js";
import type { CooccurrenceRecord, RelationsRecord } from "./types.js";

const TOP_K = 10;
const REL_BOOST = 0.35; // added to similarity when an explicit genre-rel exists

export interface GraphNode {
  id: number;
  mbid: string;
  name: string;
  neighbors: number[]; // top-K ids, most similar first
}

export interface BuiltGraph {
  fetchedAt: string;
  nodes: GraphNode[];
  // undirected edges with weight, for layout + clustering
  edges: { a: number; b: number; weight: number }[];
}

// Stage 4: cosine similarity of co-occurrence vectors + genre-rel boost,
// keep top-K neighbors per genre. Deterministic: same cache in, same
// graph out.
export function buildGraph(): BuiltGraph {
  const cache = loadGenresCache();
  const nodes = cache.genres.map((g, i) => ({
    id: i,
    mbid: g.mbid,
    name: g.name,
    neighbors: [] as number[],
  }));

  const idByName = new Map<string, number>();
  nodes.forEach((n) => idByName.set(n.name.toLowerCase(), n.id));

  const cooc = readJsonl<CooccurrenceRecord>(paths.cooccurrence);
  const rels = readJsonl<RelationsRecord>(paths.relations);

  // Per-node sparse vector over co-tag genre ids, plus L2 norm.
  const vectors: Map<number, number>[] = nodes.map(() => new Map());
  const norms = new Array<number>(nodes.length).fill(0);
  // Inverted index: co-tag id -> [nodeId, weight]
  const inverted = new Map<number, [number, number][]>();

  for (const node of nodes) {
    const rec = cooc.get(node.mbid);
    if (!rec) continue;
    const vec = vectors[node.id];
    for (const [name, w] of Object.entries(rec.weights)) {
      const dim = idByName.get(name);
      if (dim === undefined) continue;
      vec.set(dim, (vec.get(dim) ?? 0) + w);
    }
    let sq = 0;
    for (const [dim, w] of vec) {
      sq += w * w;
      const posting = inverted.get(dim) ?? [];
      posting.push([node.id, w]);
      inverted.set(dim, posting);
    }
    norms[node.id] = Math.sqrt(sq);
  }

  // Accumulate dot products only for pairs that share a co-tag dimension.
  const dots: Map<number, number>[] = nodes.map(() => new Map());
  for (const posting of inverted.values()) {
    for (let x = 0; x < posting.length; x++) {
      for (let y = x + 1; y < posting.length; y++) {
        const [i, wi] = posting[x];
        const [j, wj] = posting[y];
        const prod = wi * wj;
        dots[i].set(j, (dots[i].get(j) ?? 0) + prod);
        dots[j].set(i, (dots[j].get(i) ?? 0) + prod);
      }
    }
  }

  // Similarity map per node (cosine, plus relation boost).
  const sims: Map<number, number>[] = nodes.map(() => new Map());
  for (const node of nodes) {
    const i = node.id;
    for (const [j, dot] of dots[i]) {
      const denom = norms[i] * norms[j];
      const cos = denom > 0 ? dot / denom : 0;
      if (cos > 0) sims[i].set(j, cos);
    }
  }
  // Fold in genre relationships (symmetric boost, and an edge even with no
  // co-occurrence overlap).
  const addRel = (a: number, b: number) => {
    if (a === b) return;
    sims[a].set(b, (sims[a].get(b) ?? 0) + REL_BOOST);
    sims[b].set(a, (sims[b].get(a) ?? 0) + REL_BOOST);
  };
  for (const node of nodes) {
    const rec = rels.get(node.mbid);
    if (!rec) continue;
    for (const relName of rec.related) {
      const other = idByName.get(relName);
      if (other !== undefined) addRel(node.id, other);
    }
  }

  // Top-K neighbors, deterministic ordering (sim desc, id asc).
  for (const node of nodes) {
    const entries = [...sims[node.id].entries()].sort((p, q) =>
      q[1] !== p[1] ? q[1] - p[1] : p[0] - q[0],
    );
    node.neighbors = entries.slice(0, TOP_K).map(([id]) => id);
  }

  // Undirected edge set (union of directed top-K), weight = max sim seen.
  const edgeMap = new Map<string, number>();
  for (const node of nodes) {
    for (const nb of node.neighbors) {
      const a = Math.min(node.id, nb);
      const b = Math.max(node.id, nb);
      const w = sims[node.id].get(nb) ?? 0.001;
      const key = `${a}-${b}`;
      edgeMap.set(key, Math.max(edgeMap.get(key) ?? 0, w));
    }
  }
  const edges = [...edgeMap.entries()]
    .map(([key, weight]) => {
      const [a, b] = key.split("-").map(Number);
      return { a, b, weight };
    })
    .sort((p, q) => (p.a !== q.a ? p.a - q.a : p.b - q.b));

  return { fetchedAt: cache.fetchedAt, nodes, edges };
}
