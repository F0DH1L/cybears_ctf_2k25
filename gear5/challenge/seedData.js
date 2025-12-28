import bcrypt from 'bcryptjs';
import User from './models/User.js';
import crypto from 'crypto';


function generatePassword(length = 16) {
  return crypto.randomBytes(length)
    .toString('base64')       // convert to string
    .slice(0, length)         // ensure desired length
    .replace(/\+/g, 'A')      // replace URL-unsafe chars
    .replace(/\//g, 'B');
}


// Straw Hat Pirates crew data for seeding
const fakeUsers = [
  {
    username: 'luffy_captain',
    email: 'luffy@strawhat.com',
    secret: 'cybears{now_you_are_a_hacker_with_gear_5_powers_no_one_can_stop_you}'
  },
  {
    username: 'nami_navigator',
    email: 'nami@strawhat.com',
    secret: 'navigator_nami'
  },
  {
    username: 'zoro_swordsman',
    email: 'zoro@strawhat.com',
    secret: 'santoryu_worlds_strongest'
  },
  {
    username: 'sanji_cook',
    email: 'sanji@strawhat.com',
    secret: 'chef_vinsmoke_sanji_kicks'
  },
  {
    username: 'chopper_doctor',
    email: 'chopper@strawhat.com',
    secret: 'doctor_cure_all_diseases'
  },
  {
    username: 'robin_archaeologist',
    email: 'robin@strawhat.com',
    secret: 'archaeologist_ohara_survivor'
  },
  {
    username: 'franky_shipwright',
    email: 'franky@strawhat.com',
    secret: 'shipwright_thousand_sunny'
  },
  {
    username: 'brook_musician',
    email: 'brook@strawhat.com',
    secret: 'musician_soul_king_brook'
  },
  {
    username: 'jinbe_helmsman',
    email: 'jinbe@strawhat.com',
    secret: 'helmsman_former_warlord'
  }
];

/**
 * Seed the database with fake users
 * @param {boolean} force - Whether to force recreate users even if they exist
 */
export async function seedDatabase(force = true) {
  try {
    console.log('🌱 Starting database seeding...');

    const existingUserCount = await User.countDocuments();

    if (existingUserCount > 0) {
      console.log(`�️  Clearing ${existingUserCount} existing users for fresh restart...`);
      await User.deleteMany({});
    }

    const hashedUsers = await Promise.all(
      fakeUsers.map(async (userData) => {

        const saltRounds = 12;
        let password = generatePassword(20);
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        return {
          ...userData,
          password: hashedPassword
        };
      })
    );
    let maxGuestUsers = 100
    let randomIndex = Math.floor(Math.random() * 50)+45;
    console.log('Random index for guest users:', randomIndex);
    let guests1 = []

    for (let i=0; i < randomIndex; i++) {
      let fakeUsername = 'guest_'+i;
      let fakeEmail = `guest_${i}@example.com`;
      let password = 'guestpassword';
      let fakeSecret = 'guest_user';
      guests1.push({
        username: fakeUsername,
        email: fakeEmail,
        password: password,
        secret: fakeSecret
      });
    }
    await User.insertMany(guests1); 
    
    const createdUsers = await User.insertMany(hashedUsers);
    
    console.log(`✅ Successfully seeded ${createdUsers.length} fake users`);
    console.log('👥 Created users:');
    
    let guests2 = []
    for (let i=randomIndex; i < 100; i++) {
      let fakeUsername = 'guest_'+i;
      let fakeEmail = `guest_${i}@example.com`;
      let password = 'guestpassword';
      let fakeSecret = 'guest_user';
      guests2.push({
        username: fakeUsername,
        email: fakeEmail,
        password: password,
        secret: fakeSecret
      });
    }
    await User.insertMany(guests2); 
    for (const user of createdUsers) {
      console.log(`   ID: ${user._id} - ${user.username} (${user.email})`);
    }
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    await sleep(3000);
    console.log('sleeping for 3 seconds to ensure DB consistency...');

    return createdUsers;

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
}

/**
 * Get seeded user credentials for testing
 */
export function getTestCredentials() {
  return fakeUsers.map(user => ({
    username: user.username,
    email: user.email,
    password: user.password
  }));
}

/**
 * Clear all users from database (use with caution)
 */
export async function clearUsers() {
  try {
    const result = await User.deleteMany({});
    console.log(`🗑️  Cleared ${result.deletedCount} users from database`);
    return result;
  } catch (error) {
    console.error('❌ Failed to clear users:', error);
    throw error;
  }
}
