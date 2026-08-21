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

const copiedStatic = copyDir(projectStatic, path.join(standalone, ".next", "static"));
const copiedPublic = copyDir(path.join(root, "public"), path.join(standalone, "public"));
const copiedMigrations = copyDir(path.join(root, "drizzle"), path.join(standalone, "drizzle"));

if (!copiedStatic) {
  throw new Error(`Failed to copy .next/static into standalone output (${path.join(standalone, ".next", "static")}).`);
}

console.log(`Standalone prepared: node_modules=ok, static=${copiedStatic}, public=${copiedPublic}, migrations=${copiedMigrations}`);
