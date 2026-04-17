import type { MessageRow } from "../storage/messages.js";

export type HubEvent =
  | {
      type: "message";
      session_id: string;
      message: MessageRow;
      sender_name: string | null;
      sender_role: string | null;
    }
  | { type: "peer_join"; session_id: string; name: string; role: string }
  | { type: "peer_leave"; session_id: string; name: string }
  | { type: "role_changed"; session_id: string; name: string; role: string }
  | { type: "session_closed"; session_id: string };
