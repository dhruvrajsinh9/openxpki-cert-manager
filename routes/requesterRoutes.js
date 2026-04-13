// routes/requesterRoutes.js
// Routes for the Requester role: request certs, upload CSR, view status, download
// Supports two modes:
//   1. Server-side key generation (fill form, CSR generated automatically)
//   2. Client-side CSR upload (user generates key locally, uploads CSR file)

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { isAuthenticated } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const CertRequest = require('../models/CertRequest');
const { generateCSR } = require('../services/csrService');

// Configure multer for CSR file uploads (stored in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 }, // 10KB max — CSR files are small
  fileFilter: (req, file, cb) => {
    // Accept .pem, .csr, .txt files
    if (file.originalname.match(/\.(pem|csr|txt)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only .pem, .csr, and .txt files are allowed'), false);
    }
  }
});

// GET /request — Show the certificate request form
router.get('/request', isAuthenticated, requireRole('requester'), (req, res) => {
  res.render('requestForm', { error: null, success: null });
});

// POST /request — Submit a new certificate request
// Handles both server-side generation and client-side CSR upload
router.post('/request', isAuthenticated, requireRole('requester'), upload.single('csrFile'), async (req, res) => {
  try {
    const { commonName, organization, organizationalUnit, country, email, csrMode } = req.body;

    // Validate required fields
    if (!commonName || !organization || !country || !email) {
      return res.render('requestForm', {
        error: 'Please fill in all required fields.',
        success: null
      });
    }

    let csrPem = null;
    let privateKeyPem = null;
    let keyGeneratedBy = 'server'; // Track who generated the key

    if (csrMode === 'upload' && req.file) {
      // CLIENT-SIDE CSR: User uploaded a CSR file
      csrPem = req.file.buffer.toString('utf8').trim();

      // Validate it looks like a PEM CSR
      if (!csrPem.includes('-----BEGIN CERTIFICATE REQUEST-----')) {
        return res.render('requestForm', {
          error: 'Invalid CSR file. Must be a PEM-encoded Certificate Signing Request.',
          success: null
        });
      }

      keyGeneratedBy = 'client';
      privateKeyPem = null; // Private key stays with the user
      console.log(`Client-side CSR uploaded for: ${commonName}`);

    } else if (csrMode === 'upload' && !req.file) {
      return res.render('requestForm', {
        error: 'Please select a CSR file to upload.',
        success: null
      });

    } else {
      // SERVER-SIDE: Generate CSR and private key
      const generated = generateCSR({
        commonName, organization, organizationalUnit, country, email
      });
      csrPem = generated.csrPem;
      privateKeyPem = generated.privateKeyPem;
      console.log(`Server-side CSR generated for: ${commonName}`);
    }

    // Save the request in MongoDB
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
      privateKeyPem,
      keyGeneratedBy
    });

    await certRequest.save();

    const successMsg = keyGeneratedBy === 'client'
      ? `Certificate request for "${commonName}" submitted with your uploaded CSR. Private key remains on your machine.`
      : `Certificate request for "${commonName}" submitted. CSR and private key generated server-side.`;

    res.render('requestForm', { error: null, success: successMsg });
  } catch (err) {
    console.error('Request submission error:', err);
    res.render('requestForm', {
      error: err.message || 'Failed to submit request. Please try again.',
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

// GET /certificates/:id/download-key — Download the private key (server-side only)
router.get('/certificates/:id/download-key', isAuthenticated, requireRole('requester'), async (req, res) => {
  try {
    const certReq = await CertRequest.findOne({
      _id: req.params.id,
      requester: req.session.userId
    });
    if (!certReq) return res.status(404).send('Certificate not found.');
    if (!certReq.privateKeyPem) {
      return res.status(400).send('Private key not available. If you uploaded a CSR, the private key remains on your machine.');
    }

    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', `attachment; filename="${certReq.commonName}-key.pem"`);
    res.send(certReq.privateKeyPem);
  } catch (err) {
    console.error('Download key error:', err);
    res.status(500).send('Error downloading private key.');
  }
});

module.exports = router;
