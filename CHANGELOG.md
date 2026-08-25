# Changelog

## v1.5.20 — Release Candidate

### 🔒 Security (13+ fixes)

Full security audit remediation across three hardening phases.

- **S1 — Authentication bypass via spoofable headers**: `X-Forwarded-For` / `Host` headers are no longer trusted to grant local privileges. When the optional localtunnel/mobile mode is active, every API route requires the mobile access token.
- **S2 — CSRF on localhost API**: cross-site browser requests are blocked in middleware via `Origin` / `Sec-Fetch-Site` validation for all state-changing methods.
- **B1 — Non-atomic multi-file patches**: agent patches now apply atomically; a mid-patch failure automatically rolls back every file already written (disk + index + history).
- **B2 — Unrecoverable deletions**: deleting files or directories now snapshots every affected text file into backups + rollback history before removal.
- **B3 — Silent truncation of model output**: truncated JSON responses are detected and surface as an explicit `GENERATION_ERROR` event instead of silently producing "zero patches" / false `RELEASE_READY`.
- **H1 — Terminal allowlist bypass**: rejected package-smuggling flags (`npx --package=`, `-p`, `--call`, `--exec`, `--workspace`) and lifecycle scripts; `npm run <script>` is validated against the project's real `package.json`.
- **H2 — Plaintext secrets at rest**: provider API keys and GitHub tokens are AES-256-GCM encrypted before being stored in SQLite (local key in `%USERPROFILE%\.multi-agent-studio\`); Electron SafeStorage values keep working; legacy plaintext migrates on next save.
- **H3 — SSRF via link attachments**: server-side URL validation blocks private networks (127/8, 10/8, 172.16/12, 192.168/16, 169.254.169.254 cloud metadata), localhost-like hostnames, credential URLs, non-HTTP schemes; DNS resolution is checked and redirects are re-validated per hop.
- **H4 — Preview content isolation**: preview iframe runs sandboxed without same-origin access; Electron windows block top-level navigation away from the app origin (`will-navigate` guard on main + overlay windows).
- **H5 — Prompt-injection tool execution**: tool calls are only recognized from pure JSON tool-call payloads, never from prose or JSON snippets embedded in read files.
- **H6 — Fragmented streaming tool calls**: OpenAI-style streamed `tool_calls` deltas are accumulated per call index and emitted as complete, parseable payloads when the stream finishes (parallel calls included).
- **H7 — Zombie processes on Windows**: stopping the preview kills the entire process tree (`taskkill /T /F`) and waits for exit, so dev-server ports are released reliably.
- **H8 — Editor buffer clobbering**: background chat/orchestrator refreshes no longer overwrite unsaved code the user is typing.

### 🛠 Reliability

- SQLite transactions around Lead-agent reassignment and workspace rename loops — a crash can no longer leave the workspace without a Main Agent or with a corrupted file index.
- Manual confirmations in controlled mode time out after 10 minutes instead of hanging forever.
- Hot-path database indexes added (`chat_messages(channel,id)`, `agent_events(task_id)`, `workspace_file_history(file_path)`, `file_history(file_id)`) with idempotent migration.
- Fixed broken regex in @mention autocomplete.

### 🎨 UI/UX

- Clean chat display: tool executions render as friendly status chips ("Reading files...", "Running terminal command...") instead of raw JSON.
- Log routing: raw provider errors (HTTP 429, rate limits) go strictly to the Logs / System events panel, never into chat windows.
- Deduplication of messages between live streams and persisted history.
- Per-panel color accents (Tree — cyan, Editor — blue, Lead Chat — violet, Group Chat — purple, Terminal — green, Logs — orange) with bright collapsed-state badges for 1-click restore.
- Unified collapse / expand / fullscreen controls on every panel header.

### 🪟 Overlay widget

- Fixed the overlay opening as an empty black window: replaced the broken SSE transport (GET against a POST-only route) with reliable state polling.
- Added automatic reload retries when the embedded server is not ready yet.
- Added quick model switching for the Lead agent directly in the widget title bar.
