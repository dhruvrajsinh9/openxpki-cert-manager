// RPC endpoint: /rpc/generic/RequestCertificate
// Workflow: certificate_enroll

const axios = require('axios');
const https = require('https');

// Axios instance that ignores self-signed cert errors (development only)
const api = axios.create({
  baseURL: process.env.OPENXPKI_URL,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 30000
});


async function requestCertificate(csrPem, commonName) {
  try {
    // Submit CSR to OpenXPKI RPC endpoint
    const response = await api.post('/rpc/generic/RequestCertificate', {
      pkcs10: csrPem,
      comment: `Certificate request for ${commonName}`,
      signature: 'SecretChallenge'
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('OpenXPKI RPC response:', JSON.stringify(response.data, null, 2));

    const result = response.data?.result || response.data;

    // Extract the certificate PEM from response
    let certificatePem = null;
    let certIdentifier = null;
    let transactionId = null;

    if (result) {
      certIdentifier = result.data?.cert_identifier || result.cert_identifier || null;
      transactionId = result.data?.transaction_id || result.transaction_id || result.id || null;

      // Certificate is inside result.data
      if (result.data?.certificate) {
        certificatePem = result.data.certificate;
      } else if (result.certificate) {
        certificatePem = result.certificate;
      }
    }

    // If we got a transaction_id but no certificate
    if (!certificatePem && transactionId) {
      console.log('Certificate not immediately available, trying pickup...');
      const pickupResult = await pickupCertificate(csrPem, transactionId);
      if (pickupResult) {
        certificatePem = pickupResult.certificate || null;
        certIdentifier = pickupResult.cert_identifier || certIdentifier;
      }
    }

    return {
      certificatePem,
      certIdentifier,
      transactionId,
      success: !!certificatePem
    };

  } catch (err) {
    console.error('OpenXPKI requestCertificate error:', err.response?.data || err.message);
    return { certificatePem: null, certIdentifier: null, transactionId: null, success: false };
  }
}


//Pickup/check a pending certificate using the check_enrollment workflow

async function pickupCertificate(csrPem, transactionId) {
  try {
    const response = await api.post('/rpc/generic/RequestCertificate', {
      pkcs10: csrPem,
      transaction_id: transactionId
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('OpenXPKI pickup response:', JSON.stringify(response.data, null, 2));
    return response.data?.result || response.data || null;
  } catch (err) {
    console.error('OpenXPKI pickup error:', err.response?.data || err.message);
    return null;
  }
}

// Search for a certificate by common name using the public endpoint

async function searchCertificate(commonName) {
  try {
    const response = await api.post('/rpc/public/SearchCertificate', {
      common_name: commonName
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('OpenXPKI search response:', JSON.stringify(response.data, null, 2));
    return response.data?.result || null;
  } catch (err) {
    console.error('OpenXPKI search error:', err.response?.data || err.message);
    return null;
  }
}

//Fallback: generate a self-signed certificate when OpenXPKI RPC is unavailable.This is the demo workflow  if RPC isn't responding

function generateFallbackCertificate(csrPem, privateKeyPem) {
  const forge = require('node-forge');

  try {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

    const cert = forge.pki.createCertificate();
    cert.publicKey = csr.publicKey;
    cert.serialNumber = Date.now().toString(16);

    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);

    cert.setSubject(csr.subject.attributes);
    cert.setIssuer(csr.subject.attributes); // Self-signed: issuer = subject

    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true, clientAuth: true }
    ]);

    cert.sign(privateKey, forge.md.sha256.create());
    return forge.pki.certificateToPem(cert);
  } catch (err) {
    console.error('Fallback cert generation error:', err.message);
    return null;
  }
}

module.exports = {
  requestCertificate,
  pickupCertificate,
  searchCertificate,
  generateFallbackCertificate
};
