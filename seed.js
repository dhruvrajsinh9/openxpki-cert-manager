// seed.js
// Run once to create predefined users: node seed.js

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    await User.deleteMany({});
    console.log('Cleared existing users');

    const johnPassword = await bcrypt.hash('requester123', 10);
    const selinaPassword = await bcrypt.hash('approver123', 10);

    const users = await User.insertMany([
      { username: 'john', password: johnPassword, role: 'requester' },
      { username: 'selina', password: selinaPassword, role: 'approver' }
    ]);

    console.log('Users created:');
    users.forEach(u => console.log(`  - ${u.username} (${u.role})`));
    console.log('\nSeed complete!');
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seed();
