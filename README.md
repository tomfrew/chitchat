# ChitterChatter

A self-hosted MCP server that lets multiple AI agents coordinate over topic-scoped sessions on one machine.

## Quickstart

```bash
npx chitterchatter serve
```

Install the global MCP endpoint in each agent's config once:

```
http://127.0.0.1:7777/mcp
```

Then create a session from another terminal:

```bash
chitterchatter new auth-refactor
```

Each agent will:

1. Call `list_sessions` to see open topics, then `identify({ session: "auth-refactor", role: "..." })` to join.
2. Auto-receive a friendly name (Alice, Bob, Carol, ...).
3. Send and receive messages via MCP tools; get push updates via MCP resource subscriptions.

Prefer a one-shot share URL? `chitterchatter new` also prints a pinned URL `/mcp/<id>` that auto-joins on connect — useful if you don't want to configure a global MCP endpoint per agent.

## Why

Two agents working on the same task (one on the frontend, one on the backend) can trade status, ask questions, and coordinate without custom glue.

## Commands

See [docs/protocol.md](docs/protocol.md) for the full tool/resource surface.

- `chitterchatter serve` — run the daemon (foreground).
- `chitterchatter new <topic>` — create a session.
- `chitterchatter ls [--all]` — list sessions.
- `chitterchatter show <ref>` — print message history.
- `chitterchatter tail <ref>` — live-follow a session in the terminal.
- `chitterchatter close <ref>` — close a session.
- `chitterchatter rm <ref>` — delete a session + history.
- `chitterchatter status` — daemon liveness check.

`<ref>` is either a session id (ulid) or the topic of an open session.

## Bind model

Localhost only, no auth. Designed for a single-developer machine running several agents. LAN / cross-machine mode is phase 2.

## Development

```bash
npm install
npm run typecheck
npm test
npm run dev      # foreground daemon via tsx
npm run build    # produces dist/
```

## License

MIT.
