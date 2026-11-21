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

// Packaged artifacts must never survive inside the standalone tree. When a
// previous release/win-unpacked got copied in, the paths grew recursively
// (release\win-unpacked\resources\standalone\release\win-unpacked\...) up to
// 2000+ characters. The NSIS installer copies files with CopyFiles, which
// cannot create anything longer than MAX_PATH (260): it stopped at ~30 % of
// "Копирование файлов", reported "Не удалось закрыть Multi-Agent Code Studio"
// and left a half-installed app behind.
const PACKAGED_ARTIFACTS = ["release", "release.broken", "win-unpacked", "linux-unpacked", "dist", "out"];
for (const name of PACKAGED_ARTIFACTS) {
  const junk = path.join(standalone, name);
  if (fs.existsSync(junk)) {
    fs.rmSync(junk, { recursive: true, force: true });
    console.log(`[prepare-standalone] removed stray ${name}/ from the standalone output`);
  }
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

// Hard gate: "$INSTDIR + relative path" has to stay below MAX_PATH (260).
// A default install lands in %LOCALAPPDATA%\Programs\MultiAgentCodeStudio and
// adds resources\standalone (~86 characters), so anything above 170 here means
// the installer will silently fail to copy that file.
const MAX_RELATIVE_PATH = 170;

function collectRelativePaths(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(standalone, full);
    out.push(rel);
    if (entry.isDirectory() && !entry.isSymbolicLink()) collectRelativePaths(full, out);
  }
  return out;
}

const relativePaths = collectRelativePaths(standalone);
const tooLong = relativePaths
  .filter((rel) => rel.length > MAX_RELATIVE_PATH)
  .sort((a, b) => b.length - a.length);

if (tooLong.length > 0) {
  throw new Error(
    `Standalone output has ${tooLong.length} path(s) longer than ${MAX_RELATIVE_PATH} characters ` +
      `(longest: ${tooLong[0].length}). The NSIS installer copies files with CopyFiles, which cannot ` +
      `create paths above MAX_PATH (260) — installation would fail with "Не удалось закрыть ` +
      `Multi-Agent Code Studio". Offending path: ${tooLong[0]}`,
  );
}

const leaked = relativePaths.find((rel) => /(^|[\\/])(win-unpacked|linux-unpacked)([\\/]|$)/.test(rel));
if (leaked) {
  throw new Error(
    `Packaged artifacts leaked into the standalone output (${leaked}). ` +
      `Run "node scripts/clean-release.cjs" and rebuild.`,
  );
}

console.log(`Standalone prepared: node_modules=ok, static=${copiedStatic}, public=${copiedPublic}, migrations=${copiedMigrations}`);
console.log(`Longest relative path: ${relativePaths.reduce((max, rel) => Math.max(max, rel.length), 0)} characters`);
console.log(`Build id: ${fs.readFileSync(path.join(standalone, ".next", "BUILD_ID"), "utf8").trim()}`);
