// Generates a private key + Certificate Signing Request using node-forge

const forge = require('node-forge');

function generateCSR({ commonName, organization, organizationalUnit, country, email }) {
  // Generate a 2048-bit RSA key pair
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // Create a Certificate Signing Request
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;

  // Set the subject fields from the form data
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: organization },
    { name: 'countryName', value: country }
  ];

  if (organizationalUnit) {
    attrs.push({ name: 'organizationalUnitName', value: organizationalUnit });
  }

  csr.setSubject(attrs);
  csr.setAttributes([
    {
      name: 'extensionRequest',
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 1, value: email },
            { type: 2, value: commonName }
          ]
        }
      ]
    }
  ]);

  // Sign the CSR with the private key
  csr.sign(keys.privateKey, forge.md.sha256.create());

  // Convert to PEM format
  const csrPem = forge.pki.certificationRequestToPem(csr);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  return { csrPem, privateKeyPem };
}

module.exports = { generateCSR };
