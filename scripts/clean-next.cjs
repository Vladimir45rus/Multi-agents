// Next 16 (Turbopack) links server-external packages into .next/node_modules as
// NTFS junctions. A second `next build` in a row dies before it starts:
//
//   Error: EPERM: operation not permitted, unlink '...\.next\node_modules\localtunnel-...'
//
// because a junction cannot be removed with unlink(2). Dropping that folder
// before every build keeps the rest of the incremental cache intact.
const fs = require("node:fs");
const path = require("node:path");

const target = path.join(__dirname, "..", ".next", "node_modules");

if (fs.existsSync(target)) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log("[clean-next] removed .next/node_modules (stale junctions)");
}
