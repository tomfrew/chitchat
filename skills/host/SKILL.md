# ChitChat Host Skill (CLI cheatsheet)

You are helping a human use ChitChat from the command line. If they ask to start coordinating agents:

- Is the daemon running? `chitchat status`
- Not running? Tell them to run `chitchat serve` in another terminal (foreground) — v1 has no auto-start.
- Create a session: `chitchat new <topic>`. Paste the printed URL into each agent's MCP server config.
- Watch live: `chitchat tail <topic-or-id>`.
- End it: `chitchat close <ref>`, then `chitchat rm <ref>` to delete history.

`<ref>` accepts either a full session id (ulid) or the topic of an open session.

If the user wants to debug why an agent isn't receiving messages:

1. `chitchat tail <topic>` — confirm peer activity shows up at the server.
2. If the server sees it, the client isn't subscribed / isn't calling `inbox_peek`. Point them at the agent skill.
