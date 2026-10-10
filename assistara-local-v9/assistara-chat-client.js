"use strict";
var AssistaraChatClient = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/client/chat.ts
  var chat_exports = {};
  __export(chat_exports, {
    AssistaraLiveChat: () => AssistaraLiveChat,
    initAssistaraChat: () => initAssistaraChat
  });
  var MASTERCLASS_ROOM_ID = "founding-masterclass-2026";
  var CHAT_WORKER_URL = "https://assistara-live-chat-production.up.railway.app";
  var HOST_NAME = "Xyra";
  var HOST_COLOR = "#8a6d00";
  var NAME_COLORS = ["#0f766e", "#1d4ed8", "#7c3aed", "#be123c", "#15803d", "#c2410c"];
  var AssistaraLiveChat = class {
    container;
    options;
    ws = null;
    messages = [];
    userIdentity = null;
    sendEnabled = true;
    reconnectAttempts = 0;
    maxReconnectAttempts = 5;
    reconnectDelay = 1e3;
    reconnectTimer = null;
    disposed = false;
    isConnecting = false;
    connectionStatus = "disconnected";
    sessionId = 0;
    // current chat session (reset bumps this)
    atBottom = true;
    // viewer is at the newest message
    unseen = 0;
    // new messages while scrolled up
    elements = {
      messagesContainer: null,
      input: null,
      form: null,
      sendButton: null,
      nameForm: null,
      nameInput: null,
      meLabel: null,
      newMsgBtn: null
    };
    constructor(container, options = {}) {
      this.container = container;
      this.options = options;
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
      <div class="assistara-chat">
        <div class="chat-messages" role="log" aria-live="polite"></div>
        <button class="chat-newmsg" type="button" aria-label="Jump to newest messages">
          <span class="chat-newmsg-arrow">&#8595;</span> <span class="chat-newmsg-text">New messages</span>
        </button>

        <div class="chat-composer">
          <div class="chat-me"></div>
          <div class="chat-input-row">
            <textarea
              class="chat-input"
              placeholder="Say something..."
              rows="1"
              maxlength="500"
            ></textarea>
            <button type="submit" class="chat-send" aria-label="Send message" disabled>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <form class="chat-name-form">
          <div class="chat-me">Join with your first name</div>
          <div class="chat-input-row">
            <input
              type="text"
              class="chat-name-input"
              placeholder="Your first name"
              maxlength="30"
              autocomplete="name"
            />
            <button type="submit" class="chat-send">Join</button>
          </div>
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
      .assistara-chat {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--cream, #fbfaf6);
        color: var(--ink, #151515);
        font-family: "Manrope", "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      /* Compact flowing message list */
      .assistara-chat .chat-messages {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 12px 14px 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .assistara-chat .chat-msg {
        font-size: 13.5px;
        line-height: 1.45;
        color: #1c1c1c;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .assistara-chat .chat-name {
        font-weight: 800;
        color: #151515;
        letter-spacing: -0.01em;
      }
      .assistara-chat .chat-text { font-weight: 400; }
      .assistara-chat .chat-host-badge {
        display: inline-block;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        line-height: 1;
        color: #151515;
        background: var(--yellow, #ffd51f);
        border-radius: 4px;
        padding: 2px 5px;
        margin: 0 5px;
        vertical-align: 1px;
      }
      .assistara-chat .chat-msg.system { padding: 2px 0; }
      .assistara-chat .chat-msg.system .chat-text {
        color: #8a857e;
        font-size: 12px;
      }

      /* Composer */
      .assistara-chat .chat-composer {
        border-top: 1px solid var(--line, #e2ded4);
        background: #fff;
        padding: 8px 10px 10px;
      }
      .assistara-chat .chat-me {
        font-size: 11px;
        font-weight: 600;
        color: #8a857e;
        margin-bottom: 5px;
      }
      .assistara-chat .chat-me strong { color: #151515; font-weight: 800; }
      .assistara-chat .chat-input-row {
        display: flex;
        gap: 8px;
        align-items: flex-end;
      }
      .assistara-chat .chat-input {
        flex: 1;
        min-width: 0;
        resize: none;
        border: 1px solid var(--line, #e2ded4);
        border-radius: 8px;
        padding: 9px 12px;
        font-size: 13.5px;
        font-family: inherit;
        line-height: 1.4;
        color: #151515;
        background: #fff;
        max-height: 96px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .assistara-chat .chat-input:focus {
        outline: none;
        border-color: var(--yellow, #ffd51f);
        box-shadow: 0 0 0 3px rgba(255, 213, 31, 0.18);
      }
      .assistara-chat .chat-input:disabled { opacity: 0.55; }
      .assistara-chat .chat-send {
        flex: 0 0 auto;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 8px;
        background: var(--yellow, #ffd51f);
        color: #151515;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.1s ease;
      }
      .assistara-chat .chat-send:hover:not(:disabled) { background: #f0c800; }
      .assistara-chat .chat-send:active:not(:disabled) { transform: scale(0.96); }
      .assistara-chat .chat-send:disabled { opacity: 0.4; cursor: default; }

      /* Guest name form */
      .assistara-chat .chat-name-form {
        border-top: 1px solid var(--line, #e2ded4);
        background: #fff;
        padding: 10px;
      }
      .assistara-chat .chat-name-input {
        flex: 1;
        min-width: 0;
        border: 1px solid var(--line, #e2ded4);
        border-radius: 8px;
        padding: 9px 12px;
        font-size: 13.5px;
        font-family: inherit;
        color: #151515;
        background: #fff;
      }
      .assistara-chat .chat-name-input:focus {
        outline: none;
        border-color: var(--yellow, #ffd51f);
        box-shadow: 0 0 0 3px rgba(255, 213, 31, 0.18);
      }

      /* Subtle connection dot in the outer page header */
      .chat-conn { display: inline-flex; align-items: center; gap: 6px; }
      .chat-conn-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #8a857e; flex: 0 0 auto;
        transition: background 0.2s ease;
      }
      .chat-conn-dot.is-connected { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.18); }
      .chat-conn-dot.is-connecting { background: #ffd51f; animation: chatPulse 1.4s infinite; }
      .chat-conn-dot.is-disconnected { background: #ef4444; }
      .chat-conn-text { font-weight: 700; }
      @keyframes chatPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

      @media (max-width: 640px) {
        .assistara-chat .chat-messages { padding: 10px 12px 6px; gap: 4px; }
        .assistara-chat .chat-msg { font-size: 13px; }
        .assistara-chat .chat-composer { padding: 7px 8px 8px; }
      }

      /* "New messages" jump button (appears when the viewer scrolled up) */
      .assistara-chat { position: relative; }
      .assistara-chat .chat-newmsg {
        position: absolute;
        left: 50%;
        bottom: 8px;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 6px;
        border: 0;
        border-radius: 999px;
        padding: 6px 14px;
        font: 700 12px/1 inherit;
        color: #151515;
        background: var(--yellow, #ffd51f);
        box-shadow: 0 4px 14px rgba(0,0,0,0.16);
        cursor: pointer;
        z-index: 5;
        transition: opacity 0.15s ease;
      }
      .assistara-chat .chat-newmsg.is-visible { display: inline-flex; }
      .assistara-chat .chat-newmsg-arrow { font-weight: 800; }
    `;
      document.head.appendChild(style);
    }
    bindElements() {
      this.elements.messagesContainer = this.container.querySelector(".chat-messages");
      this.elements.input = this.container.querySelector(".chat-input");
      this.elements.form = this.container.querySelector(".chat-composer");
      this.elements.sendButton = this.container.querySelector(".chat-send");
      this.elements.nameForm = this.container.querySelector(".chat-name-form");
      this.elements.nameInput = this.container.querySelector(".chat-name-input");
      this.elements.meLabel = this.container.querySelector(".chat-me");
      this.elements.newMsgBtn = this.container.querySelector(".chat-newmsg");
      this.elements.sendButton?.addEventListener("click", (e) => {
        e.preventDefault();
        this.handleSubmit(e);
      });
      this.elements.input?.addEventListener("keydown", (e) => this.handleKeydown(e));
      this.elements.input?.addEventListener("input", () => this.autoResize());
      this.elements.nameForm?.addEventListener("submit", (e) => this.handleNameSubmit(e));
      this.elements.messagesContainer?.addEventListener("scroll", () => this.handleScroll());
      this.elements.newMsgBtn?.addEventListener("click", () => this.scrollToBottom(true));
    }
    loadIdentity() {
      const host = !!this.options.hostToken;
      const reg = this.options.identity;
      if (host) {
        const name = reg && reg.name ? this.firstName(reg.name) : HOST_NAME;
        this.userIdentity = { name, userId: "host-" + Math.random().toString(36).slice(2, 10), isHost: true };
        this.updateIdentityUI();
        return;
      }
      if (reg && reg.name) {
        const first = this.firstName(reg.name);
        this.userIdentity = {
          name: first,
          userId: "reg-" + Math.random().toString(36).slice(2, 10),
          isHost: false
        };
        this.updateIdentityUI();
        return;
      }
      let guest = null;
      try {
        guest = sessionStorage.getItem("assistara_chat_guest_name");
      } catch {
      }
      if (guest && guest.trim()) {
        const first = this.firstName(guest);
        this.userIdentity = { name: first, userId: "guest-" + Math.random().toString(36).slice(2, 10), isHost: false };
        this.updateIdentityUI();
        return;
      }
      this.userIdentity = null;
      this.updateIdentityUI();
    }
    updateIdentityUI() {
      const has = !!this.userIdentity;
      if (this.elements.form) this.elements.form.style.display = has ? "" : "none";
      if (this.elements.nameForm) this.elements.nameForm.style.display = has ? "none" : "";
      if (this.elements.meLabel) {
        this.elements.meLabel.innerHTML = has ? `Message as <strong>${this.escapeHtml(this.userIdentity.name)}</strong>` : "Join the conversation";
      }
      if (has) {
        this.elements.sendButton?.removeAttribute("disabled");
        this.elements.input?.removeAttribute("disabled");
      } else {
        this.elements.sendButton?.setAttribute("disabled", "true");
        this.elements.input?.setAttribute("disabled", "true");
      }
    }
    handleNameSubmit(e) {
      e.preventDefault();
      const first = this.firstName(this.elements.nameInput?.value || "");
      if (!first) {
        this.elements.nameInput?.focus();
        return;
      }
      this.userIdentity = { name: first, userId: "guest-" + Math.random().toString(36).slice(2, 10), isHost: false };
      try {
        sessionStorage.setItem("assistara_chat_guest_name", first);
      } catch {
      }
      this.updateIdentityUI();
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: "join", userId: this.userIdentity.userId, name: first, role: "attendee" });
        this.elements.input?.focus();
      }
    }
    // Display only the first name ("Maria Santos" -> "Maria"). Used for the
    // guest form, the verified registered name, and message rendering, so the
    // chat never shows a surname, full name, or email.
    firstName(value) {
      const first = String(value || "").trim().split(/\s+/)[0] || "";
      return first.slice(0, 30);
    }
    connect() {
      if (this.disposed || this.isConnecting || this.connectionStatus === "connected") return;
      this.isConnecting = true;
      this.updateConnectionStatus("connecting");
      const wsUrl = CHAT_WORKER_URL.replace("https://", "wss://") + `/chat?room=${MASTERCLASS_ROOM_ID}`;
      try {
        const socket = new WebSocket(wsUrl);
        this.ws = socket;
        socket.onopen = () => {
          if (this.disposed || this.ws !== socket) {
            socket.close();
            return;
          }
          this.isConnecting = false;
          this.connectionStatus = "connected";
          this.reconnectAttempts = 0;
          this.updateConnectionStatus("connected");
          if (this.userIdentity) {
            this.send({
              type: "join",
              userId: this.userIdentity.userId,
              name: this.userIdentity.name,
              role: this.userIdentity.isHost ? "host" : "attendee",
              hostToken: this.options.hostToken || void 0
            });
            this.enableInput();
          } else {
            this.updateIdentityUI();
          }
        };
        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.handleServerMessage(msg);
          } catch (err) {
            console.error("Failed to parse server message:", err);
          }
        };
        socket.onclose = () => {
          if (this.ws !== socket) return;
          this.ws = null;
          this.isConnecting = false;
          this.connectionStatus = "disconnected";
          this.updateConnectionStatus("disconnected");
          this.disableInput();
          if (!this.disposed) this.scheduleReconnect();
        };
        socket.onerror = (err) => {
          console.error("WebSocket error:", err);
        };
      } catch (err) {
        console.error("Failed to create WebSocket:", err);
        this.isConnecting = false;
        this.scheduleReconnect();
      }
    }
    enableInput() {
      this.elements.input?.removeAttribute("disabled");
      this.elements.sendButton?.removeAttribute("disabled");
      this.autoResize();
    }
    disableInput() {
      this.elements.input?.setAttribute("disabled", "true");
      this.elements.sendButton?.setAttribute("disabled", "true");
    }
    autoResize() {
      const ta = this.elements.input;
      if (!ta) return;
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
    }
    updateConnectionStatus(status) {
      this.connectionStatus = status;
      const panel = this.container.closest(".chat");
      const dot = panel ? panel.querySelector(".chat-conn-dot") : null;
      const text = panel ? panel.querySelector(".chat-conn-text") : null;
      if (dot) dot.className = "chat-conn-dot is-" + status;
      if (text) {
        text.textContent = status === "connected" ? "Live" : status === "connecting" ? "Connecting\u2026" : "Disconnected";
      }
    }
    scheduleReconnect() {
      if (this.disposed) return;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.showError("Connection lost. Please refresh the page to reconnect.");
        return;
      }
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    }
    handleServerMessage(msg) {
      switch (msg.type) {
        case "welcome":
          if (msg.userId && this.userIdentity) this.userIdentity.userId = msg.userId;
          this.sessionId = msg.sessionId || 0;
          this.messages = Array.isArray(msg.messages) ? msg.messages : [];
          this.sendEnabled = msg.sendEnabled;
          this.renderMessages();
          this.scrollToBottom(false);
          if (!this.userIdentity) this.updateIdentityUI();
          else this.enableInput();
          break;
        case "message":
          this.addMessage(msg.message);
          break;
        case "history":
          if (typeof msg.sessionId === "number") this.sessionId = msg.sessionId;
          this.messages = Array.isArray(msg.messages) ? msg.messages : [];
          this.renderMessages();
          this.scrollToBottom(false);
          break;
        case "chat_reset":
          this.sessionId = msg.sessionId;
          this.messages = [];
          this.unseen = 0;
          this.atBottom = true;
          this.renderMessages();
          this.hideNewMsgBtn();
          this.scrollToBottom(false);
          break;
        case "user_joined":
          this.addSystemMessage(`${msg.name} joined`);
          break;
        case "user_left":
          this.addSystemMessage("Someone left");
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
      if (!input || !this.userIdentity || !this.sendEnabled) return;
      const content = input.value.trim();
      if (!content) return;
      const tempId = crypto.randomUUID();
      this.send({ type: "send", content, tempId });
      input.value = "";
      input.style.height = "auto";
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
      if (this.atBottom) {
        this.scrollToBottom(false);
      } else {
        this.unseen++;
        this.showNewMsgBtn();
      }
    }
    removeMessage(messageId) {
      const msgEl = this.elements.messagesContainer?.querySelector(`[data-message-id="${messageId}"]`);
      if (msgEl) {
        msgEl.style.opacity = "0";
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
      const isOwn = !!this.userIdentity && msg.userId === this.userIdentity.userId;
      const isHost = msg.role === "host";
      const isSystem = msg.role === "system";
      const cls = [
        "chat-msg",
        isOwn ? "own" : "",
        isHost ? "host" : "",
        isSystem ? "system" : ""
      ].filter(Boolean).join(" ");
      if (isSystem) {
        return `<div class="${cls}"><span class="chat-text">${this.escapeHtml(msg.content)}</span></div>`;
      }
      const name = this.escapeHtml(this.firstName(msg.user));
      const badge = isHost ? '<span class="chat-host-badge">Host</span>' : "";
      const color = this.nameColor(msg.user, msg.role);
      return `<div class="${cls}" data-message-id="${msg.id}"><span class="chat-name" style="color:${color}">${name}</span>${badge}<span class="chat-text">: ${this.escapeHtml(msg.content)}</span></div>`;
    }
    // Stable, readable name color per participant (host uses the yellow accent).
    // Keyed by the participant's (first) name so the color is stable across
    // reconnects, not by the random per-connection userId.
    nameColor(key, role) {
      if (role === "system") return "#8a857e";
      if (role === "host") return HOST_COLOR;
      const s = String(key || "").toLowerCase();
      let h = 0;
      for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i) >>> 0;
      return NAME_COLORS[h % NAME_COLORS.length];
    }
    isNearBottom() {
      const c = this.elements.messagesContainer;
      if (!c) return true;
      return c.scrollHeight - c.scrollTop - c.clientHeight < 60;
    }
    handleScroll() {
      this.atBottom = this.isNearBottom();
      if (this.atBottom) {
        this.unseen = 0;
        this.hideNewMsgBtn();
      } else if (this.unseen > 0) {
        this.showNewMsgBtn();
      }
    }
    scrollToBottom(smooth) {
      const c = this.elements.messagesContainer;
      if (!c) return;
      const dist = c.scrollHeight - c.scrollTop;
      c.scrollTo({ top: c.scrollHeight, behavior: smooth && dist < 800 ? "smooth" : "auto" });
      this.atBottom = true;
      this.unseen = 0;
      this.hideNewMsgBtn();
    }
    showNewMsgBtn() {
      const btn = this.elements.newMsgBtn;
      if (!btn) return;
      const text = btn.querySelector(".chat-newmsg-text");
      if (text) text.textContent = this.unseen > 1 ? `${this.unseen} new messages` : "New message";
      btn.classList.add("is-visible");
    }
    hideNewMsgBtn() {
      this.elements.newMsgBtn?.classList.remove("is-visible");
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
      this.disposed = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      const socket = this.ws;
      this.ws = null;
      this.isConnecting = false;
      this.connectionStatus = "disconnected";
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    }
  };
  var chatInstance = null;
  function initAssistaraChatGlobal(container, options) {
    if (chatInstance) {
      chatInstance.disconnect();
    }
    chatInstance = new AssistaraLiveChat(container, options);
    window.assistaraChat = chatInstance;
    return chatInstance;
  }
  window.initAssistaraChat = initAssistaraChatGlobal;
  function initAssistaraChat(container, options) {
    return initAssistaraChatGlobal(container, options);
  }
  return __toCommonJS(chat_exports);
})();
//# sourceMappingURL=chat.js.map
