import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { Runtime } from "./runtime.js";
import type { MessageWithSender } from "../storage/messages.js";
import { createSession } from "../storage/sessions.js";
import { useSessions, useMessages } from "./hooks.js";

type Focus = "sessions" | "messages" | "detail" | "new";

export function App({ runtime }: { runtime: Runtime }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [rows, setRows] = useState(stdout?.rows ?? 40);
  const [cols, setCols] = useState(stdout?.columns ?? 120);

  useEffect(() => {
    if (!stdout) return;
    const handler = () => {
      setRows(stdout.rows ?? 40);
      setCols(stdout.columns ?? 120);
    };
    stdout.on("resize", handler);
    return () => {
      stdout.off("resize", handler);
    };
  }, [stdout]);

  const sessions = useSessions(runtime);
  const [selectedSessionIdx, setSelectedSessionIdx] = useState(0);
  const activeSession = sessions[selectedSessionIdx];
  const messages = useMessages(runtime, activeSession?.id ?? null);
  const [messageIdx, setMessageIdx] = useState(0);
  const [focus, setFocus] = useState<Focus>("sessions");
  const [error, setError] = useState<string | null>(null);

  // Clamp selections when underlying data changes.
  useEffect(() => {
    if (selectedSessionIdx >= sessions.length) setSelectedSessionIdx(Math.max(0, sessions.length - 1));
  }, [sessions.length, selectedSessionIdx]);

  useEffect(() => {
    // Auto-select the newest message when the list grows.
    setMessageIdx(Math.max(0, messages.length - 1));
  }, [activeSession?.id, messages.length]);

  useInput((input, key) => {
    if (focus === "new" || focus === "detail") return;
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }
    // Left/right arrows (or tab) switch panes. Up/down navigate inside
    // the focused pane.
    if (key.leftArrow) {
      setFocus("sessions");
      return;
    }
    if (key.rightArrow) {
      setFocus("messages");
      return;
    }
    if (key.tab) {
      setFocus((f) => (f === "sessions" ? "messages" : "sessions"));
      return;
    }
    if (focus === "sessions") {
      if (key.upArrow || input === "k") setSelectedSessionIdx((i) => Math.max(0, i - 1));
      else if (key.downArrow || input === "j")
        setSelectedSessionIdx((i) => Math.min(sessions.length - 1, i + 1));
      else if (input === "c") setFocus("new");
      else if (key.return) setFocus("messages");
    } else if (focus === "messages") {
      if (key.upArrow || input === "k") setMessageIdx((i) => Math.max(0, i - 1));
      else if (key.downArrow || input === "j")
        setMessageIdx((i) => Math.min(messages.length - 1, i + 1));
      else if (key.pageUp) setMessageIdx((i) => Math.max(0, i - 5));
      else if (key.pageDown) setMessageIdx((i) => Math.min(messages.length - 1, i + 5));
      else if (key.return && messages.length > 0) setFocus("detail");
    }
  });

  const handleNewSession = (topic: string) => {
    const t = topic.trim();
    if (!t) {
      setFocus("sessions");
      return;
    }
    try {
      const s = createSession(runtime.db, { topic: t });
      const nextList = runtime.sessions();
      const idx = nextList.findIndex((x) => x.id === s.id);
      setSelectedSessionIdx(Math.max(0, idx));
      setFocus("messages");
    } catch (e) {
      setError((e as Error).message);
      setFocus("sessions");
      setTimeout(() => setError(null), 3000);
    }
  };

  // Sessions pane: 22% of width, clamped to [20, 36] so it never starves
  // the messages pane on narrow terminals nor wastes space on wide ones.
  const sessionsWidth = Math.max(20, Math.min(36, Math.floor(cols * 0.22)));
  const messagesWidth = cols - sessionsWidth;
  const LOGO_HEIGHT = 3;
  const LOGO_GAP = 1;
  const bodyHeight = rows - 1; // reserve status bar only
  const sessionsHeight = bodyHeight - LOGO_HEIGHT - LOGO_GAP; // logo + spacer stolen from sessions column only

  // Render the detail view as a full-screen replacement instead of an
  // absolute-positioned overlay. Ink's position=absolute doesn't composite
  // a background under the floating box, so underlying content bleeds
  // through. Screen-swap gives us a clean, readable modal.
  if (focus === "detail" && messages[messageIdx]) {
    return (
      <Box flexDirection="column" width={cols} height={rows}>
        <DetailScreen
          messages={messages}
          index={messageIdx}
          onNavigate={setMessageIdx}
          onClose={() => setFocus("messages")}
          width={cols}
          height={bodyHeight}
        />
        <StatusBar
          runtime={runtime}
          focus={focus}
          error={error}
        />
      </Box>
    );
  }

  if (focus === "new") {
    // Centered prompt; ink doesn't composite overlays cleanly so the
    // panes underneath are hidden while the modal is up.
    return (
      <Box flexDirection="column" width={cols} height={rows}>
        <Box
          flexDirection="column"
          flexGrow={1}
          alignItems="center"
          justifyContent="center"
        >
          <NewSessionPrompt
            onSubmit={handleNewSession}
            onCancel={() => setFocus("sessions")}
          />
        </Box>
        <StatusBar runtime={runtime} focus={focus} error={error} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Box flexDirection="row" height={bodyHeight}>
        <Box flexDirection="column" width={sessionsWidth}>
          <Logo width={sessionsWidth} />
          <SessionsPane
            sessions={sessions}
            selectedIdx={selectedSessionIdx}
            focused={focus === "sessions"}
            width={sessionsWidth}
            height={sessionsHeight}
          />
        </Box>
        <MessagesPane
          title={activeSession?.topic ?? "—"}
          sessionTopic={activeSession?.topic ?? null}
          mcpUrl={`http://${runtime.cfg.host}:${runtime.cfg.port}/mcp`}
          messages={messages}
          selectedIdx={messageIdx}
          focused={focus === "messages"}
          width={messagesWidth}
          height={bodyHeight}
        />
      </Box>
      <StatusBar runtime={runtime} focus={focus} error={error} />
    </Box>
  );
}

