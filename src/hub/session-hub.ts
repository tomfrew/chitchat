import type { HubEvent } from "./events.js";

export type Subscriber = (event: HubEvent) => void;

export class SessionHub {
  private subs: Map<string, Set<Subscriber>> = new Map();

  subscribe(sessionId: string, handler: Subscriber): () => void {
    let set = this.subs.get(sessionId);
    if (!set) {
      set = new Set();
      this.subs.set(sessionId, set);
    }
    set.add(handler);
    return () => {
      const s = this.subs.get(sessionId);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) this.subs.delete(sessionId);
    };
  }

  publish(event: HubEvent): void {
    const set = this.subs.get(event.session_id);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(event);
      } catch (err) {
        console.error("[SessionHub] subscriber threw:", err);
      }
    }
  }

  subscriberCount(sessionId: string): number {
    return this.subs.get(sessionId)?.size ?? 0;
  }
}
