import { fetchGenres } from "./fetch-genres.js";
import { fetchRelations } from "./fetch-relations.js";
import { fetchCooccurrence } from "./fetch-cooccurrence.js";
import { emit } from "./emit.js";

// Orchestrator. Fetch stages hit the network (rate-limited, resumable);
// compute stages are deterministic and run from the committed cache.
//
//   tsx pipeline/index.ts genres relations cooccurrence emit
//   tsx pipeline/index.ts all
const STAGES: Record<string, () => void | Promise<void>> = {
  genres: async () => {
    await fetchGenres();
  },
  relations: fetchRelations,
  cooccurrence: fetchCooccurrence,
  // graph/layout/cluster are folded into emit (deterministic, in-memory).
  graph: () => void emit(),
  layout: () => void emit(),
  cluster: () => void emit(),
  emit: () => void emit(),
};

const FULL = ["genres", "relations", "cooccurrence", "emit"];

async function main() {
  let requested = process.argv.slice(2);
  if (requested.length === 0 || requested[0] === "all") requested = FULL;

  // Collapse the compute aliases so `graph layout cluster emit` runs emit once.
  const seen = new Set<string>();
  for (const stage of requested) {
    const fn = STAGES[stage];
    if (!fn) throw new Error(`Unknown stage: ${stage}`);
    const key = ["graph", "layout", "cluster", "emit"].includes(stage) ? "emit" : stage;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`\n=== stage: ${key} ===`);
    await fn();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
