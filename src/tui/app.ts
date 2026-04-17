import blessed from "neo-blessed";
import type { Runtime } from "./runtime.js";
import { createSession } from "../storage/sessions.js";
import type { MessageWithSender } from "../storage/messages.js";

/**
 * ChitChat TUI.
 *
 * Layout:
 *   ┌──────────────┬──────────────────────────────────────────────┐
 *   │  Sessions    │  <topic>                                     │
 *   │  [list]      │  [scrollable message log]                    │
 *   │              │                                              │
 *   │              │                                              │
 *   │              │                                              │
 *   ├──────────────┴──────────────────────────────────────────────┤
 *   │ status bar: keyboard hints                                  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Focus toggles with Tab. `c` creates a session, arrow keys navigate the
 * focused pane, Enter opens a detail sidebar over the message log for the
 * currently-highlighted message. `q` quits.
 */
export function runTui(rt: Runtime): Promise<void> {
  return new Promise((resolve) => {
    const screen = blessed.screen({
      smartCSR: true,
      title: `chitchat ${rt.cfg.host}:${rt.cfg.port}`,
      fullUnicode: true,
    });

    // --- Sessions pane (left) ---
    const sessionsBox = blessed.list({
      parent: screen,
      label: " sessions ",
      top: 0,
      left: 0,
      width: "30%",
      height: "100%-1",
      border: { type: "line" },
      style: {
        border: { fg: "gray" },
        selected: { bg: "blue", fg: "white" },
        focus: { border: { fg: "cyan" } },
      },
      keys: true,
      vi: false,
      mouse: true,
      tags: true,
    });

    // --- Messages pane (right) ---
    // Each message renders as a 2-line preview (header + single body line)
    // with a blank separator. Selection is tracked manually so the whole
    // item highlights — blessed.list only supports single-line items, so
    // we drive a blessed.box ourselves.
    const messagesBox = blessed.box({
      parent: screen,
      label: " messages ",
      top: 0,
      left: "30%",
      width: "70%",
      height: "100%-1",
      border: { type: "line" },
      padding: { left: 1, right: 2 },
      style: {
        border: { fg: "gray" },
        focus: { border: { fg: "cyan" } },
      },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: false,
      mouse: true,
      tags: true,
      wrap: false,
      scrollbar: {
        ch: " ",
        track: { bg: "black" },
        style: { bg: "cyan" },
      },
    });

    // --- Detail sidebar (hidden by default) ---
    const detailBox = blessed.box({
      parent: screen,
      label: " detail ",
      top: "10%",
      left: "center",
      width: "60%",
      height: "80%",
      border: { type: "line" },
      padding: { left: 1, right: 2 },
      style: {
        border: { fg: "cyan" },
        bg: "black",
      },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      tags: true,
      wrap: true,
      scrollbar: {
        ch: " ",
        track: { bg: "black" },
        style: { bg: "cyan" },
      },
      hidden: true,
    });

    // --- Status bar ---
    const status = blessed.box({
      parent: screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      style: { fg: "black", bg: "cyan" },
      tags: true,
    });

    // ---- State ----
    let selectedSessionId: string | null = null;
    let currentMessages: MessageWithSender[] = [];
    let messageSelection = 0; // index into currentMessages for Enter-to-detail

    // ---- Rendering helpers ----
    function setStatus(hint: string) {
      status.setContent(
        ` {bold}chitchat{/bold}  http://${rt.cfg.host}:${rt.cfg.port}/mcp   ${hint}`,
      );
      screen.render();
    }

    function refreshSessions() {
      const sessions = rt.sessions();
      const lines = sessions.map(
        (s) =>
          `${s.topic.padEnd(20).slice(0, 20)}  {gray-fg}${s.peer_count}p ${s.message_count}m{/}`,
      );
      const prev = (sessionsBox as unknown as { selected?: number }).selected ?? 0;
      sessionsBox.setItems(lines);
      if (sessions.length > 0) {
        const idx = Math.min(prev, sessions.length - 1);
        sessionsBox.select(idx);
        const target = sessions[idx].id;
        if (target !== selectedSessionId) selectSession(target);
      } else {
        messagesBox.setContent("{gray-fg}no open sessions — press `c` to create one{/}");
        messagesBox.setLabel(" messages ");
        selectedSessionId = null;
      }
      screen.render();
    }

    const LINES_PER_ITEM = 3; // header, body preview, separator

    function renderMessages() {
      if (currentMessages.length === 0) {
        messagesBox.setContent("{gray-fg}(no messages yet){/}");
        return;
      }
      // Clamp selection if list shrank or grew.
      messageSelection = Math.max(0, Math.min(messageSelection, currentMessages.length - 1));

      const previewWidth = Math.max(
        20,
        ((messagesBox.width as number) || 80) - 6, // border + padding
      );
      const lines: string[] = [];
      for (let i = 0; i < currentMessages.length; i++) {
        const m = currentMessages[i];
        const selected = i === messageSelection;
        const ts = new Date(m.created_at).toISOString().slice(11, 19);
        const from = m.sender_name ?? "system";
        const role = m.sender_role ? ` (${truncate(m.sender_role, 24)})` : "";
        const meta = m.meta && Object.keys(m.meta).length > 0 ? " [meta]" : "";
        const preview = oneLine(m.body, previewWidth - 2);

        const header = selected
          ? `{inverse}{bold}▌ ${ts}  ${from}${role}${meta}{/bold}{/inverse}`
          : `{gray-fg}${ts}{/}  {cyan-fg}${from}{/}{gray-fg}${role}${meta}{/}`;
        const body = selected
          ? `{inverse}  ${preview}{/inverse}`
          : `  ${preview}`;

        lines.push(header);
        lines.push(body);
        lines.push("");
      }
      messagesBox.setContent(lines.join("\n"));
      scrollToSelection();
    }

    function scrollToSelection() {
      const viewportH = (messagesBox.height as number) - 2;
      const top = messageSelection * LINES_PER_ITEM;
      // Keep the selected item ~1/3 from the top of the viewport.
      const desiredScroll = Math.max(0, top - Math.floor(viewportH / 3));
      (messagesBox as unknown as { setScroll: (n: number) => void }).setScroll(
        desiredScroll,
      );
      screen.render();
    }

    let hubUnsub: (() => void) | null = null;

    function selectSession(id: string) {
      selectedSessionId = id;
      const sessions = rt.sessions();
      const s = sessions.find((x) => x.id === id);
      messagesBox.setLabel(` ${s?.topic ?? id} `);
      currentMessages = rt.messages(id, 200);
      messageSelection = Math.max(0, currentMessages.length - 1);
      renderMessages();
      if (hubUnsub) hubUnsub();
      hubUnsub = rt.hub.subscribe(id, (e) => {
        if (e.type === "message") {
          currentMessages.push({
            ...e.message,
            sender_name: e.sender_name,
            sender_role: e.sender_role,
          });
          renderMessages();
        } else if (
          e.type === "peer_join" ||
          e.type === "peer_leave" ||
          e.type === "role_changed"
        ) {
          // Refresh the session counts; selection stays put.
          refreshSessions();
        }
      });
    }

    function showDetail() {
      if (!currentMessages.length) return;
      const m = currentMessages[Math.min(messageSelection, currentMessages.length - 1)];
      const ts = new Date(m.created_at).toISOString();
      const meta = m.meta ? JSON.stringify(m.meta, null, 2) : "(none)";
      detailBox.setContent(
        [
          `{bold}id{/}       ${m.id}`,
          `{bold}ts{/}       ${ts}`,
          `{bold}from{/}     ${m.sender_name ?? "system"} ${m.sender_role ? `(${m.sender_role})` : ""}`,
          ``,
          `{bold}body{/}`,
          m.body,
          ``,
          `{bold}meta{/}`,
          meta,
        ].join("\n"),
      );
      detailBox.show();
      detailBox.focus();
      screen.render();
    }

    function hideDetail() {
      detailBox.hide();
      messagesBox.focus();
      screen.render();
    }

    function promptNewSession() {
      const prompt = blessed.prompt({
        parent: screen,
        top: "center",
        left: "center",
        width: 60,
        height: 9,
        border: { type: "line" },
        style: { border: { fg: "cyan" }, bg: "black" },
        keys: true,
        label: " new session ",
      });
      prompt.input("Topic:", "", (_err: Error | null, value?: string) => {
        prompt.destroy();
        const topic = (value ?? "").trim();
        if (topic) {
          try {
            const s = createSession(rt.db, { topic });
            refreshSessions();
            selectSession(s.id);
          } catch (e) {
            setStatus(`{red-fg}${(e as Error).message}{/}`);
            setTimeout(() => setStatus(hint()), 2500);
          }
        }
        sessionsBox.focus();
        screen.render();
      });
    }

    function hint(): string {
      return "[tab] switch pane  [c] new session  [enter] detail  [q] quit";
    }

    // ---- Keybindings ----
    screen.key(["q", "C-c"], () => {
      if (hubUnsub) hubUnsub();
      screen.destroy();
      resolve();
    });

    screen.key(["tab"], () => {
      if (detailBox.visible) return; // detail has its own focus
      const focused = screen.focused;
      if (focused === sessionsBox) messagesBox.focus();
      else sessionsBox.focus();
      screen.render();
    });

    sessionsBox.on("select", (_el: unknown, idx: number) => {
      const s = rt.sessions()[idx];
      if (s) selectSession(s.id);
    });

    messagesBox.key(["up", "k"], () => {
      if (messageSelection > 0) {
        messageSelection--;
        renderMessages();
      }
    });
    messagesBox.key(["down", "j"], () => {
      if (messageSelection < currentMessages.length - 1) {
        messageSelection++;
        renderMessages();
      }
    });
    messagesBox.key(["pageup"], () => {
      messageSelection = Math.max(0, messageSelection - 5);
      renderMessages();
    });
    messagesBox.key(["pagedown"], () => {
      messageSelection = Math.min(currentMessages.length - 1, messageSelection + 5);
      renderMessages();
    });
    messagesBox.key("g", () => {
      messageSelection = 0;
      renderMessages();
    });
    messagesBox.key("G", () => {
      messageSelection = currentMessages.length - 1;
      renderMessages();
    });
    messagesBox.key("enter", showDetail);
    detailBox.key(["escape", "enter", "q"], hideDetail);

    screen.key("c", () => {
      promptNewSession();
    });

    // Periodic refresh in case a session is created via REST by an agent.
    const tick = setInterval(() => {
      if (!detailBox.visible) refreshSessions();
    }, 2000);

    screen.on("destroy", () => clearInterval(tick));

    // ---- First paint ----
    refreshSessions();
    sessionsBox.focus();
    setStatus(hint());
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function oneLine(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return truncate(flat, n);
}
