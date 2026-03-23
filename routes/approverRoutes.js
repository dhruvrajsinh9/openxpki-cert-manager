// routes/approverRoutes.js
// Routes for the Approver role: view pending requests, approve, reject
// On approval: submits the stored CSR to OpenXPKI RPC to get a signed certificate

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const CertRequest = require('../models/CertRequest');
const {
  requestCertificate,
  generateFallbackCertificate
} = require('../services/openxpkiService');

// GET /pending — List all pending certificate requests
router.get('/pending', isAuthenticated, requireRole('approver'), async (req, res) => {
  try {
    const requests = await CertRequest.find({ status: 'PENDING' })
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

// POST /approve/:requestId — Approve a certificate request
// This is where we submit the CSR to OpenXPKI and get the signed certificate
router.post('/approve/:requestId', isAuthenticated, requireRole('approver'), async (req, res) => {
  try {
    const certReq = await CertRequest.findById(req.params.requestId);
    if (!certReq) return res.status(404).send('Request not found.');
    if (certReq.status !== 'PENDING') return res.status(400).send('This request has already been processed.');

    let certificatePem = null;

    // Step 1: Submit CSR to OpenXPKI RPC
    if (certReq.csrPem) {
      console.log(`Submitting CSR to OpenXPKI for: ${certReq.commonName}`);
      const result = await requestCertificate(certReq.csrPem, certReq.commonName);

      if (result.success && result.certificatePem) {
        // OpenXPKI returned a signed certificate
        certificatePem = result.certificatePem;
        certReq.certIdentifier = result.certIdentifier;
        certReq.workflowId = result.transactionId;
        console.log(`OpenXPKI issued certificate: ${result.certIdentifier}`);
      } else {
        console.log('OpenXPKI did not return a certificate, using fallback');
      }
    }

    // Step 2: Fallback — generate self-signed cert if OpenXPKI failed
    if (!certificatePem && certReq.csrPem && certReq.privateKeyPem) {
      console.log('Using fallback self-signed certificate generation');
      certificatePem = generateFallbackCertificate(certReq.csrPem, certReq.privateKeyPem);
    }

    // Step 3: Update the request in MongoDB
    certReq.status = certificatePem ? 'ISSUED' : 'APPROVED';
    certReq.approver = req.session.userId;
    certReq.approverUsername = req.session.username;
    certReq.certificatePem = certificatePem;
    await certReq.save();

    const requests = await CertRequest.find({ status: 'PENDING' }).sort({ createdAt: -1 });
    res.render('pending', {
      requests,
      error: null,
      success: `Request for "${certReq.commonName}" has been approved${certificatePem ? ' and certificate issued.' : '.'}`
    });
  } catch (err) {
    console.error('Approve error:', err);
    const requests = await CertRequest.find({ status: 'PENDING' }).sort({ createdAt: -1 });
    res.render('pending', { requests, error: 'Failed to approve request.', success: null });
  }
});

// POST /reject/:requestId — Reject a certificate request
router.post('/reject/:requestId', isAuthenticated, requireRole('approver'), async (req, res) => {
  try {
    const certReq = await CertRequest.findById(req.params.requestId);
    if (!certReq) return res.status(404).send('Request not found.');
    if (certReq.status !== 'PENDING') return res.status(400).send('This request has already been processed.');

    certReq.status = 'REJECTED';
    certReq.approver = req.session.userId;
    certReq.approverUsername = req.session.username;
    certReq.rejectionReason = req.body.reason || 'No reason provided';
    await certReq.save();

    const requests = await CertRequest.find({ status: 'PENDING' }).sort({ createdAt: -1 });
    res.render('pending', {
      requests,
      error: null,
      success: `Request for "${certReq.commonName}" has been rejected.`
    });
  } catch (err) {
    console.error('Reject error:', err);
    const requests = await CertRequest.find({ status: 'PENDING' }).sort({ createdAt: -1 });
    res.render('pending', { requests, error: 'Failed to reject request.', success: null });
  }
});

module.exports = router;
