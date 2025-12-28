#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { seedDatabase, clearUsers } from './seedData.js';

// Load environment variables
dotenv.config();

const command = process.argv[2];

const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const main = async () => {
  await connectDatabase();

  try {
    switch (command) {
      case 'seed':
        console.log('🌱 Seeding database with fake users...');
        await seedDatabase(false);
        break;
      
      case 'force-seed':
        console.log('🌱 Force seeding database (clearing existing users)...');
        await seedDatabase(true);
        break;
      
      case 'clear':
        console.log('🗑️  Clearing all users...');
        await clearUsers();
        break;
      
      default:
        console.log(`
🛠️  Database Management Tool

Usage: node seed.js <command>

Commands:
  seed        - Seed database with fake users (skip if users exist)
  force-seed  - Force seed database (clear existing users first)
  clear       - Clear all users from database

Examples:
  node seed.js seed
  node seed.js force-seed
  node seed.js clear
        `);
        break;
    }
  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Database connection closed');
  }
};

main();
