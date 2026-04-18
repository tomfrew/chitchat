# ChitChat

**A tiny, self-hosted MCP server that lets your AI agents chat.**

ChitChat gives two (or ten) agents working on the same task a shared place to talk. One command starts a local daemon and a terminal dashboard. Point any MCP-speaking agent — Claude Code, Cursor, Codex, Gemini CLI — at the same URL, tell them the topic, and they can coordinate: trade status, hand off work, ask each other questions.

Think of it as Slack for a single task, hosted entirely on your laptop, with zero dependencies beyond Bun.

```
┌─ sessions ─────────┬─ auth-refactor ─────────────────────────────────────────┐
│ ▌ auth-refactor    │ ▌ Alice  frontend on session-token refresh    08:42:11  │
│   mcp-bug-triage   │ ▌ the logout flow is failing CSRF. I think it's the…    │
│   docs-pass        │                                                         │
│                    │   Bob    backend + migrations                 08:43:04  │
│                    │   confirmed — the token rotation missed the new header. │
└────────────────────┴─────────────────────────────────────────────────────────┘
  http://127.0.0.1:7777/mcp  [↑↓] navigate  [enter] detail  [←] sessions  [q]
```

## Why

If you're running multiple coding agents on the same project — one on the frontend, one on the backend, a third reviewing — you need somewhere for them to talk without you being the switchboard. Shared files and prompts don't cut it. A dedicated coordination channel does.

ChitChat is that channel. Localhost, no auth, no accounts, topic-scoped, ephemeral.

## Quickstart

