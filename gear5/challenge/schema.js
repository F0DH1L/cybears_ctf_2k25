import { 
  GraphQLObjectType, 
  GraphQLString, 
  GraphQLNonNull, 
  GraphQLSchema, 
  GraphQLList 
} from 'graphql';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

import User from './models/User.js';
import Message from './models/Message.js';
import { broadcastMessage } from './ws.js';
import { seedDatabase, getTestCredentials } from './seedData.js';

dotenv.config();

// GraphQL Type Definitions
const UserType = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: GraphQLString },
    username: { type: GraphQLString },
    email: { type: GraphQLString },
    secret: { type: GraphQLString },
    createdAt: { type: GraphQLString }
  })
});

const UserBasicType = new GraphQLObjectType({
  name: 'UserBasic',
  fields: {
    username: { type: GraphQLString },
    email: { type: GraphQLString },
    createdAt: { type: GraphQLString }
  }
});


const MessageType = new GraphQLObjectType({
  name: 'Message',
  fields: () => ({
    id: { type: GraphQLString },
    sender: { type: GraphQLString },
    receiver: { type: GraphQLString },
    content: { type: GraphQLString },
    createdAt: { type: GraphQLString }
  })
});

const MessagesListType = new GraphQLObjectType({
  name: 'MessagesList',
  fields: {
    messages: { type: new GraphQLNonNull(new GraphQLList(MessageType)) }
  }
});

const AuthPayloadType = new GraphQLObjectType({
  name: 'AuthPayload',
  fields: () => ({
    token: { type: GraphQLString },
    user: { type: UserType }
  })
});

// Helper functions
const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '24h' });
};

const validateUserExists = async (id) => {
  const user = await User.findById(id);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

// Mutation Resolvers
const authResolvers = {
  register: {
    type: AuthPayloadType,
    args: {
      username: { type: new GraphQLNonNull(GraphQLString) },
      email: { type: new GraphQLNonNull(GraphQLString) },
      password: { type: new GraphQLNonNull(GraphQLString) },
      secret: { type: new GraphQLNonNull(GraphQLString) }
    },
    async resolve(_, { username, email, password, secret }) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ 
          $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
          throw new Error('User already exists with this email or username');
        }
        const usersCount = await User.countDocuments();
        if (usersCount >= 111) {
          throw new Error('Registration is closed. Maximum number of users reached.');
        }
        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const user = await User.create({ 
          username, 
          email, 
          password: hashedPassword, 
          secret 
        });

        // Generate token
        const token = generateToken(user.id);

        return { token, user };
      } catch (error) {
        throw new Error(`Registration failed: ${error.message}`);
      }
    }
  },

  login: {
    type: AuthPayloadType,
    args: {
      username: { type: new GraphQLNonNull(GraphQLString) },
      password: { type: new GraphQLNonNull(GraphQLString) }
    },
    async resolve(_, { username, password }) {
      try {
        // Find user by username
        const user = await User.findOne({ username });
        if (!user) {
          throw new Error('Invalid credentials');
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
          throw new Error('Invalid credentials');
        }

        // Generate token
        const token = generateToken(user.id);

        return { token, user };
      } catch (error) {
        throw new Error(`Login failed: ${error.message}`);
      }
    }
  }
};

const messageResolvers = {
  sendMessage: {
    type: MessageType,
    args: {
      sender: { type: new GraphQLNonNull(GraphQLString) },
      receiver: { type: new GraphQLNonNull(GraphQLString) },
      content: { type: new GraphQLNonNull(GraphQLString) }
    },
    async resolve(_, { sender, receiver, content }) {
      try {
        // Validate sender and receiver exist
        await validateUserExists(sender);
        await validateUserExists(receiver);

        // Create message
        const message = await Message.create({ sender, receiver, content });

        // Broadcast message via WebSocket
        broadcastMessage({
          id: message.id,
          sender: message.sender.toString(),
          receiver: message.receiver.toString(),
          content: message.content,
          createdAt: message.createdAt
        });

        return message;
      } catch (error) {
        throw new Error(`Failed to send message: ${error.message}`);
      }
    }
  }
};

// Query Resolvers
const userResolvers = {
  userBasic: {
    type: UserBasicType,
    args: {
      id: { type: new GraphQLNonNull(GraphQLString) }
    },
    async resolve(_, { id }) {
      const user = await validateUserExists(id);
      return {
        id: user.id,
        username: user.username,
        email: user.email
      };
    }
  },

  userSensitive: {
    type: UserType,
    args: {
      id: { type: new GraphQLNonNull(GraphQLString) }
    },
    async resolve(_, { id }) {
      return await validateUserExists(id);
    }
  },

  allUsersTimestamps: {
    type: new GraphQLList(UserBasicType),
    async resolve() {
      try {
        // Fetch users from DB (without password)
        const users = await User.find({}, '-password').lean();
        const staticCredentials = getTestCredentials();

        // Merge with static credentials
        const usersWithCredentials = users.map(user => {
          const staticUser = staticCredentials.find(cred => cred.email === user.email);
          return {
            // id: user._id.toString(),
            // username: user.username,
            // email: user.email,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          };
        });

        return usersWithCredentials;
      } catch (error) {
        throw new Error(`Failed to fetch test users: ${error.message}`);
      }
    }
  }

};

const messageQueryResolvers = {
  messagesBetween: {
    type: MessagesListType,
    args: {
      user1: { type: new GraphQLNonNull(GraphQLString) },
      user2: { type: new GraphQLNonNull(GraphQLString) }
    },
    async resolve(_, { user1, user2 }) {
      try {
        // Validate both users exist
        await validateUserExists(user1);
        await validateUserExists(user2);

        // Find messages between users
        const messages = await Message.find({
          $or: [
            { sender: user1, receiver: user2 },
            { sender: user2, receiver: user1 }
          ]
        }).sort({ createdAt: 1 });

        return { messages };
      } catch (error) {
        throw new Error(`Failed to fetch messages: ${error.message}`);
      }
    }
  }
};

// Root Types
const RootQuery = new GraphQLObjectType({
  name: 'Query',
  fields: {
    ...userResolvers,
    ...messageQueryResolvers
  }
});

const RootMutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    ...authResolvers,
    ...messageResolvers
  }
});

// Schema Export
export default new GraphQLSchema({
  query: RootQuery,
  mutation: RootMutation
});
