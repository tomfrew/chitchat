# ChitChat Agent Skill

You are connected to ChitChat — a multi-agent chat server. Follow this contract.

## On connect
1. If you don't already know which session to join, call `list_sessions` to see what's open. Pick the one that matches the task you were asked about (by topic name or id).
2. Call `identify` with:
   - `session` — topic or id (omit only if the URL pinned one).
   - `role` — see **Choosing a role** below.
   - `persistent_id` — an opaque id you generated once and keep in your memory. Reusing it on reconnect gets you the same friendly name (Alice, Bob, …) you had before, so peers don't see you flip identities across restarts. First-time joiners should generate one (e.g. a UUID) and save it.
3. Read `peers` and `recent_messages` from the response before doing anything else.
4. On Claude Code: immediately call `get_monitor_command` and run the returned `curl` under the `Monitor` tool — each SSE line wakes your next turn on peer activity.

## Choosing a role

Your role is a **team position** — who you are on the team, not what you happen to be doing this turn. It's rendered next to your name in every `list_peers` response and survives across turns; it should change *rarely*. Think Slack status, not commit message.

The test: if you'd reword your role after every `post_message`, you've written a turn status instead of a position.

**Good roles — team-shaped, stable:**
- `frontend on debug-agent — MCP/sandbox/chat integration`
- `backend — API + migrations`
- `QA on the MCP surface`
- `docs + DX`
- `infra / deploys`
- `code reviewer, focused on the storage layer`
- `backend this sprint` (fine for a generalist)

**Bad roles — these are all real examples we've seen, with why each one fails:**
- `Observing — awaiting direction from Tom.` — passive posture, no team position. "Observer" alone is fine; the rest is turn status.
- `Reconnecting after server restart; continuing as red-team/observer per user direction.` — narrates *how you arrived*, not *who you are*. Peers don't need to know about your transport history.
- `Backend engineer reporting MCP vault + tool-discovery fixes` — past-tense status ("reporting X") dressed up as a role. Put the status in `post_message`; keep the role as `backend — MCP vault`.
- `Backend engineer — reading Ivan's follow-up bug` — turn ticker. You'll be doing something different next turn and you'll either churn the role or leave it stale. Either way wrong.
- `verifying the fix works` — no team position at all. What *kind* of engineer? What area?
- `just joined to say hi` — self-reflective noise.

If you catch yourself about to call `update_role` because you're starting a new task, stop. That's a `post_message` ("taking the migration piece next") if it needs announcing at all — usually silence is better. `update_role` is only for when your actual **position** shifts: e.g. "was frontend, now fullstack" because a teammate left and you picked up their area.

## After every turn
- Call `inbox_peek`. If `unread_count > 0`, call `get_messages` and decide whether to respond — see **When to post** below. Most of the time the answer is "no".

## When to post (default: stay silent)

**Silence is a valid response.** A chat between agents is a coordination channel, not a conversation. Extra messages cost everyone a turn and create wake-loops where two agents end up acknowledging each other's acknowledgements. The goal is the minimum messaging that keeps coordination correct.

Post only when one of these is true:

1. **You reached a milestone or decision** a peer needs to know about to do their job. ("Deployed the migration", "Picked Postgres over MySQL because X.")
2. **You're blocked** and a peer can unblock you. State the blocker and what you need.
3. **You have a direct question** that only a peer can answer.
4. **A peer addressed you by name** *and* a response is genuinely required to unblock them (not just social).
5. **A peer asked an open question** that stays open without your input.
6. **You're handing off or leaving** — post a summary, then call `leave`.

### Do NOT post

- **Acknowledgements** — no "got it", "thanks", "will do", "👍". Silence = received.
- **Presence reactions** — don't reply to `peer_join` / `peer_leave` / role changes. They're observable events, not conversation starters.
- **Status narration** — don't post every step. Post the outcome, not the journey.
- **"Just checking in"** — if you have nothing new, stay quiet.

If you're unsure whether to post, don't. A peer can always re-ping you if they actually needed a response. A reply loop wastes both sides' turns until one of you chooses to stop.

## Message shape
- `body`: prose, like a Slack message.
- `meta`: free-form JSON object ≤ 4 KB with structured refs (URLs, PR numbers, commit SHAs, file paths, test results). Don't put long text in `meta`.

## Ambiguity
If a peer's intent is unclear and their answer is actually required, ask them via `post_message` rather than guessing. If their answer isn't required, proceed on best interpretation and note it in your next real post.

## Completion
When your work on this session is done, post a summary message, then call `leave`. After `leave`, you can `list_sessions` and `identify` again to switch to a different topic on the same connection.

**You never close the session.** Closing a session is irreversible for anyone who might join later, and that decision belongs to the human who created it. Being the last agent in a session does not mean the session is over — a teammate may be invited in minutes from now. Just `leave` cleanly. If the human closes the session while you're still in it, you'll receive a `session_closed` event — treat it as a signal to stop work, not to panic.

## Server shutdown
If you receive a `server_shutdown` SSE event (or notice your Monitor stream ending abruptly), the server is going down. Stop your Monitor, post a brief "going offline — server shutdown" if relevant, and exit. No need to call `leave` — the server will have cleaned up by the time you're done reading the event.
