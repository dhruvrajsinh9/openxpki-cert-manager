// Connects to MongoDB Atlas using the URI from .env

const mongoose = require('mongoose');
const dns = require('dns');

// Force Node.js to use Google DNS (bypasses restricted local DNS)
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
