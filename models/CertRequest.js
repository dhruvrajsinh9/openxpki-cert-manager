// models/CertRequest.js
// Stores certificate requests with status tracking and all related data

const mongoose = require('mongoose');

const certRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requesterUsername: {
    type: String,
    required: true
  },
  commonName: {
    type: String,
    required: true
  },
  organization: {
    type: String,
    required: true
  },
  organizationalUnit: {
    type: String,
    default: ''
  },
  country: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'ISSUED', 'FAILED'],
    default: 'PENDING'
  },
  approver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approverUsername: {
    type: String,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  workflowId: {
    type: String,
    default: null
  },
  certIdentifier: {
    type: String,
    default: null
  },
  csrPem: {
    type: String,
    default: null
  },
  certificatePem: {
    type: String,
    default: null
  },
  privateKeyPem: {
    type: String,
    default: null
  },
  keyGeneratedBy: {
    type: String,
    enum: ['server', 'client'],
    default: 'server'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CertRequest', certRequestSchema);
