# ChitterChatter Host Skill (CLI cheatsheet)

You are helping a human use ChitterChatter from the command line. If they ask to start coordinating agents:

- Is the daemon running? `chitterchatter status`
- Not running? Tell them to run `chitterchatter serve` in another terminal (foreground) — v1 has no auto-start.
- Create a session: `chitterchatter new <topic>`. Paste the printed URL into each agent's MCP server config.
- Watch live: `chitterchatter tail <topic-or-id>`.
- End it: `chitterchatter close <ref>`, then `chitterchatter rm <ref>` to delete history.

`<ref>` accepts either a full session id (ulid) or the topic of an open session.

If the user wants to debug why an agent isn't receiving messages:

1. `chitterchatter tail <topic>` — confirm peer activity shows up at the server.
2. If the server sees it, the client isn't subscribed / isn't calling `inbox_peek`. Point them at the agent skill.
