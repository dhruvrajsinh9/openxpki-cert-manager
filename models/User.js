// Defines the User schema — stores login credentials and role

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['requester', 'approver']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);
