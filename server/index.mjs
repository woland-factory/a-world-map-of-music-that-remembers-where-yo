// Bootstrap: read the committed atlas, build the handler, serve. The
// process holds no state beyond its in-memory cache and writes nothing
// to disk.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHandler } from "./app.mjs";
import { reportError } from "./lb.mjs";

const atlasPath = process.env.ATLAS_PATH || "data/genres.json";
const atlas = JSON.parse(readFileSync(atlasPath, "utf8"));
const dsn = process.env.SENTRY_DSN || "";

const handler = createHandler({
  atlas,
  reportError: (err, name) => reportError(dsn, err, name),
});

const port = Number(process.env.PORT || 8081);
createServer((req, res) => {
  void handler(req, res);
}).listen(port, "0.0.0.0", () => {
  // Fixed string only: log lines never carry request or config data.
  console.log("listenbrainz proxy up");
});
