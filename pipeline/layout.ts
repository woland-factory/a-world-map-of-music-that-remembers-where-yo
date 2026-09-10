import forceAtlas2 from "graphology-layout-forceatlas2";
import type Graph from "graphology";

const ITERATIONS = 400; // fixed for determinism

// Stage 5: ForceAtlas2 with a fixed iteration count. Positions are
// already seeded deterministically, so the run reproduces exactly.
export function runLayout(graph: Graph): void {
  forceAtlas2.assign(graph, {
    iterations: ITERATIONS,
    settings: {
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
      gravity: 1,
      scalingRatio: 10,
      slowDown: 1,
      linLogMode: true,
      outboundAttractionDistribution: false,
      adjustSizes: false,
      edgeWeightInfluence: 1,
      strongGravityMode: false,
    },
  });
}
