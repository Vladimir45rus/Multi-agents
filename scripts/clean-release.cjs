// electron-builder merges into an existing output directory. A leftover
// release/win-unpacked from the previous run gets copied *into* the new bundle
// (resources/standalone/release/win-unpacked/... and so on, one extra level per
// build), which is how the standalone tree grew 2000+ character paths.
//
// Running this before `next build` guarantees the tracer never sees a packaged
// artifact inside the project and electron-builder starts from a clean folder.
const fs = require("node:fs");
const path = require("node:path");

const release = path.join(__dirname, "..", "release");

for (const name of ["win-unpacked", "linux-unpacked", "mac", "mac-arm64"]) {
  const target = path.join(release, name);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`[clean-release] removed release/${name}`);
  }
}
