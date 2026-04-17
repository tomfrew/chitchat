# ChitChat

A self-hosted MCP server that lets multiple AI agents coordinate over topic-scoped sessions on one machine.

## Quickstart

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
bun run bin/chitchat.ts
```

Opens a TUI that also hosts the MCP/HTTP daemon — one process, two things:

- **Left pane**: open sessions. Arrow keys navigate; `c` creates a new one; selection loads that session's message stream.
- **Main pane**: message stream for the selected session. Arrow keys scroll; `Enter` opens a detail overlay showing the full `body` + `meta` for a message.
- `Tab` switches focus between panes. `q` quits.

For a non-interactive environment (piped stdout, CI, systemd, etc.) the TUI auto-detects and falls back to headless daemon-only mode. You can force it explicitly with:

```bash
bun run bin/chitchat.ts --headless
# or equivalent: bun run bin/chitchat.ts serve
```

Install the global MCP endpoint in each agent's config once:

```
http://127.0.0.1:7777/mcp
```

Then create a session from another terminal:

```bash
chitchat new auth-refactor
```

Each agent will:

1. Call `list_sessions` to see open topics, then `identify({ session: "auth-refactor", role: "..." })` to join.
2. Auto-receive a friendly name (Alice, Bob, Carol, ...).
3. Send and receive messages via MCP tools; get push updates via MCP resource subscriptions.

Prefer a one-shot share URL? `chitchat new` also prints a pinned URL `/mcp/<id>` that auto-joins on connect — useful if you don't want to configure a global MCP endpoint per agent.

## Why

Two agents working on the same task (one on the frontend, one on the backend) can trade status, ask questions, and coordinate without custom glue.

## Commands

See [docs/protocol.md](docs/protocol.md) for the full tool/resource surface.

- `chitchat serve` — run the daemon (foreground).
- `chitchat new <topic>` — create a session.
- `chitchat ls [--all]` — list sessions.
- `chitchat show <ref>` — print message history.
- `chitchat tail <ref>` — live-follow a session in the terminal.
- `chitchat close <ref>` — close a session.
- `chitchat rm <ref>` — delete a session + history.
- `chitchat status` — daemon liveness check.

`<ref>` is either a session id (ulid) or the topic of an open session.

## Bind model

Localhost only, no auth. Designed for a single-developer machine running several agents. LAN / cross-machine mode is phase 2.

## Development

```bash
bun install
bun run typecheck
bun test
bun run dev     # foreground daemon with --watch; saves auto-restart on the same port
bun run build   # compiles dist/chitchat — single-file native binary (no Bun needed to run)
```

`bun run dev` uses Bun's built-in `--watch`. Saving any source file triggers a clean SIGTERM + restart; the daemon broadcasts a `server_shutdown` SSE event before closing so connected agents see a proper disconnect signal (~150ms shutdown window).

Storage is `bun:sqlite`. Everything else is plain TypeScript — no compilation step in dev.

## License

MIT.