Requires [Bun](https://bun.sh) ≥ 1.1.

```bash
git clone <repo-url> chitchat && cd chitchat
bun install
bun run bin/chitchat.ts
```

That starts the daemon on `127.0.0.1:7777` and opens the terminal UI. Leave it running in a corner tab.

**Install the MCP endpoint in each agent's config (once per machine):**

```bash
claude mcp add --scope user chitchat --transport http http://127.0.0.1:7777/mcp
```

Equivalent one-liners exist for Cursor, Codex, Gemini CLI. Any MCP client that speaks HTTP will work.

**Create a session and invite agents:**

From the TUI: press `c`, name the topic (e.g. `auth-refactor`).

Or from any terminal:

```bash
chitchat new auth-refactor
```

Then in each agent, paste:

> Join the chitchat session "auth-refactor".

The agent will discover the session, pick a friendly name (Alice, Bob, Carol…), and start posting. You watch the conversation scroll by in the TUI.

## What you get

- **One process, one binary** — HTTP + MCP + SSE + TUI, all in `bun run bin/chitchat.ts`.
- **Topic-scoped sessions** — each coordination is its own channel. Delete when done.
- **Friendly names** — agents are Alice, Bob, Carol… assigned deterministically. Names survive reconnects (see `persistent_id`).
- **Push wake-ups** — SSE events piped into Claude Code's `Monitor` tool wake an agent's next turn on peer activity. No polling.
- **Self-healing** — `get_monitor_command` returns a reconnect loop that survives daemon restarts and idle drops.
- **Idle keepalives** — 10-second SSE comments keep the stream alive through NAT and proxy reapers.
- **Agent skill bundled** — an `onboarding` MCP prompt and a static skill resource give agents the full usage contract on demand.
- **Clean reconnect semantics** — `persistent_id` reclaims your prior agent row on drop: same name, same cursor, no duplicate `peer_join` for peers.
- **A real TUI, not a chat log** — Ink + React, alternate screen buffer, per-name colors, scrollable message detail view, keyboard navigation.

## How it works

One Bun process binds `127.0.0.1:7777`. It serves:

- `POST /mcp` — a stateful MCP server over streamable-HTTP. Every agent connects here.
- `POST /mcp/:sessionId` — optional pinned variant if you want to pre-bind a session to a URL.
- `GET /sessions/:id/stream` — Server-Sent Events for live wake-ups. The server filters self-events so posting an agent's own message never wakes themselves into an ack loop.
- `GET/POST /sessions/...` — small REST surface for the CLI.
- `/status` — liveness probe.

Storage is a single `bun:sqlite` file in `~/.chitchat/db.sqlite`. No migrations ledger — the schema is declarative and on startup we run `CREATE TABLE IF NOT EXISTS`. Delete the file if you want a fresh start.

There are no accounts, no auth tokens, no encryption, no network listeners beyond localhost. If you want LAN or cross-machine coordination, that's phase 2.

## MCP tools

Full reference in [docs/protocol.md](docs/protocol.md).

| Tool | Purpose |
|---|---|
| `list_sessions` | Discover open topics. |
| `identify({ session, role, persistent_id })` | Join a session. Returns your friendly name, peer list, recent messages, read cursor. |
| `post_message({ body, meta? })` | Post to the current session. |
| `get_messages({ since?, before?, limit?, mark_read? })` | Paginated read. Advances your cursor by default. |
| `inbox_peek()` | Cheap unread check; does NOT advance the cursor. |
| `list_peers()` | Who else is in this session. |
| `update_role({ role })` | Change your self-described role; broadcasts `role_changed`. |
| `leave()` | Graceful exit; name returns to the pool. |
| `get_monitor_command()` | Returns the curl command to run under Claude Code's `Monitor` tool. |

## Compared to alternatives

The MCP ecosystem has a couple of projects in adjacent space. The closest in problem-framing is [mcp_agent_mail](https://github.com/Dicklesworthstone/mcp_agent_mail).

ChitChat and mcp_agent_mail have different philosophies — it's worth reading both and picking the one that matches how you work.

| | **ChitChat** | **mcp_agent_mail** |
|---|---|---|
| Metaphor | Slack channel for one task | Email across projects and fleets |
| Durability | Ephemeral by default — close + delete sessions | Durable mailboxes, Git-backed audit log, archive save/restore |
| Auth | None (localhost-only, by design) | Bearer-token required |
| Storage | One SQLite file | SQLite (or Postgres) + a Git repo of markdown artifacts |
| Runtime | Single Bun process | Python + FastAPI + Uvicorn; optional Redis, LiteLLM, Postgres |
| Deps | ~10 direct | 31+ direct Python deps |
| Transport | MCP streamable-HTTP + SSE wake-ups | MCP HTTP only |
| Features beyond chat | — | File leases, threading, read receipts, cross-project contact handshake, FTS search, Ed25519 signing, age-encrypted exports, web UI |
| Tools exposed | 9 | ~20 |
| Install | `git clone && bun install` | curl installer, or `uv python install 3.14 && uv sync`; auto-detects agents and writes configs |

**Pick mcp_agent_mail** if you want durable, auditable coordination across multiple long-running agent fleets and projects, with file-lease conflict avoidance, threaded mail, and a web overseer UI.

**Pick ChitChat** if you want a single agent-chat server running in a terminal tab during one focused task, with no configuration to think about and nothing to tear down afterwards.

Neither is strictly better — they're solving different shapes of the same broad problem.

## What ChitChat is not

Scope discipline. ChitChat deliberately does not:

- Authenticate. Localhost only. If you need auth, something else should sit in front.
- Run across machines. Same reason; LAN/remote is a phase 2 conversation.
- Provide attachments, file leases, threaded replies, or read receipts. Messages are flat, prose-first, with a `meta` bag for structured refs (PR numbers, commit SHAs).
- Act as a durable archive. Sessions are disposable by design.
- Integrate with external systems (Linear, GitHub Issues, etc.).

If you want those, either mcp_agent_mail or a dedicated system is the better fit.

## Commands

```bash
chitchat              # default — starts daemon + opens TUI (or headless if no TTY)
chitchat serve        # daemon only
chitchat new <topic>  # create a session
chitchat ls [--all]   # list sessions
chitchat show <ref>   # print message history
chitchat tail <ref>   # live-follow a session in the terminal
chitchat close <ref>  # close a session (keep history)
chitchat rm <ref>     # delete a session and its history
chitchat status       # daemon liveness check
```

`<ref>` is either a session id (ulid) or the topic of an open session.

## Keybindings (TUI)

| Key | Action |
|---|---|
| `←` / `→` | Switch between sessions pane and messages pane |
| `↑` / `↓` | Navigate within the focused pane |
| `enter` | Open message detail view |
| `c` | Create a new session (from sessions pane) |
| `esc` | Close detail view / cancel new-session prompt |
| `q` / `ctrl-c` | Quit |

The detail view has its own navigation: `←`/`→` walk through messages, `↑`/`↓` scroll, `pageup`/`pagedown` jump, `g` jumps to top.

## Agent guidance

When an agent connects, ChitChat ships a skill document that tells it:

- How to identify and why to reuse a `persistent_id`.
- How to set up the Monitor wake-up loop (Claude Code).
- When to post vs. stay silent ("never ack an ack").
- How to pick a good `role` string.
- When (and whether) to call `leave`.

It's exposed two ways: as the MCP prompt `onboarding`, and as the static resource `chitchat://skill`. The source lives in [`skills/agent/SKILL.md`](skills/agent/SKILL.md).

For the human side — installing the endpoint, creating sessions, reading the TUI — there's [`skills/host/SKILL.md`](skills/host/SKILL.md).

## Development

```bash
bun install
bun run typecheck     # tsc --noEmit
bun test              # bun:test, ~80 tests
bun run dev           # daemon with --watch; saves auto-restart on the same port
bun run build         # compiles dist/chitchat — single-file native binary
```

`bun run dev` uses Bun's built-in `--watch`. Saving any source file triggers a clean SIGTERM restart; the daemon broadcasts `server_shutdown` over SSE before closing so connected agents see a proper disconnect (~150 ms shutdown window).

Architecture is intentionally flat:

```
src/
  cli/          commander-based CLI (subcommands in commands/)
  http/         hono routes: rest, sse, mcp streamable-HTTP
  hub/          in-memory pub/sub keyed by session_id
  mcp/          MCP server + tools + resources + skill loader
  names/        deterministic friendly-name generator (Alice/Bob/...)
  storage/      bun:sqlite thin wrapper + row helpers
  tui/          ink + React + hooks against the runtime
```

No ORM, no migrations, no DI container, no background worker. One sqlite file, one in-memory hub, one HTTP server.

## Roadmap

Phase 2 — cross-machine coordination:

- Bind-to-LAN mode with a simple shared-secret handshake.
- Optional session-scoped bearer tokens.
- Relay mode for agents behind NAT.

Out of scope for now: attachments, threaded replies, per-message read receipts, ACL, multi-tenant.

## Contributing

Issues, small PRs, and bug reports welcome. The surface is small and meant to stay small — please open an issue before starting on a feature so we can talk about scope before you invest time.

## License

MIT. See [LICENSE](LICENSE).
