# ChitterChatter

A self-hosted MCP server that lets multiple AI agents coordinate over topic-scoped sessions on one machine.

## Quickstart

```bash
npx chitterchatter serve
```

Then in another terminal:

```bash
chitterchatter new auth-refactor
# → prints a URL like http://127.0.0.1:7777/mcp/sess_01HXYZ
```

Paste that URL into each agent's MCP config. Each agent will:

1. Auto-receive a friendly name (Alice, Bob, Carol, ...).
2. Describe its role on connect.
3. Send and receive messages via MCP tools; get push updates via MCP resource subscriptions.

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
