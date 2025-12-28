/* ======= Chat client (fixed & hardened) =======
   - Defensive DOM checks (no null crashes)
   - Robust fetch GraphQL handling (status checks, errors)
   - Safe JSON parse for WS messages
   - WS auth on open, heartbeat (ping/pong), reconnect backoff
   - Prevent double-connecting
   - Escape HTML safe for nulls
   - Input validation & max length enforcement
   - Graceful UI notifications
   ================================================= */

(() => {
  // Application state
  const AppState = {
    token: localStorage.getItem('jwt_token'),
    myId: localStorage.getItem('user_id'),
    ws: null,
    currentReceiver: null,
    isConnected: false
  };

  // Helper functions for localStorage management
  const Storage = {
    setToken(token) {
      localStorage.setItem('jwt_token', token);
      AppState.token = token;
    },

    setUserId(userId) {
      localStorage.setItem('user_id', userId);
      AppState.myId = userId;
    },

    clearAuth() {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('user_id');
      AppState.token = null;
      AppState.myId = null;
    },

    isAuthenticated() {
      return !!(AppState.token && AppState.myId);
    }
  };

  // Configuration
  const CONFIG = {
    RECONNECT_DELAY: 3000,
    MAX_RECONNECT_ATTEMPTS: 5,
    MESSAGE_MAX_LENGTH: 1000,
    HEARTBEAT_INTERVAL: 25000, // ms
    WS_PATH: window.WS_PATH || '/' // allow override: set window.WS_PATH = '/ws' before script
  };

  // DOM helpers (safe)
  const $ = (id) => document.getElementById(id);
  const show = (element) => { if (element) element.style.display = ''; };
  const hide = (element) => { if (element) element.style.display = 'none'; };

  // Tiny toast helpers (reusable)
  const Toast = {
    _make(msg, type = 'info', timeout = 3000) {
      const containerId = `toast-${type}`;
      const container = $('app') || document.body;
      const div = document.createElement('div');
      div.className = `message-toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
      div.textContent = msg;
      div.style.zIndex = 10000;
      container.appendChild(div);
      setTimeout(() => { div.remove(); }, timeout);
      return div;
    },
    error(msg, t = 4000) { return Toast._make(msg, 'error', t); },
    success(msg, t = 2500) { return Toast._make(msg, 'success', t); },
    info(msg, t = 2000) { return Toast._make(msg, 'info', t); }
  };

  // UI Management
  const UI = {
    showAuth() {
      show($('auth'));
      hide($('chat'));
    },

    showChat() {
      hide($('auth'));
      show($('chat'));
    },

    clearForm(formPrefix) {
      const root = document.getElementById(formPrefix);
      if (!root) return;
      const inputs = root.querySelectorAll('input, textarea');
      inputs.forEach(input => input.value = '');
    },

    showError(message) {
      console.error(message);
      Toast.error(message);
    },

    showSuccess(message) {
      console.log(message);
      Toast.success(message);
    }
  };

  // API helpers
  const API = {
    async graphqlRequest(query, variables = {}) {
      try {
        const headers = {
          'Content-Type': 'application/json'
        };
        if (AppState.token) headers['Authorization'] = `Bearer ${AppState.token}`;

        const response = await fetch('/graphql', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables })
        });

        // Check HTTP status
        if (!response.ok) {
          // try to parse error body
          let errText = `HTTP ${response.status}`;
          try {
            const body = await response.json();
            if (body.errors && Array.isArray(body.errors) && body.errors.length) {
              errText = body.errors[0].message || JSON.stringify(body.errors);
            } else if (body.message) {
              errText = body.message;
            }
          } catch (e) {
            errText = await response.text().catch(() => errText);
          }
          throw new Error(errText);
        }

        const data = await response.json();

        if (data.errors && data.errors.length > 0) {
          throw new Error(data.errors[0].message || 'GraphQL error');
        }

        return data.data;
      } catch (error) {
        console.error('GraphQL request failed:', error);
        throw error;
      }
    }
  };

  // Utility functions
  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function isProbablyObjectId(id) {
    // basic check (24 hex chars) — adapt as needed
    return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
  }

  // Authentication functions
  async function register() {
    try {
      const usernameEl = $('register-username');
      const emailEl = $('register-email');
      const passwordEl = $('register-password');
      const secretEl = $('register-secret');

      if (!usernameEl || !emailEl || !passwordEl || !secretEl) {
        UI.showError('Registration form is missing required fields in the DOM.');
        return;
      }

      const username = usernameEl.value.trim();
      const email = emailEl.value.trim();
      const password = passwordEl.value;
      const secret = secretEl.value.trim();

      // Validation
      if (!username || !email || !password || !secret) {
        UI.showError('All fields are required');
        return;
      }

      if (password.length < 6) {
        UI.showError('Password must be at least 6 characters long');
        return;
      }

      const query = `
        mutation Register($username: String!, $email: String!, $password: String!, $secret: String!) {
          register(username: $username, email: $email, password: $password, secret: $secret) {
            token
            user {
              id
              username
              email
            }
          }
        }
      `;

      const data = await API.graphqlRequest(query, { username, email, password, secret });

      if (!data || !data.register) throw new Error('Invalid registration response');

      Storage.setToken(data.register.token);
      Storage.setUserId(data.register.user.id);

      UI.clearForm('auth');
      UI.showSuccess(`Welcome ${data.register.user.username}!`);

      await WebSocketManager.connect();
      UI.showChat();

    } catch (error) {
      UI.showError(`Registration failed: ${error.message}`);
    }
  }

  async function login() {
    try {
      const usernameEl = $('login-username');
      const passwordEl = $('login-password');

      if (!usernameEl || !passwordEl) {
        UI.showError('Login form is missing required fields in the DOM.');
        return;
      }

      const username = usernameEl.value.trim();
      const password = passwordEl.value;

      if (!username || !password) {
        UI.showError('username and password are required');
        return;
      }

      const query = `
        mutation Login($username: String!, $password: String!) {
          login(username: $username, password: $password) {
            token
            user {
              id
              username
              email
            }
          }
        }
      `;

      const data = await API.graphqlRequest(query, { email, password });

      if (!data || !data.login) throw new Error('Invalid login response');

      Storage.setToken(data.login.token);
      Storage.setUserId(data.login.user.id);

      UI.clearForm('auth');
      UI.showSuccess(`Welcome back ${data.login.user.username}!`);
      await WebSocketManager.connect();
      UI.showChat();

    } catch (error) {
      UI.showError(`Login failed: ${error.message}`);
    }
  }

  function logout() {
    Storage.clearAuth();
    AppState.currentReceiver = null;
    WebSocketManager.disconnect();
    UI.showAuth();
    UI.showSuccess('Logged out successfully');
  }

  // Message functions
async function sendMessage() {
  try {
    const receiver = $('receiver-id').value.trim();
    const content = $('message-input').value.trim();

    if (!receiver || !content) {
      UI.showError('Receiver ID and message content are required');
      return;
    }

    if (!AppState.isConnected || !AppState.ws) {
      UI.showError('WebSocket is not connected');
      return;
    }

    if (content.length > CONFIG.MESSAGE_MAX_LENGTH) {
      UI.showError(`Message cannot exceed ${CONFIG.MESSAGE_MAX_LENGTH} characters`);
      return;
    }

    const query = `
      mutation SendMessage($sender: String!, $receiver: String!, $content: String!) {
        sendMessage(sender: $sender, receiver: $receiver, content: $content) {
          id
          sender
          receiver
          content
          createdAt
        }
      }
    `;

    const variables = {
      sender: AppState.myId,
      receiver,
      content
    };

    // Generate a unique ID for this WS GraphQL request
    const id = Math.random().toString(36).substring(2, 10);

    AppState.ws.send(JSON.stringify({
      type: 'graphql',
      id,
      query,
      variables
    }));

    // Clear input instantly
    $('message-input').value = '';

    // Optional: reload message list after sending
    if (AppState.currentReceiver === receiver) {
      loadMessages();
    }

    UI.showSuccess('Message sent!');

  } catch (error) {
    console.error('Failed to send message:', error);
    UI.showError('Failed to send message');
  }
}


  async function loadMessages() {
    try {
      const receiverEl = $('receiver-id');
      if (!receiverEl) {
        UI.showError('Receiver input not found');
        return;
      }

      const receiver = receiverEl.value.trim();
      if (!receiver) {
        UI.showError('Please enter a receiver ID');
        return;
      }

      AppState.currentReceiver = receiver;

      const query = `
        query MessagesBetween($user1: String!, $user2: String!) {
          messagesBetween(user1: $user1, user2: $user2) {
            messages {
              id
              sender
              receiver
              content
              createdAt
            }
          }
        }
      `;

      const data = await API.graphqlRequest(query, {
        user1: AppState.myId,
        user2: receiver
      });

      if (!data || !data.messagesBetween) {
        renderMessages([]);
        return;
      }

      renderMessages(data.messagesBetween.messages || []);

    } catch (error) {
      UI.showError(`Failed to load messages: ${error.message}`);
    }
  }

  function renderMessages(messages) {
    const messagesDiv = $('messages');
    if (!messagesDiv) {
      console.warn('No #messages element to render into.');
      return;
    }

    messagesDiv.innerHTML = '';

    if (!Array.isArray(messages) || messages.length === 0) {
      messagesDiv.innerHTML = '<p style="text-align: center; color: #666;">No messages yet</p>';
      return;
    }

    messages.forEach(msg => {
      const div = document.createElement('div');
      div.className = 'message ' + (msg.sender === AppState.myId ? 'me' : 'them');

      const createdAt = msg.createdAt ? new Date(msg.createdAt) : new Date();
      const time = createdAt.toLocaleTimeString();
      const sender = msg.sender === AppState.myId ? 'You' : escapeHtml(msg.sender);

      div.innerHTML = `
        <div class="message-header">
          <strong>${sender}</strong>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${escapeHtml(msg.content)}</div>
      `;

      messagesDiv.appendChild(div);
    });

    // auto-scroll down
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // WebSocket Management
  const WebSocketManager = {
    reconnectAttempts: 0,
    _connecting: false,
    _heartbeatIntervalId: null,
    _lastPong: Date.now(),

    async connect() {
      // prevent concurrent connect attempts
      if (this._connecting || AppState.isConnected) return;
      this._connecting = true;

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host; // includes port
        const path = CONFIG.WS_PATH.startsWith('/') ? CONFIG.WS_PATH : '/' + CONFIG.WS_PATH;
        const wsUrl = `${protocol}//${host}${path}`;

        // close existing if any
        if (AppState.ws) {
          try { AppState.ws.close(); } catch (e) { /* ignore */ }
          AppState.ws = null;
        }

        AppState.ws = new WebSocket(wsUrl);

        AppState.ws.onopen = () => {
          console.log('✅ WebSocket connected');
          AppState.isConnected = true;
          this._connecting = false;
          this.reconnectAttempts = 0;
          this._startHeartbeat();

          UI.showSuccess('Connected to real-time messaging');
        };

        AppState.ws.onmessage = (event) => {
          let payload;
          try {
            payload = JSON.parse(event.data);
          } catch (e) {
            console.warn('Received non-JSON WS message, ignoring', event.data);
            return;
          }

          // handle pong for heartbeat
          if (payload && payload.type === 'pong') {
            this._lastPong = Date.now();
            return;
          }

          this.handleMessage(payload);
        };

        AppState.ws.onclose = (ev) => {
          console.log('🔌 WebSocket disconnected', ev);
          AppState.isConnected = false;
          this._stopHeartbeat();
          AppState.ws = null;
          this.handleReconnect();
        };

        AppState.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          AppState.isConnected = false;
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        this._connecting = false;
        UI.showError('Failed to connect to real-time messaging');
        this.handleReconnect();
      }
    },

    disconnect() {
      this._stopHeartbeat();
      if (AppState.ws) {
        try { AppState.ws.close(); } catch (e) { /* ignore */ }
        AppState.ws = null;
      }
      AppState.isConnected = false;
      this._connecting = false;
    },

    handleMessage(message) {
      if (!message || typeof message !== 'object') return;
      // Example message types: new_message, graphql_response, connection_established, error
      switch (message.type) {
        case 'new_message':
          this.handleNewMessage(message.data);
          break;
        case 'response':
          this.handleGraphQLResponse(message);
          break;
        case 'connection_established':
          console.log('🔌 Connection established:', message.message || '');
          break;
        case 'error':
          console.error('❌ WebSocket error:', message.message);
          UI.showError(`WebSocket error: ${message.message}`);
          break;
        default:
          console.log('📨 Unknown message type:', message.type);
      }
    },

    handleNewMessage(messageData) {
      if (!messageData) return;

      const currentReceiver = AppState.currentReceiver;

      // If we're viewing the conversation relevant to this message, refresh
      if (currentReceiver && (
        (messageData.sender === AppState.myId && messageData.receiver === currentReceiver) ||
        (messageData.sender === currentReceiver && messageData.receiver === AppState.myId)
      )) {
        // only reload messages if DOM exists
        loadMessages().catch(err => console.warn('Failed reloading messages after incoming message', err));
      } else {
        // optional: show a toast for messages not in current view
        // UI.showInfo('New message received');
      }
    },

    handleGraphQLResponse(message) {
      console.log('📊 GraphQL Response via WebSocket:', message.data);
      window.lastGraphQLResponse = message.data; // kept for debug; harmless
    },

    handleReconnect() {
      if (!Storage.isAuthenticated()) {
        console.log('Not authenticated, will not attempt reconnect.');
        return;
      }

      if (this.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectAttempts++;
        console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(() => {
          this.connect();
        }, CONFIG.RECONNECT_DELAY);
      } else {
        console.warn('Max reconnect attempts reached.');
        UI.showError('Unable to reconnect to real-time messaging.');
      }
    },

    sendGraphQLQuery(query, variables = {}) {
      if (!AppState.isConnected || !AppState.ws) {
        UI.showError('WebSocket not connected');
        return null;
      }

      const id = Math.random().toString(36).substr(2, 9);
      try {
        AppState.ws.send(JSON.stringify({
          type: 'graphql',
          id,
          query,
          variables
        }));
        return id;
      } catch (e) {
        UI.showError('Failed to send message over WebSocket');
        return null;
      }
    },

    _startHeartbeat() {
      this._stopHeartbeat();
      this._lastPong = Date.now();
      this._heartbeatIntervalId = setInterval(() => {
        if (!AppState.ws || AppState.ws.readyState !== WebSocket.OPEN) return;
        // if we haven't received pong in double interval, force reconnect
        if (Date.now() - this._lastPong > CONFIG.HEARTBEAT_INTERVAL * 2) {
          console.warn('Heartbeat lost, closing socket to trigger reconnect');
          try { AppState.ws.close(); } catch (e) { /* ignore */ }
          return;
        }
        try { AppState.ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { /* ignore */ }
      }, CONFIG.HEARTBEAT_INTERVAL);
    },

    _stopHeartbeat() {
      if (this._heartbeatIntervalId) {
        clearInterval(this._heartbeatIntervalId);
        this._heartbeatIntervalId = null;
      }
    }
  };

  // Event listeners and initialization
  document.addEventListener('DOMContentLoaded', () => {
    // DOM safety: only add listeners if elements exist
    try {
      // Authentication visibility
      if (Storage.isAuthenticated()) {
        console.log('🔐 User already authenticated, connecting...');
        WebSocketManager.connect().catch(() => {});
        UI.showChat();
      } else {
        UI.showAuth();
      }

      // wire buttons if present
      const loginBtn = $('login-btn');
      if (loginBtn) loginBtn.addEventListener('click', (e) => { e.preventDefault(); login(); });

      const registerBtn = $('register-btn');
      if (registerBtn) registerBtn.addEventListener('click', (e) => { e.preventDefault(); register(); });

      const logoutBtn = $('logout-btn');
      if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });

      const sendBtn = $('send-btn') || $('send-message-btn');
      if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); sendMessage(); });

      const loadBtn = $('load-messages-btn') || $('load-btn');
      if (loadBtn) loadBtn.addEventListener('click', (e) => { e.preventDefault(); loadMessages(); });

      // Enter key support
      const messageInput = $('message-input');
      if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        });
      }

      const loginPassword = $('login-password');
      if (loginPassword) loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); login(); }
      });

      const registerSecret = $('register-secret');
      if (registerSecret) registerSecret.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); register(); }
      });

      console.log('🚀 Chat application initialized');
    } catch (err) {
      console.error('Initialization error', err);
    }
  });

  // Expose functions globally for UI hooks (if needed)
  window.register = register;
  window.login = login;
  window.logout = logout;
  window.sendMessage = sendMessage;
  window.loadMessages = loadMessages;

})();
