// services/openxpkiService.js
// Handles all communication with OpenXPKI RPC API
// NO fallback self-signed certificates — if OpenXPKI fails, request goes to FAILED state

const axios = require('axios');
const https = require('https');

const api = axios.create({
  baseURL: process.env.OPENXPKI_URL,
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 30000
});

// Submit a CSR to OpenXPKI and get a signed certificate back
async function requestCertificate(csrPem, commonName) {
  try {
    const response = await api.post('/rpc/generic/RequestCertificate', {
      pkcs10: csrPem,
      comment: `Certificate request for ${commonName}`
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('OpenXPKI RPC response:', JSON.stringify(response.data, null, 2));

    const result = response.data?.result || response.data;
    let certificatePem = null;
    let certIdentifier = null;
    let transactionId = null;

    if (result) {
      certIdentifier = result.data?.cert_identifier || result.cert_identifier || null;
      transactionId = result.data?.transaction_id || result.transaction_id || result.id || null;

      if (result.data?.certificate) {
        certificatePem = result.data.certificate;
      } else if (result.certificate) {
        certificatePem = result.certificate;
      }
    }

    // If we got a transaction_id but no certificate yet, try pickup
    if (!certificatePem && transactionId) {
      console.log('Certificate not immediately available, trying pickup...');
      const pickupResult = await pickupCertificate(csrPem, transactionId);
      if (pickupResult) {
        certificatePem = pickupResult.certificate || pickupResult.data?.certificate || null;
        certIdentifier = pickupResult.cert_identifier || pickupResult.data?.cert_identifier || certIdentifier;
      }
    }

    return {
      certificatePem,
      certIdentifier,
      transactionId,
      success: !!certificatePem,
      error: certificatePem ? null : 'OpenXPKI did not return a certificate'
    };

  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error('OpenXPKI requestCertificate error:', err.response?.data || err.message);
    return {
      certificatePem: null,
      certIdentifier: null,
      transactionId: null,
      success: false,
      error: `OpenXPKI error: ${errorMsg}`
    };
  }
}

// Pickup a pending certificate
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

module.exports = {
  requestCertificate,
  pickupCertificate
};