// ----- logo -----

/**
 * Small 3-row banner sized to fit inside (or beside) the sessions pane.
 * Quarter-block glyphs keep it tight — about 15 columns wide.
 */
function Logo({ width: _width }: { width: number }) {
  const art = [
    "▄▖▌ ▘▗ ▄▖▌   ▗ ",
    "▌ ▛▌▌▜▘▌ ▛▌▀▌▜▘",
    "▙▖▌▌▌▐▖▙▖▌▌█▌▐▖",
  ];
  return (
    <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
      {art.map((line, i) => (
        <Text key={i} color="cyan">
          {line}
        </Text>
      ))}
    </Box>
  );
}

// ----- sessions pane -----

function SessionsPane({
  sessions,
  selectedIdx,
  focused,
  width,
  height,
}: {
  sessions: import("./runtime.js").SessionSummary[];
  selectedIdx: number;
  focused: boolean;
  width: number;
  height: number;
}) {
  const innerWidth = Math.max(6, width - 4);

  return (
    <TitledBox
      title="sessions"
      width={width}
      height={height}
      borderColor={focused ? "blue" : "cyan"}
    >
      <Box flexDirection="column" flexGrow={1}>
      {sessions.length === 0 ? (
        <Text color="gray">press `c` to create a session</Text>
      ) : (
        sessions.map((s, i) => {
          const isSel = i === selectedIdx;
          const label = truncate(s.topic, innerWidth - 12);
          const counts = `${s.peer_count}p ${s.message_count}m`;
          // 2 leading chars (marker + space) and 1 trailing safety gutter
          // eat into the available width before label/padding/counts.
          // 1 marker col + label + padding + counts = innerWidth.
          const spaces = Math.max(1, innerWidth - 1 - label.length - counts.length);
          return (
            <Text key={s.id} bold={isSel}>
              {isSel ? (
                <Text color="blue" bold>{"▌"}</Text>
              ) : (
                <Text>{" "}</Text>
              )}
              <Text color="white">{label}</Text>
              {" ".repeat(spaces)}
              <Text color="gray">{counts}</Text>
            </Text>
          );
        })
      )}
      </Box>
    </TitledBox>
  );
}

