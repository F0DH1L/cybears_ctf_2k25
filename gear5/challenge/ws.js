import WebSocket, { WebSocketServer } from 'ws';
import { graphql } from 'graphql';
import schema from './schema.js';

// Store active WebSocket connections
const clients = new Set();

// Rate limiting configuration (global for userSensitive query)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 2;
const userSensitiveRequests = []; // Global array to track userSensitive query requests

/**
 * Setup WebSocket server for real-time communication and GraphQL queries
 * @param {http.Server} server - HTTP server instance
 */
export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, request) => {
    console.log(`🔌 New WebSocket connection from ${request.socket.remoteAddress}`);
    clients.add(ws);

    // Handle incoming messages
    ws.on('message', async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage);
        const type = message.type;
        if (type == 'ping') {
          ws.send(JSON.stringify({ id: 'pong', timestamp: new Date().toISOString() }));
          return;
        }
        else if (type === 'graphql') {
          await handleGraphQLQuery(ws, message);
        }else{
          sendError(ws, 'Unknown message type');
        }

      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        sendError(ws, 'Invalid message format or processing error');
      }
    });

    // Clean up on disconnect
    ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
      clients.delete(ws);
    });

    // Handle connection errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      id: 'connection_established',
      data: 'WebSocket connection established successfully'
    }));
  });

  console.log('🔌 WebSocket server initialized');
}

/**
 * Count occurrences of userSensitive in GraphQL query
 * @param {string} query - GraphQL query string
 * @returns {number} Number of userSensitive calls in the query
 */
function countUserSensitiveCalls(query) {
  if (!query) return 0;
  // Remove comments and normalize query
  const normalized = query
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // Remove /* */ comments
    .replace(/#[^\n]*/g, ' ')            // Remove # comments
    .replace(/[\u200B-\u200D\uFEFF]/g, '')  // Remove zero-width characters
    .toLowerCase();                      // Case-insensitive
  
  // Match all occurrences of usersensitive with any whitespace/special chars
  const matches = normalized.match(/usersensitive\s*\(/g);
  return matches ? matches.length : 0;
}

/**
 * Check if request is within rate limit for userSensitive query
 * @param {string} query - GraphQL query string
 * @returns {Object} { allowed: boolean, message: string, count: number }
 */
function checkRateLimit(query) {
  const now = Date.now();
  const callCount = countUserSensitiveCalls(query);

  // Check if query contains userSensitive calls
  if (callCount > 0) {
    // Filter out requests outside the current time window
    const recentRequests = userSensitiveRequests.filter(
      timestamp => now - timestamp < RATE_LIMIT_WINDOW
    );

    // Update the array with only recent requests
    userSensitiveRequests.length = 0;
    userSensitiveRequests.push(...recentRequests);

    // Check if limit is exceeded (count as 1 request regardless of call count)
    if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
      return { 
        allowed: false, 
        message: `Rate limit exceeded for query 'userSensitive'. Maximum ${MAX_REQUESTS_PER_WINDOW} requests per minute allowed globally.`
      };
    }

    // Add single timestamp for this request (regardless of how many userSensitive calls)
    userSensitiveRequests.push(now);
  }

  return { allowed: true };
}

/**
 * Handle GraphQL queries via WebSocket
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Message containing GraphQL query
 */
const blacklist = ['register', 'login', 'userBasic', 'userSensitive', 'allStrawHatCrew']
async function handleGraphQLQuery(ws, message) {
  try {
    const { id, query, variables = {} } = message;
    console.log('--- IGNORE ---')
    console.log(message)
    console.log(id)
    console.log(query)
    console.log(variables)
    for (const word of blacklist) {
      if (query.toLowerCase().includes(word.toLowerCase())) {
        console.log(`Blocked GraphQL query containing blacklisted word: ${word}`);
        sendError(ws, `Query contains blacklisted word: ${word}`, id);
        return;
      }
    }
    // Check rate limit
    const rateLimitCheck = checkRateLimit(query);
    if (!rateLimitCheck.allowed) {
      console.log('Rate limit exceeded for userSensitive query');
      sendError(ws, rateLimitCheck.message, id);
      return;
    }

    // Execute GraphQL query (introspection allowed here)
    const result = await graphql({
      schema,
      source: query,
      variableValues: variables
    });

    // Send response back to client

    ws.send(JSON.stringify({
      type: 'response',
      id,
      data: result
    }));

  } catch (error) {
    console.error('GraphQL query error:', error);
    sendError(ws, 'Execution failed', message.id);
  }
}

/**
 * Send error message to WebSocket client
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} message - Error message
 * @param {string} id - Optional message ID for correlation
 */
function sendError(ws, message, id = null) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      id: 'error',
      message
    }));
  }
}

/**
 * Broadcast message to all connected WebSocket clients
 * @param {Object} message - Message to broadcast
 */
export function broadcastMessage(message) {
  const messageData = JSON.stringify({ 
    id: 'new_message', 
    data: message,
    timestamp: new Date().toISOString()
  });

  let broadcastCount = 0;

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(messageData);
        broadcastCount++;
      } catch (error) {
        console.error('Error broadcasting to client:', error);
        // Remove failed connection
        clients.delete(ws);
      }
    } else {
      // Clean up closed connections
      clients.delete(ws);
    }
  }

  console.log(`📡 Message broadcasted to ${broadcastCount} clients`);
}

/**
 * Get the number of active WebSocket connections
 * @returns {number} Number of active connections
 */
export function getActiveConnections() {
  return clients.size;
}
