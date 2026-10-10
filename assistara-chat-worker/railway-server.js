/**
 * Assistara Live Chat Server - Railway/Render compatible
 * WebSocket server for real-time chat with per-session history.
 *
 * One room, two interfaces (the /live embed and the /live/chat presenter page)
 * connect to the SAME room here, so they share messages, participants, host
 * labels and the session lifecycle automatically.
 *
 * Session lifecycle: the chat is temporary. An admin Start/End/Reset clears the
 * active history via POST /internal/reset (idempotent by epoch). Reconnects,
 * refreshes, joins, provider switches and polling never clear anything on their
 * own. If the server restarts, in-memory history is lost but that is not a
 * "reset" — clients simply reconnect to whatever the current session holds.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { randomUUID } from 'crypto';

const MASTERCLASS_ROOM_ID = 'founding-masterclass-2026';
const MAX_HISTORY = 200;
const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX_MESSAGES = 5;
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Shared secret: authorizes chat session resets (Vercel -> this server) and
// grants HOST privileges to the presenter (client -> this server). Configuring
// it closes the old behaviour where any client could self-claim host.
const SECRET = process.env.CHAT_SECRET || '';

// In-memory storage (in-memory history is acceptable; a server restart is not
// treated as a reset).
const messages = [];
let sendEnabled = true;
let currentEpoch = 0; // session id; every reset bumps this
const connections = new Map();
const userRoles = new Map();
const userNames = new Map();
const rateLimits = new Map();

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e4) req.destroy();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(data || '{}');
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function broadcast(message, exclude) {
  const data = JSON.stringify(message);
  for (const [id, ws] of connections) {
    if (id !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

// Idempotent session reset: a reset only applies when its epoch is strictly
// greater than the current one, so retries of an already-applied admin action
// cannot erase messages from a newer session.
function resetChat(reason, epoch) {
  const e = Number(epoch);
  if (!Number.isFinite(e) || e <= currentEpoch) {
    return { applied: false, epoch: currentEpoch };
  }
  currentEpoch = e;
  messages.length = 0;
  sendEnabled = true;
  rateLimits.clear();
  broadcast({ type: 'chat_reset', sessionId: currentEpoch, reason: String(reason || 'reset') });
  return { applied: true, epoch: currentEpoch };
}

function handleJoin(userId, msg, ws) {
  const { name, hostToken } = msg;
  // Host is authoritative: only the shared secret grants it. Never nickname-based.
  const role = SECRET && hostToken && hostToken === SECRET ? 'host' : 'attendee';
  userRoles.set(userId, role);
  userNames.set(userId, name);

  ws.send(JSON.stringify({
    type: 'welcome',
    userId,
    sessionId: currentEpoch,
    messages,
    sendEnabled,
  }));

  broadcast({ type: 'user_joined', userId, name, role }, userId);
}

function handleSend(userId, msg, ws) {
  if (!sendEnabled) {
    ws.send(JSON.stringify({ type: 'error', code: 'SEND_DISABLED', message: 'Sending is currently disabled' }));
    return;
  }

  const now = Date.now();
  const limit = rateLimits.get(userId);
  if (limit && now - limit.windowStart < RATE_LIMIT_WINDOW_MS) {
    if (limit.count >= RATE_LIMIT_MAX_MESSAGES) {
      ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED', message: 'Too many messages, please wait' }));
      return;
    }
    limit.count++;
  } else {
    rateLimits.set(userId, { count: 1, windowStart: now });
  }

  const content = String(msg.content || '').trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    ws.send(JSON.stringify({ type: 'error', code: 'INVALID_MESSAGE', message: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` }));
    return;
  }

  const userRole = userRoles.get(userId) || 'attendee';
  const userName = userNames.get(userId) || 'Guest';

  const chatMessage = {
    id: msg.tempId,
    user: userName,
    userId,
    role: userRole,
    content,
    timestamp: Date.now(),
  };

  messages.push(chatMessage);
  if (messages.length > MAX_HISTORY) messages.shift();

  ws.send(JSON.stringify({ type: 'ack', tempId: msg.tempId, messageId: chatMessage.id }));
  broadcast({ type: 'message', message: chatMessage });
}

function handleDelete(userId, msg, ws) {
  if (userRoles.get(userId) !== 'host') {
    ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Only hosts can delete messages' }));
    return;
  }
  const index = messages.findIndex((m) => m.id === msg.messageId);
  if (index === -1) return;
  messages.splice(index, 1);
  broadcast({ type: 'message_deleted', messageId: msg.messageId });
}

function handleToggleSend(userId, msg, ws) {
  if (userRoles.get(userId) !== 'host') {
    ws.send(JSON.stringify({ type: 'error', code: 'FORBIDDEN', message: 'Only hosts can toggle sending' }));
    return;
  }
  broadcast({ type: 'send_toggled', enabled: !!msg.enabled });
}

function handleDisconnect(userId) {
  connections.delete(userId);
  const name = userNames.get(userId);
  if (name) {
    broadcast({ type: 'user_left', userId });
    userNames.delete(userId);
    userRoles.delete(userId);
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  if (req.url === '/health' || url === '/health') {
    return json(res, 200, { status: 'ok', room: MASTERCLASS_ROOM_ID, sessionId: currentEpoch, viewers: connections.size });
  }

  // Session reset — admin lifecycle only. Protected by the shared secret.
  if (url === '/internal/reset') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
    if (SECRET && req.headers['x-reset-token'] !== SECRET) {
      return json(res, 401, { ok: false, error: 'Unauthorized' });
    }
    const body = await readBody(req);
    const result = resetChat(body.reason, body.epoch);
    return json(res, 200, { ok: true, ...result });
  }

  json(res, 404, { error: 'Not found' });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const userId = randomUUID();
  connections.set(userId, ws);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case 'join':
          handleJoin(userId, msg, ws);
          break;
        case 'send':
          handleSend(userId, msg, ws);
          break;
        case 'history_request':
          ws.send(JSON.stringify({ type: 'history', sessionId: currentEpoch, messages }));
          break;
        case 'delete':
          handleDelete(userId, msg, ws);
          break;
        case 'toggle_send':
          handleToggleSend(userId, msg, ws);
          break;
      }
    } catch (err) {
      console.error('Error handling message:', err);
      ws.send(JSON.stringify({ type: 'error', code: 'PARSE_ERROR', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => handleDisconnect(userId));
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    handleDisconnect(userId);
  });
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

server.listen(PORT, HOST, () => {
  console.log(`Assistara Live Chat server running on ${HOST}:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/chat?room=${MASTERCLASS_ROOM_ID}`);
  console.log(`Session reset endpoint: POST http://localhost:${PORT}/internal/reset`);
  if (!SECRET) console.log('WARNING: CHAT_SECRET not set — reset endpoint open and host role allowed for any join.');
});
