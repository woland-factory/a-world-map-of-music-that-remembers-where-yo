// Copies the committed atlas data into web/public/data so Vite serves it
// at /data/*.json in both dev and the production build. Keeping the data
// out of the JS bundle lets the skeleton paint before the atlas loads.
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "data");
const dest = join(root, "web", "public", "data");

mkdirSync(dest, { recursive: true });

for (const file of ["genres.json", "demo-passport.json"]) {
  const from = join(src, file);
  const to = join(dest, file);
  if (existsSync(from)) {
    copyFileSync(from, to);
  } else if (!existsSync(to)) {
    // Keep dev/build working before the atlas is generated the first time.
    const placeholder =
      file === "genres.json"
        ? JSON.stringify({
            version: 1,
            generated: "1970-01-01T00:00:00Z",
            source: "MusicBrainz",
            bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
            regions: [],
            genres: [],
          })
        : JSON.stringify([]);
    writeFileSync(to, placeholder);
  }
}

console.log("copy-data: atlas data ready in web/public/data");
