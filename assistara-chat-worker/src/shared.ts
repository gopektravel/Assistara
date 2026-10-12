// Shared types between client and server
export interface ChatMessage {
  id: string;
  user: string;
  userId: string;
  role: "attendee" | "host" | "system";
  content: string;
  timestamp: number;
}

export type ClientMessage =
  | { type: "join"; userId: string; name: string; role: "attendee" | "host" }
  | { type: "send"; content: string; tempId: string }
  | { type: "history_request" }
  | { type: "delete"; messageId: string }
  | { type: "toggle_send"; enabled: boolean };

export type ServerMessage =
  | { type: "welcome"; userId: string; messages: ChatMessage[]; sendEnabled: boolean }
  | { type: "message"; message: ChatMessage }
  | { type: "history"; messages: ChatMessage[] }
  | { type: "user_joined"; userId: string; name: string; role: "attendee" | "host" }
  | { type: "user_left"; userId: string }
  | { type: "message_deleted"; messageId: string }
  | { type: "send_toggled"; enabled: boolean }
  | { type: "error"; code: string; message: string }
  | { type: "ack"; tempId: string; messageId: string };

export const MASTERCLASS_ROOM_ID = "founding-masterclass-2026";
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_HISTORY = 200;
export const RATE_LIMIT_WINDOW_MS = 5000;
export const RATE_LIMIT_MAX_MESSAGES = 5;