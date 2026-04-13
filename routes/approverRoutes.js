// routes/approverRoutes.js
// Routes for the Approver role: view pending requests, approve, reject
// On failure: sets status to FAILED with visible error, allows retry

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const CertRequest = require('../models/CertRequest');
const { requestCertificate } = require('../services/openxpkiService');

// GET /pending — List pending and failed certificate requests
router.get('/pending', isAuthenticated, requireRole('approver'), async (req, res) => {
  try {
    const requests = await CertRequest.find({ status: { $in: ['PENDING', 'FAILED'] } })
      .sort({ createdAt: -1 });
    res.render('pending', { requests, error: null, success: null });
  } catch (err) {
    console.error('Fetch pending error:', err);
    res.render('pending', { requests: [], error: 'Failed to load requests.', success: null });
  }
});

// GET /pending/:id — View details of a pending request
router.get('/pending/:id', isAuthenticated, requireRole('approver'), async (req, res) => {
  try {
    const certReq = await CertRequest.findById(req.params.id);
    if (!certReq) return res.status(404).send('Request not found.');
    res.render('pendingDetail', { certReq, error: null, success: null });
  } catch (err) {
    console.error('Fetch pending detail error:', err);
    res.status(500).send('Error loading request details.');
  }
});

// POST /approve/:requestId — Approve and submit CSR to OpenXPKI
router.post('/approve/:requestId', isAuthenticated, requireRole('approver'), async (req, res) => {
  try {
    const certReq = await CertRequest.findById(req.params.requestId);
    if (!certReq) return res.status(404).send('Request not found.');
    if (certReq.status !== 'PENDING' && certReq.status !== 'FAILED') {
      return res.status(400).send('This request has already been processed.');
    }

    // Submit CSR to OpenXPKI — NO fallback self-signed certificate
    let result = { success: false, error: 'No CSR available' };
    if (certReq.csrPem) {
      console.log(`Submitting CSR to OpenXPKI for: ${certReq.commonName}`);
      result = await requestCertificate(certReq.csrPem, certReq.commonName);
    }

    if (result.success && result.certificatePem) {
      // SUCCESS — certificate issued by OpenXPKI
      certReq.status = 'ISSUED';
      certReq.certificatePem = result.certificatePem;
      certReq.certIdentifier = result.certIdentifier;
      certReq.workflowId = result.transactionId;
      certReq.errorMessage = null;
      console.log(`Certificate issued for: ${certReq.commonName}`);
    } else {
      // FAILED — OpenXPKI did not return a certificate
      certReq.status = 'FAILED';
      certReq.errorMessage = result.error || 'Unknown error during certificate issuance';
      console.error(`Certificate issuance FAILED for: ${certReq.commonName} - ${result.error}`);
    }

    certReq.approver = req.session.userId;
    certReq.approverUsername = req.session.username;
    await certReq.save();

    const requests = await CertRequest.find({ status: { $in: ['PENDING', 'FAILED'] } }).sort({ createdAt: -1 });

    if (certReq.status === 'ISSUED') {
      res.render('pending', {
        requests,
        error: null,
        success: `Request for "${certReq.commonName}" approved and certificate issued successfully.`
      });
    } else {
      res.render('pending', {
        requests,
        error: `Certificate issuance failed for "${certReq.commonName}": ${certReq.errorMessage}. Click "Retry" to try again.`,
        success: null
      });
    }
  } catch (err) {
    console.error('Approve error:', err);
    const requests = await CertRequest.find({ status: { $in: ['PENDING', 'FAILED'] } }).sort({ createdAt: -1 });
    res.render('pending', { requests, error: 'Failed to process request.', success: null });
  }
});

// POST /reject/:requestId — Reject a certificate request
router.post('/reject/:requestId', isAuthenticated, requireRole('approver'), async (req, res) => {
  try {
    const certReq = await CertRequest.findById(req.params.requestId);
    if (!certReq) return res.status(404).send('Request not found.');
    if (certReq.status !== 'PENDING' && certReq.status !== 'FAILED') {
      return res.status(400).send('This request has already been processed.');
    }

    certReq.status = 'REJECTED';
    certReq.approver = req.session.userId;
    certReq.approverUsername = req.session.username;
    certReq.rejectionReason = req.body.reason || 'No reason provided';
    await certReq.save();

    const requests = await CertRequest.find({ status: { $in: ['PENDING', 'FAILED'] } }).sort({ createdAt: -1 });
    res.render('pending', {
      requests,
      error: null,
      success: `Request for "${certReq.commonName}" has been rejected.`
    });
  } catch (err) {
    console.error('Reject error:', err);
    const requests = await CertRequest.find({ status: { $in: ['PENDING', 'FAILED'] } }).sort({ createdAt: -1 });
    res.render('pending', { requests, error: 'Failed to reject request.', success: null });
  }
});

module.exports = router;