// ----- messages pane -----

function MessagesPane({
  title,
  sessionTopic,
  mcpUrl,
  messages,
  selectedIdx,
  focused,
  width,
  height,
}: {
  title: string;
  sessionTopic: string | null;
  mcpUrl: string;
  messages: MessageWithSender[];
  selectedIdx: number;
  focused: boolean;
  width: number;
  height: number;
}) {
  const innerWidth = Math.max(20, width - 4);

  // Each MessagePreview renders exactly 2 terminal lines. Compute visible
  // count based on the actual rendered height: pane height - top/bottom
  // border (2) - title row (1) - footer counter row (1) = list area.
  // 2 content lines per message + 1 blank spacer row for breathing room.
  const LINES_PER_ITEM = 3;
  // TitledBox overhead: 1 row for inline-title border + 1 for bottom
  // border of the inner Box + 1 for the footer counter = 3 rows.
  const listHeight = Math.max(LINES_PER_ITEM, height - 3);
  const visibleItems = Math.max(1, Math.floor(listHeight / LINES_PER_ITEM));

  const firstVisible = Math.max(
    0,
    Math.min(
      Math.max(0, messages.length - visibleItems),
      selectedIdx - Math.floor(visibleItems / 2),
    ),
  );
  const slice = messages.slice(firstVisible, firstVisible + visibleItems);

  return (
    <TitledBox
      title={truncate(title, innerWidth)}
      width={width}
      height={height}
      borderColor={focused ? "blue" : "cyan"}
    >
      <Box flexDirection="column" flexGrow={1}>
        {messages.length === 0 ? (
          <EmptySessionHelp sessionTopic={sessionTopic} mcpUrl={mcpUrl} />
        ) : (
          slice.map((m, i) => {
            const idx = firstVisible + i;
            const isSel = idx === selectedIdx;
            const isLast = i === slice.length - 1;
            return (
              <Box key={m.id} flexDirection="column" marginBottom={isLast ? 0 : 1}>
                <MessagePreview message={m} selected={isSel} width={innerWidth} />
              </Box>
            );
          })
        )}
      </Box>
      {messages.length > 0 && (
        <Box>
          <Text color="gray">
            {selectedIdx + 1}/{messages.length}
            {firstVisible > 0 ? " ↑" : "  "}
            {firstVisible + visibleItems < messages.length ? " ↓" : ""}
          </Text>
        </Box>
      )}
    </TitledBox>
  );
}

function MessagePreview({
  message,
  selected,
  width,
}: {
  message: MessageWithSender;
  selected: boolean;
  width: number;
}) {
  const ts = new Date(message.created_at).toISOString().slice(11, 19);
  const from = message.sender_name ?? "system";
  const role = message.sender_role ? truncate(message.sender_role, 48) : "";
  const body = oneLine(message.body, Math.max(20, width - 4));
  const nameColor = colorForName(from);

  // Header layout: [▌][name (role)]  ……padding……  [ts]
  // Timestamp pinned to the right edge. Truncate role if the header
  // would overflow.
  const marker = 1;
  const nameLen = from.length + (role ? 1 + role.length : 0);
  const tsLen = ts.length;
  const filler = Math.max(1, width - marker - nameLen - tsLen);
  const roleTrimmed = filler > 1 ? role : ""; // drop role if too tight

  const gutter = selected ? (
    <Text color="blue" bold>{"▌"}</Text>
  ) : (
    <Text>{" "}</Text>
  );

  return (
    <Box flexDirection="column">
      <Text>
        {gutter}
        <Text color={nameColor} bold>{from}</Text>
        {roleTrimmed ? <Text color="gray"> {roleTrimmed}</Text> : null}
        {" ".repeat(
          Math.max(1, width - marker - from.length - (roleTrimmed ? 1 + roleTrimmed.length : 0) - tsLen),
        )}
        <Text color="gray">{ts}</Text>
      </Text>
      <Text>
        {gutter}
        <Text color="white">{body}</Text>
      </Text>
    </Box>
  );
}

