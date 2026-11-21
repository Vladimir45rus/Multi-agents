import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["localtunnel"],
  // Build output and packaged artifacts live inside the project root, and the
  // standalone tracer used to pull them back into .next/standalone. The result
  // was a self-referencing tree (release\win-unpacked\resources\standalone\
  // release\...) with 2000+ character paths. NSIS copies files with CopyFiles,
  // which cannot create paths above MAX_PATH (260), so the installer died at
  // "Копирование файлов" with "Не удалось закрыть Multi-Agent Code Studio".
  outputFileTracingExcludes: {
    "*": [
      "./release/**",
      "./release.broken/**",
      "./win-unpacked/**",
      "./linux-unpacked/**",
      "./.multi-agent-backups/**",
      "./design/**",
      "./docs/**",
      "./tests/**",
    ],
  },
};

export default nextConfig;
