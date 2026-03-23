// Routes for the Requester role: request certs, view status, download

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const CertRequest = require('../models/CertRequest');
const { generateCSR } = require('../services/csrService');

// GET /request — Show the certificate request form
router.get('/request', isAuthenticated, requireRole('requester'), (req, res) => {
  res.render('requestForm', { error: null, success: null });
});

// POST /request — Submit a new certificate request
// Generates CSR and stores in DB with PENDING status
// Does NOT contact OpenXPKI yet — that happens when the approver approves
router.post('/request', isAuthenticated, requireRole('requester'), async (req, res) => {
  try {
    const { commonName, organization, organizationalUnit, country, email } = req.body;

    if (!commonName || !organization || !country || !email) {
      return res.render('requestForm', {
        error: 'Please fill in all required fields.',
        success: null
      });
    }

    // Generate CSR and private key (stored for later submission to OpenXPKI)
    const { csrPem, privateKeyPem } = generateCSR({
      commonName, organization, organizationalUnit, country, email
    });

    // Save the request in MongoDB — OpenXPKI submission happens on approval
    const certRequest = new CertRequest({
      requester: req.session.userId,
      requesterUsername: req.session.username,
      commonName,
      organization,
      organizationalUnit: organizationalUnit || '',
      country,
      email,
      status: 'PENDING',
      csrPem,
      privateKeyPem
    });

    await certRequest.save();

    res.render('requestForm', {
      error: null,
      success: `Certificate request for "${commonName}" submitted successfully! Status: PENDING`
    });
  } catch (err) {
    console.error('Request submission error:', err);
    res.render('requestForm', {
      error: 'Failed to submit request. Please try again.',
      success: null
    });
  }
});

// GET /certificates — List all certificates for this requester
router.get('/certificates', isAuthenticated, requireRole('requester'), async (req, res) => {
  try {
    const requests = await CertRequest.find({ requester: req.session.userId })
      .sort({ createdAt: -1 });
    res.render('certificates', { requests });
  } catch (err) {
    console.error('Fetch certificates error:', err);
    res.render('certificates', { requests: [] });
  }
});

// GET /certificates/:id — View details of a specific request
router.get('/certificates/:id', isAuthenticated, requireRole('requester'), async (req, res) => {
  try {
    const certReq = await CertRequest.findOne({
      _id: req.params.id,
      requester: req.session.userId
    });
    if (!certReq) return res.status(404).send('Certificate request not found.');
    res.render('certDetail', { certReq });
  } catch (err) {
    console.error('Fetch cert detail error:', err);
    res.status(500).send('Error loading certificate details.');
  }
});

// GET /certificates/:id/download — Download the issued certificate as PEM
router.get('/certificates/:id/download', isAuthenticated, requireRole('requester'), async (req, res) => {
  try {
    const certReq = await CertRequest.findOne({
      _id: req.params.id,
      requester: req.session.userId
    });
    if (!certReq) return res.status(404).send('Certificate not found.');
    if (!certReq.certificatePem) return res.status(400).send('Certificate has not been issued yet.');

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="${certReq.commonName}.pem"`);
    res.send(certReq.certificatePem);
  } catch (err) {
    console.error('Download cert error:', err);
    res.status(500).send('Error downloading certificate.');
  }
});

// GET /certificates/:id/download-key — Download the private key
router.get('/certificates/:id/download-key', isAuthenticated, requireRole('requester'), async (req, res) => {
  try {
    const certReq = await CertRequest.findOne({
      _id: req.params.id,
      requester: req.session.userId
    });
    if (!certReq) return res.status(404).send('Certificate not found.');
    if (!certReq.privateKeyPem) return res.status(400).send('Private key not available.');

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="${certReq.commonName}-key.pem"`);
    res.send(certReq.privateKeyPem);
  } catch (err) {
    console.error('Download key error:', err);
    res.status(500).send('Error downloading private key.');
  }
});

module.exports = router;
