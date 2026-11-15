import { describe, expect, it } from "vitest";
import { IGNORED_DIRECTORIES, isIgnoredFile, isTextPath } from "@/lib/workspace-file-policy";

describe("isIgnoredFile", () => {
  it("blocks env files", () => {
    expect(isIgnoredFile(".env")).toBe(true);
    expect(isIgnoredFile(".env.local")).toBe(true);
    expect(isIgnoredFile("apps/web/.env.production")).toBe(true);
    expect(isIgnoredFile("src/env.ts")).toBe(false);
  });

  it("blocks keys, certificates and databases", () => {
    expect(isIgnoredFile("id_rsa")).toBe(true);
    expect(isIgnoredFile("id_ed25519.pub")).toBe(true);
    expect(isIgnoredFile("server.pem")).toBe(true);
    expect(isIgnoredFile("private.key")).toBe(true);
    expect(isIgnoredFile("cert.p12")).toBe(true);
    expect(isIgnoredFile("app.keystore")).toBe(true);
    expect(isIgnoredFile("dev.db")).toBe(true);
    expect(isIgnoredFile(".npmrc")).toBe(true);
    expect(isIgnoredFile("package.json")).toBe(false);
  });
});

describe("isTextPath", () => {
  it("accepts source files", () => {
    expect(isTextPath("src/app/page.tsx")).toBe(true);
    expect(isTextPath("README.md")).toBe(true);
    expect(isTextPath("data/config.yaml")).toBe(true);
  });

  it("rejects binaries by extension", () => {
    expect(isTextPath("public/logo.png")).toBe(false);
    expect(isTextPath("dist/app.exe")).toBe(false);
    expect(isTextPath("archive.zip")).toBe(false);
  });

  it("treats extension-less files as text only when they are known metadata", () => {
    expect(isTextPath("LICENSE")).toBe(true);
    expect(isTextPath("Dockerfile")).toBe(true);
    expect(isTextPath(".gitignore")).toBe(true);
    // The file that used to break project-wide search.
    expect(isTextPath("release/linux-unpacked/chrome-sandbox")).toBe(false);
    expect(isTextPath("scripts/deploy")).toBe(false);
  });

  it("never exposes protected files even with a text extension", () => {
    expect(isTextPath(".env.local")).toBe(false);
    expect(isTextPath("server.pem")).toBe(false);
  });
});

describe("IGNORED_DIRECTORIES", () => {
  it("skips build output, dependencies and scratch folders", () => {
    for (const directory of ["node_modules", ".next", "release", "dist", ".zwork", ".git"]) {
      expect(IGNORED_DIRECTORIES.has(directory)).toBe(true);
    }
    expect(IGNORED_DIRECTORIES.has("src")).toBe(false);
  });
});
