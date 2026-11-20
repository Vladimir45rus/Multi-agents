const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const standaloneNodeModules = path.join(standalone, "node_modules");
const projectStatic = path.join(root, ".next", "static");

function copyDir(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  return true;
}

// The embedded server is a Next.js standalone build and must carry its own
// traced node_modules (including "next") so it can run under Electron's Node.
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error(`Standalone server.js not found at ${standalone}. Run "next build" first.`);
}
if (!fs.existsSync(path.join(standaloneNodeModules, "next"))) {
  throw new Error(`Standalone node_modules/next not found at ${standaloneNodeModules}. "next build" must produce traced dependencies.`);
}
// Without static assets the renderer loads a blank page (no JS/CSS chunks).
if (!fs.existsSync(projectStatic)) {
  throw new Error(`.next/static not found at ${projectStatic}. "next build" must produce static assets.`);
}

// A stale .next/static inside the standalone folder produced
// "Failed to load chunk /_next/static/chunks/... from module ..." after an
// update: the server HTML came from the new build while old chunk files
// lingered. Only the static assets and the public folder are replaced —
// .next/server is produced by the build itself and must survive, otherwise the
// embedded server cannot find its manifests (pages-manifest.json / ENOENT).
for (const stale of [path.join(standalone, ".next", "static"), path.join(standalone, "public")]) {
  fs.rmSync(stale, { recursive: true, force: true });
}

const copiedStatic = copyDir(projectStatic, path.join(standalone, ".next", "static"));
const copiedPublic = copyDir(path.join(root, "public"), path.join(standalone, "public"));
const copiedMigrations = copyDir(path.join(root, "drizzle"), path.join(standalone, "drizzle"));

if (!copiedStatic) {
  throw new Error(`Failed to copy .next/static into standalone output (${path.join(standalone, ".next", "static")}).`);
}

// Hard gate: the embedded server needs these manifests at runtime. Shipping a
// package without them produced "Embedded server exited before becoming ready".
const requiredManifests = ["pages-manifest.json", "app-paths-manifest.json", "server-reference-manifest.json"];
for (const manifest of requiredManifests) {
  const target = path.join(standalone, ".next", "server", manifest);
  if (!fs.existsSync(target)) {
    throw new Error(
      `Standalone output is missing .next/server/${manifest}. The app would fail with ` +
      `"Embedded server exited before becoming ready". Re-run "next build" and retry.`,
    );
  }
}

console.log(`Standalone prepared: node_modules=ok, static=${copiedStatic}, public=${copiedPublic}, migrations=${copiedMigrations}`);
console.log(`Build id: ${fs.readFileSync(path.join(standalone, ".next", "BUILD_ID"), "utf8").trim()}`);
