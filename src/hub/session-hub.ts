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

  /**
   * Fan an event out to every active subscription, regardless of session. Used
   * for server-wide signals like shutdown that need to reach every connected
   * viewer. Each subscriber is handed a copy of the event tagged with its own
   * session id so the existing per-session dispatch path stays intact.
   */
  broadcast(makeEvent: (sessionId: string) => HubEvent): void {
    for (const sessionId of this.subs.keys()) {
      this.publish(makeEvent(sessionId));
    }
  }
}