function EmptySessionHelp({
  sessionTopic,
  mcpUrl,
}: {
  sessionTopic: string | null;
  mcpUrl: string;
}) {
  if (!sessionTopic) {
    return <Text color="gray">no session selected</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text color="gray">no messages yet — here's how to get agents talking.</Text>
      <Text> </Text>
      <Text>
        <Text color="gray">1. install the MCP server in the agent's config (once per machine):</Text>
      </Text>
      <Text>   <Text color="cyan">claude mcp add --scope user chitchat --transport http {mcpUrl}</Text></Text>
      <Text> </Text>
      <Text>
        <Text color="gray">2. paste this to your agent to get them started:</Text>
      </Text>
      <Text>   <Text color="cyan">Join the chitchat session &quot;{sessionTopic}&quot;.</Text></Text>
    </Box>
  );
}

// ----- detail overlay -----

function DetailScreen({
  messages,
  index,
  onNavigate,
  onClose,
  width,
  height,
}: {
  messages: MessageWithSender[];
  index: number;
  onNavigate: (idx: number) => void;
  onClose: () => void;
  width: number;
  height: number;
}) {
  const message = messages[index];
  const [scroll, setScroll] = useState(0);
  // Reset scroll to the top whenever we navigate to a different message.
  useEffect(() => {
    setScroll(0);
  }, [index]);

  useInput((input, key) => {
    if (key.escape || input === "q") onClose();
    else if (key.leftArrow || input === "h") {
      if (index > 0) onNavigate(index - 1);
    } else if (key.rightArrow || input === "l") {
      if (index < messages.length - 1) onNavigate(index + 1);
    } else if (key.upArrow || input === "k") setScroll((s) => Math.max(0, s - 1));
    else if (key.downArrow || input === "j") setScroll((s) => s + 1);
    else if (key.pageUp) setScroll((s) => Math.max(0, s - 10));
    else if (key.pageDown) setScroll((s) => s + 10);
    else if (input === "g") setScroll(0);
  });

  const innerWidth = Math.max(20, width - 4);
  const ts = new Date(message.created_at).toISOString();
  const meta = message.meta ? JSON.stringify(message.meta, null, 2) : "(none)";

  const lines: string[] = [];
  lines.push(`id       ${message.id}`);
  lines.push(`ts       ${ts}`);
  lines.push(
    `from     ${message.sender_name ?? "system"}${message.sender_role ? ` (${message.sender_role})` : ""}`,
  );
  lines.push("");
  lines.push("─ body ".padEnd(innerWidth, "─"));
  for (const l of wrap(message.body, innerWidth)) lines.push(l);
  lines.push("");
  // metaStart marks where the gray-rendered section begins. The divider
  // itself is part of the meta section so it reads as a label for what
  // follows.
  const metaStart = lines.length;
  lines.push("─ meta ".padEnd(innerWidth, "─"));
  for (const l of meta.split("\n")) {
    for (const w of wrap(l, innerWidth)) lines.push(w);
  }

  // Approximate the visible rows: outer box height minus top+bottom border
  // + header row. Used only to clamp the scroll so you can't scroll past
  // the last useful position (otherwise scrolling past-end and back looks
  // like the content is jumping).
  const approxViewport = Math.max(3, height - 3);
  const maxScroll = Math.max(0, lines.length - approxViewport);
  const effectiveScroll = Math.min(Math.max(0, scroll), maxScroll);

  const titleText = `detail · ${index + 1}/${messages.length} · line ${effectiveScroll + 1}/${lines.length}`;
  const from = effectiveScroll;
  const visible = lines.slice(from, from + approxViewport);
  return (
    <TitledBox title={titleText} width={width} height={height}>
      {/* One <Text> per row. Two adjacent multi-line <Text> siblings in a
          flex column render incorrectly in Ink (the second block's rows
          collide with the first's), so we flatten to per-line nodes and
          color each based on whether it's in the meta section. */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visible.map((line, i) => {
          const absIdx = from + i;
          const isMeta = absIdx >= metaStart;
          return (
            <Text key={absIdx} wrap="truncate-end" color={isMeta ? "gray" : undefined}>
              {line === "" ? " " : line}
            </Text>
          );
        })}
      </Box>
    </TitledBox>
  );
}

