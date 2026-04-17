import { describe, it, expect } from "vitest";
import { SessionHub } from "../../../src/hub/session-hub.js";
import type { HubEvent } from "../../../src/hub/events.js";
import type { MessageRow } from "../../../src/storage/messages.js";

function msgEvent(sessionId: string, id = "01HX"): HubEvent {
  const message: MessageRow = {
    id,
    session_id: sessionId,
    agent_id: "a1",
    kind: "chat",
    body: "hi",
    meta: null,
    created_at: 0,
  };
  return { type: "message", session_id: sessionId, sender_name: "Alice", sender_role: "r", message };
}

describe("SessionHub", () => {
  it("delivers events to subscribers of that session", () => {
    const hub = new SessionHub();
    const received: HubEvent[] = [];
    const unsub = hub.subscribe("s1", (e) => received.push(e));
    hub.publish(msgEvent("s1"));
    expect(received.length).toBe(1);
    unsub();
  });

  it("does not leak events across sessions", () => {
    const hub = new SessionHub();
    const received: HubEvent[] = [];
    hub.subscribe("s1", (e) => received.push(e));
    hub.publish(msgEvent("s2"));
    expect(received.length).toBe(0);
  });

  it("unsubscribe stops delivery", () => {
    const hub = new SessionHub();
    const received: HubEvent[] = [];
    const unsub = hub.subscribe("s1", (e) => received.push(e));
    unsub();
    hub.publish(msgEvent("s1"));
    expect(received.length).toBe(0);
  });

  it("delivers in publish order to a subscriber", () => {
    const hub = new SessionHub();
    const received: string[] = [];
    hub.subscribe("s1", (e) => {
      if (e.type === "message") received.push(e.message.id);
    });
    hub.publish(msgEvent("s1", "1"));
    hub.publish(msgEvent("s1", "2"));
    expect(received).toEqual(["1", "2"]);
  });

  it("failing subscriber does not break others", () => {
    const hub = new SessionHub();
    const ok: HubEvent[] = [];
    hub.subscribe("s1", () => {
      throw new Error("boom");
    });
    hub.subscribe("s1", (e) => ok.push(e));
    hub.publish(msgEvent("s1"));
    expect(ok.length).toBe(1);
  });
});
