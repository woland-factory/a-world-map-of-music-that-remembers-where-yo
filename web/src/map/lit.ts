import type { Atlas, Genre } from "../types";
import { regionColor, UNLIT_COLOR } from "./colors";

export interface RenderGenre {
  genre: Genre;
  lit: boolean;
  color: string;
}

// Pure mapping from atlas + lit set to per-genre render info. Kept
// separate from canvas drawing so it is unit-testable.
export function computeRenderGenres(atlas: Atlas, lit: Set<number>): RenderGenre[] {
  return atlas.genres.map((genre) => {
    const isLit = lit.has(genre.id);
    return {
      genre,
      lit: isLit,
      color: isLit ? regionColor(genre.region) : UNLIT_COLOR,
    };
  });
}

export function countLit(atlas: Atlas, lit: Set<number>): number {
  let n = 0;
  for (const g of atlas.genres) if (lit.has(g.id)) n++;
  return n;
}