// ----- new session prompt -----

function NewSessionPrompt({
  onSubmit,
  onCancel,
}: {
  onSubmit: (topic: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });
  // Render above the status bar via Ink's DOM order; the main layout
  // already drew its content, this sits at the end of the Box stream.
  // Not using position=absolute because ink doesn't composite a background.
  return (
    <TitledBox title="new session" width={60} height={6}>
      <Box>
        <Text color="gray">name: </Text>
        <TextInput value={value} onChange={setValue} onSubmit={onSubmit} />
      </Box>
      <Text color="gray">enter to create · esc to cancel</Text>
    </TitledBox>
  );
}

// ----- status bar -----

function StatusBar({
  runtime,
  focus,
  error,
}: {
  runtime: Runtime;
  focus: Focus;
  error: string | null;
}) {
  const hint =
    focus === "new"
      ? "[enter] create  [esc] cancel"
      : focus === "detail"
        ? "[←/→] prev/next  [↑↓] scroll  [esc/q] close"
        : focus === "sessions"
          ? "[↑↓] navigate  [→] messages  [c] new  [q] quit"
          : "[↑↓] navigate  [enter] detail  [←] sessions  [q] quit";
  return (
    <Box backgroundColor="cyan">
      <Text color="black">
        {" "}
        http://{runtime.cfg.host}:{runtime.cfg.port}/mcp
        {"  "}
        {error ? <Text color="red">{error}</Text> : hint}
        {" "}
      </Text>
    </Box>
  );
}

// ----- helpers -----

/**
 * A bordered box with the title embedded inline on the top border, the
 * way blessed / tview / helix etc. render paneled apps. Ink doesn't have
 * a native title-in-border prop, so we draw the top edge ourselves and
 * disable the inner Box's top border with `borderTop={false}` so the
 * corners align.
 */
function TitledBox({
  title,
  width,
  height,
  borderColor = "cyan",
  children,
}: {
  title: string;
  width: number;
  height: number;
  borderColor?: string;
  children: React.ReactNode;
}) {
  const label = ` ${title} `;
  const innerDashes = Math.max(0, width - 2 /* corners */ - 1 /* lead dash */ - label.length);
  const topBorder = "╭─" + label + "─".repeat(innerDashes) + "╮";

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Text color={borderColor}>{topBorder}</Text>
      <Box
        borderStyle="round"
        borderColor={borderColor}
        borderTop={false}
        flexGrow={1}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
        {children}
      </Box>
    </Box>
  );
}

/**
 * Deterministic per-name color. Same name across the session — and across
 * sessions — always picks the same color, so you build a visual memory of
 * who's who. Palette avoids red (errors), gray/black (dim text), and
 * white (default content) so the name genuinely stands out.
 */
const NAME_PALETTE = [
  "cyan",
  "green",
  "yellow",
  "magenta",
  "blue",
  "cyanBright",
  "greenBright",
  "magentaBright",
  "blueBright",
  "yellowBright",
] as const;
type NameColor = (typeof NAME_PALETTE)[number];

function colorForName(name: string): NameColor {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return NAME_PALETTE[(h >>> 0) % NAME_PALETTE.length];
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, Math.max(1, n - 1)) + "…";
}

function oneLine(s: string, n: number): string {
  return truncate(s.replace(/\s+/g, " ").trim(), n);
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function wrap(s: string, n: number): string[] {
  const lines: string[] = [];
  for (const raw of s.split("\n")) {
    if (raw.length <= n) {
      lines.push(raw);
      continue;
    }
    let remaining = raw;
    while (remaining.length > n) {
      const slice = remaining.slice(0, n);
      const lastSpace = slice.lastIndexOf(" ");
      const cut = lastSpace > n * 0.6 ? lastSpace : n;
      lines.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).replace(/^\s+/, "");
    }
    if (remaining) lines.push(remaining);
  }
  return lines;
}
