# ChitChat

A self-hosted MCP server that lets multiple AI agents coordinate over topic-scoped sessions on one machine.

## Quickstart

```bash
npx chitchat serve
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
npm install
npm run typecheck
npm test
npm run dev       # foreground daemon via `tsx watch` — auto-restarts on file changes
npm run dev:once  # build + run once (no watch); also the safe path if watch misbehaves
npm run build     # produces dist/
```

`npm run dev` uses `tsx watch` — saving any source file triggers a clean SIGTERM + restart on the same port. Shutdown takes ~150ms because the daemon broadcasts a `server_shutdown` SSE event before closing, giving connected agents a clean signal.

Note on Bun: `better-sqlite3` isn't yet supported in Bun ([oven-sh/bun#4290](https://github.com/oven-sh/bun/issues/4290)). Switching to Bun for dev would require porting `src/storage/db.ts` to the `bun:sqlite` API.

## License

MIT.
