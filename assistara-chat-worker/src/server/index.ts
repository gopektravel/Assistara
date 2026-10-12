import { DurableObject } from "cloudflare:workers";
import type { ChatMessage, ClientMessage, ServerMessage, MASTERCLASS_ROOM_ID, MAX_HISTORY, MAX_MESSAGE_LENGTH, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_MESSAGES } from "../shared";

interface Env {
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export class AssistaraChatRoom_20261010_1 extends DurableObject<Env> {
  private messages: ChatMessage[] = [];
  private sendEnabled = true;
  private connections: Map<string, WebSocket> = new Map();
  private userRoles: Map<string, "attendee" | "host"> = new Map();
  private userNames: Map<string, string> = new Map();
  private rateLimits: Map<string, RateLimitEntry> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initializeStorage();
  }

  private async initializeStorage() {
    // Create messages table if not exists
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    // Load recent messages from storage
    const results = this.ctx.storage.sql
      .exec(`SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?`, MAX_HISTORY)
      .toArray() as ChatMessage[];

    this.messages = results.reverse(); // Chronological order
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    const roomId = url.searchParams.get("room") || MASTERCLASS_ROOM_ID;

    const [client, server] = Object.values(new WebSocketPair());
    await this.handleWebSocket(server, roomId);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleWebSocket(ws: WebSocket, roomId: string) {
    ws.accept();

    // Generate a temporary user ID for this connection
    const userId = crypto.randomUUID();
    this.connections.set(userId, ws);

    // Send welcome message with history
    const welcomeMsg: ServerMessage = {
      type: "welcome",
      userId,
      messages: this.messages,
      sendEnabled: this.sendEnabled,
    };
    ws.send(JSON.stringify(welcomeMsg));

    ws.addEventListener("message", async (event) => {
      try {
        const clientMsg = JSON.parse(event.data as string) as ClientMessage;
        await this.handleMessage(userId, clientMsg, ws);
      } catch (err) {
        console.error("Error handling message:", err);
        ws.send(JSON.stringify({ type: "error", code: "PARSE_ERROR", message: "Invalid message format" } satisfies ServerMessage));
      }
    });

    ws.addEventListener("close", () => {
      this.handleDisconnect(userId);
    });

    ws.addEventListener("error", (err) => {
      console.error("WebSocket error:", err);
      this.handleDisconnect(userId);
    });
  }

  private async handleMessage(userId: string, msg: ClientMessage, ws: WebSocket) {
    switch (msg.type) {
      case "join":
        await this.handleJoin(userId, msg);
        break;
      case "send":
        await this.handleSend(userId, msg);
        break;
      case "history_request":
        this.sendHistory(ws);
        break;
      case "delete":
        await this.handleDelete(userId, msg);
        break;
      case "toggle_send":
        await this.handleToggleSend(userId, msg);
        break;
    }
  }

  private async handleJoin(userId: string, msg: ClientMessage) {
    const { name, role } = msg;
    this.userRoles.set(userId, role);
    this.userNames.set(userId, name);

    // Notify others
    this.broadcast(
      { type: "user_joined", userId, name, role } satisfies ServerMessage,
      userId
    );
  }

  private async handleSend(userId: string, msg: ClientMessage) {
    if (!this.sendEnabled) {
      const ws = this.connections.get(userId);
      if (ws) {
        ws.send(JSON.stringify({ type: "error", code: "SEND_DISABLED", message: "Sending is currently disabled" } satisfies ServerMessage));
      }
      return;
    }

    // Rate limiting
    const now = Date.now();
    const limit = this.rateLimits.get(userId);
    if (limit && now - limit.windowStart < RATE_LIMIT_WINDOW_MS) {
      if (limit.count >= RATE_LIMIT_MAX_MESSAGES) {
        const ws = this.connections.get(userId);
        if (ws) {
          ws.send(JSON.stringify({ type: "error", code: "RATE_LIMITED", message: "Too many messages, please wait" } satisfies ServerMessage));
        }
        return;
      }
      limit.count++;
    } else {
      this.rateLimits.set(userId, { count: 1, windowStart: now });
    }

    // Validate message
    const content = msg.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      const ws = this.connections.get(userId);
      if (ws) {
        ws.send(JSON.stringify({ type: "error", code: "INVALID_MESSAGE", message: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` } satisfies ServerMessage));
      }
      return;
    }

    const userRole = this.userRoles.get(userId) || "attendee";
    const userName = this.userNames.get(userId) || "Anonymous";

    const chatMessage: ChatMessage = {
      id: msg.tempId, // Use tempId from client for deduplication
      user: userName,
      userId,
      role: userRole,
      content,
      timestamp: Date.now(),
    };

    // Store message
    this.messages.push(chatMessage);
    if (this.messages.length > MAX_HISTORY) {
      this.messages.shift();
    }

    // Persist to storage
    await this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, user_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET content = ?, timestamp = ?`,
      chatMessage.id,
      chatMessage.user,
      chatMessage.userId,
      chatMessage.role,
      chatMessage.content,
      chatMessage.timestamp,
      chatMessage.content,
      chatMessage.timestamp
    );

    // Acknowledge to sender
    const senderWs = this.connections.get(userId);
    if (senderWs) {
      senderWs.send(JSON.stringify({ type: "ack", tempId: msg.tempId, messageId: chatMessage.id } satisfies ServerMessage));
    }

    // Broadcast to all (including sender for confirmation)
    this.broadcast({ type: "message", message: chatMessage } satisfies ServerMessage);
  }

  private async handleDelete(userId: string, msg: ClientMessage) {
    const userRole = this.userRoles.get(userId);
    if (userRole !== "host") {
      const ws = this.connections.get(userId);
      if (ws) {
        ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN", message: "Only hosts can delete messages" } satisfies ServerMessage));
      }
      return;
    }

    const index = this.messages.findIndex((m) => m.id === msg.messageId);
    if (index === -1) return;

    this.messages.splice(index, 1);

    // Remove from storage
    await this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id = ?`, msg.messageId);

    // Broadcast deletion
    this.broadcast({ type: "message_deleted", messageId: msg.messageId } satisfies ServerMessage);
  }

  private async handleToggleSend(userId: string, msg: ClientMessage) {
    const userRole = this.userRoles.get(userId);
    if (userRole !== "host") {
      const ws = this.connections.get(userId);
      if (ws) {
        ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN", message: "Only hosts can toggle sending" } satisfies ServerMessage));
      }
      return;
    }

    this.sendEnabled = msg.enabled;
    this.broadcast({ type: "send_toggled", enabled: this.sendEnabled } satisfies ServerMessage);
  }

  private handleDisconnect(userId: string) {
    this.connections.delete(userId);
    this.rateLimits.delete(userId);

    const name = this.userNames.get(userId);
    if (name) {
      this.broadcast({ type: "user_left", userId } satisfies ServerMessage);
      this.userNames.delete(userId);
      this.userRoles.delete(userId);
    }
  }

  private sendHistory(ws: WebSocket) {
    ws.send(JSON.stringify({ type: "history", messages: this.messages } satisfies ServerMessage));
  }

  private broadcast(message: ServerMessage, exclude?: string) {
    const data = JSON.stringify(message);
    for (const [id, ws] of this.connections) {
      if (id !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}

// Type definitions for Cloudflare Workers
declare global {
  interface DurableObjectState {
    storage: {
      sql: {
        exec(query: string, ...bindings: unknown[]): { toArray(): any[] };
      };
    };
  }

  interface WebSocketPair {
    0: WebSocket;
    1: WebSocket;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket connections
    if (url.pathname === "/chat") {
      const roomId = url.searchParams.get("room") || MASTERCLASS_ROOM_ID;
      const id = env.CHAT_ROOM.idFromName(roomId);
      const stub = env.CHAT_ROOM.get(id);
      return stub.fetch(request);
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", room: MASTERCLASS_ROOM_ID }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;