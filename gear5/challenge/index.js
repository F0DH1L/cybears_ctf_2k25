import express from 'express';
import path from 'path';
import http from 'http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { NoSchemaIntrospectionCustomRule } from 'graphql';
import { createHandler } from 'graphql-http/lib/use/express';

import schema from './schema.js';
import { setupWebSocket } from './ws.js';
import { seedDatabase, getTestCredentials } from './seedData.js';
import User from './models/User.js';

// Load environment variables
dotenv.config();

// Rate limiting configuration for HTTP (global for userSensitive query)
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 2;
const userSensitiveRequests = []; // Global array to track userSensitive query requests

/**
 * Count occurrences of userSensitive in GraphQL query
 */
import { parse, visit } from 'graphql';


  // if (!query) return false;
  // const blacklist = ['usersensitive', 'sendmessage', 'userbasic', 'messagesbetween']
  // try {
  //   const ast = parse(query);
  //   let found = false;
  //   visit(ast, {
  //     Field(node) {
  //       const fieldName = node.name.value.toLowerCase();

  //       if (blacklist.includes(fieldName)) {
  //         found = true;
  //         return false; // stop visiting further nodes
  //       }
  //     }
  //   });


function countUserSensitiveCalls(query) {
  if (!query) return false;
  try {
    const ast = parse(query);
    let found = false;
    visit(ast, {
      Field(node) {
        if (node.name.value.toLowerCase() === 'usersensitive') {
          found = true;
          return false; // stop visiting
        }
      }
    });
    console.log('userSensitive call found:', found);
    return found;
  } catch (err) {
    console.error('GraphQL parse error:', err);
    return false; // or treat parse errors as suspicious
  }
}


/**
 * Rate limiting middleware for HTTP GraphQL endpoint
 */
function httpRateLimiter(req, res, next) {
  const now = Date.now();

  // Extract GraphQL query from POST body or GET query
  const query =
    (req.method === 'POST' && req.body?.query) ||
    (req.method === 'GET' && req.query?.query) ||
    null;

  if (!query) return next(); // No query, allow

  // Count userSensitive calls in the query
  const calledUserSensitiveQuery = countUserSensitiveCalls(query);
  if (!calledUserSensitiveQuery) return next(); // No sensitive calls, allow

  // Keep only requests within the current time window
  while (userSensitiveRequests.length && now - userSensitiveRequests[0] > RATE_LIMIT_WINDOW) {
    userSensitiveRequests.shift();
  }
  // Check global rate limit
  if (userSensitiveRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      errors: [{
        message: `Rate limit exceeded for query 'userSensitive'. Maximum ${MAX_REQUESTS_PER_WINDOW} requests per minute allowed.`
      }]
    });
  }

  // Record this request
  userSensitiveRequests.push(now);

  next();
}

// Validate required environment variables
if (!process.env.MONGO_URI) {
  console.error('Error: MONGO_URI environment variable is required');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('Error: JWT_SECRET environment variable is required');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Middleware to parse JSON bodies (needed for rate limiter to read query)
app.use(express.json());

// Middleware for serving static files
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// Route for serving the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});



// Database connection and seeding
const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected successfully');

    await seedDatabase();

  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// ---------------------------
// ✅ GraphQL via graphql-http
// ---------------------------
app.use(
  '/graphql',
  httpRateLimiter,
  createHandler({
    schema,
    validationRules: [NoSchemaIntrospectionCustomRule], depthLimit: 3,

    // Custom HTTP error formatting
    formatError: (err) => {
      // console.log('Error== '+err)
        return {
          message: 'Bad Query',
          error: err.message
        };
    }
  })
);

// Start server
const startServer = () => {
  const PORT = process.env.PORT || 4000;

  // WebSocket GraphQL (introspection allowed)
  setupWebSocket(server);

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 GraphQL endpoint: http://localhost:${PORT}/graphql`);
    console.log(`🌐 Web interface: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}`);
  });
};

// Initialize application
const init = async () => {
  await connectDatabase();
  startServer();
};

init().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
