// src/client/chat.ts
var MASTERCLASS_ROOM_ID = "founding-masterclass-2026";
var CHAT_WORKER_URL = "https://assistara-live-chat-production.up.railway.app";
var AssistaraLiveChat = class {
  container;
  ws = null;
  messages = [];
  userIdentity = null;
  sendEnabled = true;
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  reconnectDelay = 1e3;
  isConnecting = false;
  connectionStatus = "disconnected";
  elements = {
    messagesContainer: null,
    input: null,
    form: null,
    statusIndicator: null,
    sendButton: null
  };
  constructor(container) {
    this.container = container;
    this.init();
  }
  async init() {
    this.render();
    this.bindElements();
    this.loadIdentity();
    this.connect();
  }
  render() {
    this.container.innerHTML = `
      <div class="assistara-chat" style="
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 300px;
        max-height: 600px;
        background: #fff;
        border: 1px solid var(--line, #e2ded4);
        border-radius: 16px;
        overflow: hidden;
        font-family: 'Manrope', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      ">
        <!-- Header -->
        <div class="chat-header" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--line, #e2ded4);
          background: var(--cream, #fbfaf6);
        ">
          <div style="display: flex; align-items: center; gap: 10px;">
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--ink, #151515); letter-spacing: -0.02em;">
              Live Chat
            </h3>
            <span class="connection-status" style="
              display: inline-flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              font-weight: 600;
              color: var(--muted, #68635d);
              text-transform: uppercase;
              letter-spacing: 0.06em;
            ">
              <span class="status-dot" style="
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--muted, #68635d);
                transition: background 0.2s ease;
              "></span>
              <span class="status-text">Connecting\u2026</span>
            </span>
          </div>
        </div>

        <!-- Messages -->
        <div class="messages-container" style="
          flex: 1;
          overflow-y: auto;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: var(--cream, #fbfaf6);
        "></div>

        <!-- Input Area -->
        <form class="chat-form" style="
          display: flex;
          gap: 10px;
          padding: 14px 18px;
          border-top: 1px solid var(--line, #e2ded4);
          background: #fff;
        ">
          <input
            type="text"
            name="content"
            class="chat-input"
            placeholder="Say something\u2026"
            autocomplete="off"
            spellcheck="false"
            style="
              flex: 1;
              padding: 12px 16px;
              border: 1px solid var(--line, #e2ded4);
              border-radius: 10px;
              font-size: 14px;
              font-family: inherit;
              color: var(--ink, #151515);
              background: #fff;
              transition: border-color 0.15s ease, box-shadow 0.15s ease;
            "
            disabled
          />
          <button
            type="submit"
            class="send-button"
            style="
              padding: 12px 20px;
              border: none;
              border-radius: 10px;
              font-size: 14px;
              font-weight: 700;
              font-family: inherit;
              color: #fff;
              background: var(--yellow, #ffd51f);
              cursor: pointer;
              transition: background 0.15s ease, transform 0.1s ease;
              white-space: nowrap;
            "
            disabled
          >
            Send
          </button>
        </form>
      </div>
    `;
    this.injectStyles();
  }
  injectStyles() {
    if (document.getElementById("assistara-chat-styles")) return;
    const style = document.createElement("style");
    style.id = "assistara-chat-styles";
    style.textContent = `
      .assistara-chat .chat-input:focus {
        outline: none;
        border-color: var(--yellow, #ffd51f) !important;
        box-shadow: 0 0 0 3px rgba(255, 213, 31, 0.2) !important;
      }

      .assistara-chat .send-button:hover:not(:disabled) {
        background: #e6c000 !important;
      }

      .assistara-chat .send-button:active:not(:disabled) {
        transform: scale(0.98);
      }

      .assistara-chat .send-button:disabled,
      .assistara-chat .chat-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .assistara-chat .chat-input::placeholder {
        color: var(--muted, #68635d);
      }

      /* Message bubbles */
      .assistara-message {
        animation: fadeInUp 0.25s ease-out;
        max-width: 85%;
      }

      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .assistara-message.own {
        align-self: flex-end;
      }

      .assistara-message.host .message-bubble {
        background: var(--ink, #151515) !important;
        color: #fff !important;
        border-color: var(--ink, #151515) !important;
      }

      .assistara-message.host .message-bubble::before {
        border-right-color: var(--ink, #151515) !important;
      }

      .assistara-message.own .message-bubble {
        background: var(--yellow, #ffd51f) !important;
        color: #151515 !important;
        border-color: var(--yellow, #ffd51f) !important;
      }

      .assistara-message.own .message-bubble::before {
        border-left-color: var(--yellow, #ffd51f) !important;
      }

      .assistara-message.system .message-bubble {
        background: transparent !important;
        color: var(--muted, #68635d) !important;
        font-size: 12px !important;
        padding: 4px 12px !important;
        border: none !important;
      }

      .assistara-message.system .message-bubble::before {
        display: none !important;
      }

      .message-bubble {
        position: relative;
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 14px;
        line-height: 1.5;
        border: 1px solid var(--line, #e2ded4);
        background: #fff;
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      }

      .message-bubble::before {
        content: "";
        position: absolute;
        top: 16px;
        width: 0;
        height: 0;
        border: 8px solid transparent;
      }

      .assistara-message:not(.own) .message-bubble::before {
        left: -16px;
        border-right-color: #fff;
      }

      .assistara-message.own .message-bubble::before {
        right: -16px;
        border-left-color: var(--yellow, #ffd51f);
      }

      .message-header {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 4px;
        font-size: 11px;
      }

      .message-sender {
        font-weight: 700;
        color: var(--ink, #151515);
      }

      .assistara-message.host .message-sender {
        color: #fff;
      }

      .assistara-message.own .message-sender {
        color: #151515;
      }

      .message-time {
        color: var(--muted, #68635d);
        font-weight: 500;
      }

      .assistara-message.host .message-time {
        color: rgba(255,255,255,0.7);
      }

      .assistara-message.own .message-time {
        color: rgba(21,21,21,0.7);
      }

      .host-badge {
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: var(--yellow, #ffd51f);
        color: #151515;
      }

      .delete-btn {
        opacity: 0;
        transition: opacity 0.15s ease;
        background: none;
        border: none;
        padding: 2px;
        cursor: pointer;
        color: var(--muted, #68635d);
        font-size: 14px;
        line-height: 1;
      }

      .assistara-message:hover .delete-btn {
        opacity: 1;
      }

      .connection-status.connected .status-dot {
        background: var(--green, #22c55e) !important;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
      }

      .connection-status.connecting .status-dot {
        background: var(--yellow, #ffd51f) !important;
        animation: pulse 1.5s infinite;
      }

      .connection-status.disconnected .status-dot {
        background: var(--red, #ef4444) !important;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      /* Scrollbar */
      .assistara-chat .messages-container::-webkit-scrollbar {
        width: 6px;
      }
      .assistara-chat .messages-container::-webkit-scrollbar-track {
        background: transparent;
      }
      .assistara-chat .messages-container::-webkit-scrollbar-thumb {
        background: var(--line, #e2ded4);
        border-radius: 3px;
      }
      .assistara-chat .messages-container::-webkit-scrollbar-thumb:hover {
        background: var(--muted, #68635d);
      }

      /* Mobile responsive */
      @media (max-width: 640px) {
        .assistara-chat {
          border-radius: 0 !important;
          min-height: 280px !important;
        }
        .assistara-message {
          max-width: 90% !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  bindElements() {
    this.elements.messagesContainer = this.container.querySelector(".messages-container");
    this.elements.input = this.container.querySelector(".chat-input");
    this.elements.form = this.container.querySelector(".chat-form");
    this.elements.sendButton = this.container.querySelector(".send-button");
    this.elements.statusIndicator = this.container.querySelector(".connection-status");
    this.elements.form?.addEventListener("submit", (e) => this.handleSubmit(e));
    this.elements.input?.addEventListener("keydown", (e) => this.handleKeydown(e));
  }
  loadIdentity() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("t");
    if (token) {
      try {
        localStorage.setItem("assistara_masterclass_attendee_token", token);
      } catch {
      }
    }
    const storedToken = localStorage.getItem("assistara_masterclass_attendee_token");
    if (storedToken) {
      try {
        const decoded = atob(storedToken);
        const data = JSON.parse(decoded);
        if (data.name) {
          this.userIdentity = {
            name: data.name,
            userId: data.id || crypto.randomUUID(),
            isHost: data.isHost === true
          };
          return;
        }
      } catch {
        this.userIdentity = {
          name: "Attendee",
          userId: storedToken.slice(0, 8),
          isHost: false
        };
        return;
      }
    }
    const adminToken = localStorage.getItem("assistara_admin_token") || sessionStorage.getItem("assistara_admin_token");
    if (adminToken) {
      this.userIdentity = {
        name: "Host",
        userId: "host-" + crypto.randomUUID().slice(0, 8),
        isHost: true
      };
      return;
    }
    try {
      const storedName = localStorage.getItem("assistara_chat_name");
      const storedUserId = localStorage.getItem("assistara_chat_user_id");
      if (storedName && storedUserId) {
        this.userIdentity = {
          name: storedName,
          userId: storedUserId,
          isHost: false
        };
        return;
      }
    } catch {
    }
    this.userIdentity = null;
  }
  connect() {
    if (this.isConnecting || this.connectionStatus === "connected") return;
    this.isConnecting = true;
    this.updateConnectionStatus("connecting");
    const wsUrl = CHAT_WORKER_URL.replace("https://", "wss://") + `/chat?room=${MASTERCLASS_ROOM_ID}`;
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.isConnecting = false;
        this.connectionStatus = "connected";
        this.reconnectAttempts = 0;
        this.updateConnectionStatus("connected");
        if (this.userIdentity) {
          this.send({
            type: "join",
            userId: this.userIdentity.userId,
            name: this.userIdentity.name,
            role: this.userIdentity.isHost ? "host" : "attendee"
          });
          this.enableInput();
        } else {
          this.promptForName();
        }
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (err) {
          console.error("Failed to parse server message:", err);
        }
      };
      this.ws.onclose = () => {
        this.connectionStatus = "disconnected";
        this.updateConnectionStatus("disconnected");
        this.disableInput();
        this.scheduleReconnect();
      };
      this.ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };
    } catch (err) {
      console.error("Failed to create WebSocket:", err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }
  promptForName() {
    const name = prompt("Welcome! What should we call you?");
    if (name && name.trim()) {
      this.userIdentity = {
        name: name.trim().slice(0, 30),
        userId: crypto.randomUUID(),
        isHost: false
      };
      try {
        localStorage.setItem("assistara_chat_name", this.userIdentity.name);
        localStorage.setItem("assistara_chat_user_id", this.userIdentity.userId);
      } catch {
      }
      this.send({
        type: "join",
        userId: this.userIdentity.userId,
        name: this.userIdentity.name,
        role: "attendee"
      });
      this.enableInput();
    } else {
      setTimeout(() => this.promptForName(), 1e3);
    }
  }
  enableInput() {
    this.elements.input?.removeAttribute("disabled");
    this.elements.sendButton?.removeAttribute("disabled");
    this.elements.input?.focus();
  }
  disableInput() {
    this.elements.input?.setAttribute("disabled", "true");
    this.elements.sendButton?.setAttribute("disabled", "true");
  }
  updateConnectionStatus(status) {
    const indicator = this.elements.statusIndicator;
    if (!indicator) return;
    indicator.className = `connection-status ${status}`;
    const dot = indicator.querySelector(".status-dot");
    const text = indicator.querySelector(".status-text");
    if (text) {
      switch (status) {
        case "connected":
          text.textContent = "Live";
          break;
        case "connecting":
          text.textContent = "Connecting\u2026";
          break;
        case "disconnected":
          text.textContent = "Disconnected";
          break;
      }
    }
  }
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.showError("Connection lost. Please refresh the page to reconnect.");
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }
  handleServerMessage(msg) {
    switch (msg.type) {
      case "welcome":
        this.messages = msg.messages;
        this.sendEnabled = msg.sendEnabled;
        this.renderMessages();
        if (!this.userIdentity) {
          this.promptForName();
        } else {
          this.enableInput();
        }
        break;
      case "message":
        this.addMessage(msg.message);
        break;
      case "history":
        this.messages = msg.messages;
        this.renderMessages();
        break;
      case "user_joined":
        this.addSystemMessage(`${msg.name} joined the chat`);
        break;
      case "user_left":
        this.addSystemMessage("Someone left the chat");
        break;
      case "message_deleted":
        this.removeMessage(msg.messageId);
        break;
      case "send_toggled":
        this.sendEnabled = msg.enabled;
        this.updateInputState();
        break;
      case "error":
        this.showError(msg.message);
        break;
      case "ack":
        break;
    }
  }
  handleSubmit(e) {
    e.preventDefault();
    const input = this.elements.input;
    if (!input || !this.sendEnabled) return;
    const content = input.value.trim();
    if (!content) return;
    const tempId = crypto.randomUUID();
    this.send({ type: "send", content, tempId });
    input.value = "";
  }
  handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.handleSubmit(e);
    }
  }
  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
  addMessage(message) {
    const existingIndex = this.messages.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      this.messages[existingIndex] = message;
    } else {
      this.messages.push(message);
    }
    if (this.messages.length > 200) {
      this.messages = this.messages.slice(-200);
    }
    this.renderMessages();
    this.autoScroll();
  }
  removeMessage(messageId) {
    const msgEl = this.elements.messagesContainer?.querySelector(`[data-message-id="${messageId}"]`);
    if (msgEl) {
      msgEl.style.animation = "fadeInUp 0.15s ease-in reverse";
      setTimeout(() => msgEl.remove(), 150);
    }
    this.messages = this.messages.filter((m) => m.id !== messageId);
  }
  addSystemMessage(text) {
    const systemMsg = {
      id: `system-${Date.now()}`,
      user: "",
      userId: "system",
      role: "system",
      content: text,
      timestamp: Date.now()
    };
    this.addMessage(systemMsg);
  }
  renderMessages() {
    if (!this.elements.messagesContainer) return;
    this.elements.messagesContainer.innerHTML = this.messages.map((msg) => this.renderMessage(msg)).join("");
  }
  renderMessage(msg) {
    const isOwn = this.userIdentity && msg.userId === this.userIdentity.userId;
    const isHost = msg.role === "host";
    const isSystem = msg.role === "system";
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const messageClass = [
      "assistara-message",
      isOwn ? "own" : "",
      isHost ? "host" : "",
      isSystem ? "system" : ""
    ].filter(Boolean).join(" ");
    if (isSystem) {
      return `
        <div class="${messageClass}" data-message-id="${msg.id}" style="align-self: center; text-align: center; padding: 4px 12px;">
          <div class="message-bubble" style="background: transparent; border: none; color: var(--muted); font-size: 12px; padding: 4px 12px;">
            ${this.escapeHtml(msg.content)}
          </div>
        </div>
      `;
    }
    const canDelete = this.userIdentity?.isHost && !isSystem;
    return `
      <div class="${messageClass}" data-message-id="${msg.id}">
        <div class="message-bubble">
          <div class="message-header">
            <span class="message-sender">${this.escapeHtml(msg.user)}</span>
            ${isHost ? '<span class="host-badge">Host</span>' : ""}
            ${canDelete && !isOwn ? `<button class="delete-btn" onclick="window.assistaraChat?.deleteMessage('${msg.id}')" aria-label="Delete message">\u2715</button>` : ""}
            <span class="message-time">${time}</span>
          </div>
          <div class="message-content">${this.escapeHtml(msg.content)}</div>
        </div>
      </div>
    `;
  }
  autoScroll() {
    const container = this.elements.messagesContainer;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }
  updateInputState() {
    if (this.sendEnabled && this.userIdentity) {
      this.enableInput();
    } else {
      this.disableInput();
    }
  }
  showError(message) {
    this.addSystemMessage(message);
  }
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  // Public API for admin controls
  deleteMessage(messageId) {
    this.send({ type: "delete", messageId });
  }
  toggleSend(enabled) {
    if (!this.userIdentity?.isHost) return;
    this.send({ type: "toggle_send", enabled });
  }
  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
};
var chatInstance = null;
function initAssistaraChat(container) {
  if (chatInstance) {
    chatInstance.disconnect();
  }
  chatInstance = new AssistaraLiveChat(container);
  window.assistaraChat = chatInstance;
  return chatInstance;
}
export {
  AssistaraLiveChat,
  initAssistaraChat
};
//# sourceMappingURL=chat.js.map
