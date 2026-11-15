import path from "node:path";

// Which parts of a project may be indexed, searched and read as text.
// Kept dependency-free (no DB, no server-only) so the rules are unit-testable —
// the audit found both the search outage (H1) and the secret leak (H2) here.

export const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".multi-agent-backups",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  // Build artefacts and virtual environments contain binaries and generated
  // files. Indexing them made project-wide search unusable: one unreadable
  // file aborted the whole scan.
  "release",
  "out",
  "target",
  "obj",
  ".turbo",
  ".venv",
  "venv",
  ".gradle",
  ".idea",
  // Agent/tooling scratch folders are not project sources.
  ".zwork",
]);

// Secret material must never be readable as project source. The check runs on
// every read path, not only while building the tree.
export const IGNORED_FILE_PATTERNS = [
  /^\.env/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^\.git-credentials$/i,
  /^\.htpasswd$/i,
  /^dev\.db$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)/i,
  /^credentials$/i,
  /\.(?:pem|key|p12|pfx|keystore|jks|ppk)$/i,
];

// Extension-less files are text only when they are well-known project metadata
// (LICENSE, Dockerfile, ...). Everything else without an extension is treated as
// binary — that is what a `chrome-sandbox`-style artefact requires.
export const NO_EXTENSION_TEXT_FILES = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  "authors",
  "changelog",
  "contributing",
  "dockerfile",
  "gemfile",
  "licence",
  "license",
  "makefile",
  "notice",
  "procfile",
  "rakefile",
  "readme",
]);

export const TEXT_EXTENSIONS = new Set([
  "cjs", "css", "csv", "go", "html", "java", "js", "json", "jsx", "kt", "md", "mjs", "py", "rb", "rs", "sql", "ts", "tsx", "txt", "xml", "yaml", "yml",
]);

export function isIgnoredFile(filePath: string) {
  const name = path.basename(filePath);
  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

export function isTextPath(filePath: string) {
  if (isIgnoredFile(filePath)) return false;
  const name = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!extension) return NO_EXTENSION_TEXT_FILES.has(name);
  return TEXT_EXTENSIONS.has(extension);
}
