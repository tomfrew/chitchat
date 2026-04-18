import { useEffect, useState } from "react";
import type { Runtime, SessionSummary } from "./runtime.js";
import type { MessageWithSender } from "../storage/messages.js";

// Polls every 2s to catch sessions created via REST by an agent.
export function useSessions(runtime: Runtime): SessionSummary[] {
  const [sessions, setSessions] = useState<SessionSummary[]>(() => runtime.sessions());

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) setSessions(runtime.sessions());
    };
    const id = setInterval(refresh, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [runtime]);

  return sessions;
}

// Initial load from storage; live updates from the hub in-memory, no polling.
export function useMessages(runtime: Runtime, sessionId: string | null): MessageWithSender[] {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    setMessages(runtime.messages(sessionId, 200));
    const unsub = runtime.hub.subscribe(sessionId, (e) => {
      if (e.type === "message") {
        setMessages((prev) => [
          ...prev,
          { ...e.message, sender_name: e.sender_name, sender_role: e.sender_role },
        ]);
      }
    });
    return unsub;
  }, [runtime, sessionId]);

  return messages;
}
