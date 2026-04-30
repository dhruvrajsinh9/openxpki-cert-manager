# OpenXPKI Certificate Management System

A full-stack web application for SSL certificate enrollment with a two-level approval workflow, integrated with OpenXPKI Certificate Authority using custom CA configuration.

## Features

- **Two-Level Approval Workflow**: Requester submits → Approver reviews → OpenXPKI signs
- **Custom CA Hierarchy**: Belzir Root CA + Belzir Issuing CA (not demo/DUMMY CA)
- **Dual Key Generation**:
  - Server-side: Automatic RSA key pair + CSR generation
  - Client-side: Upload your own CSR — private key never leaves your machine
- **FAILED State Handling**: If OpenXPKI is unreachable, requests move to FAILED with visible error and Retry option
- **Role-Based Access Control**: Requester and Approver roles with per-route middleware
- **Certificate Download**: Issued certificates downloadable in PEM format
- **Session Authentication**: bcrypt-hashed passwords, sessions stored in MongoDB

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Express.js (Node.js 20) |
| Frontend | EJS templating |
| Database | MongoDB Atlas |
| Certificate Authority | OpenXPKI (Docker) with custom Belzir CA |
| CSR Generation | node-forge |
| CSR File Upload | multer |
| API Communication | axios |
| Authentication | express-session + connect-mongo + bcrypt |
| Request Parsing | body-parser |

## Prerequisites

- Node.js (v18+)
- Docker and Docker Compose
- Git
- OpenSSL

## Quick Start

### 1. OpenXPKI Setup

```bash
cd ~
git clone https://github.com/openxpki/openxpki-docker.git
cd openxpki-docker
git clone https://github.com/openxpki/openxpki-config.git --single-branch --branch=community
```

### 2. Generate CLI Key

```bash
mkdir -p config
openssl ecparam -name prime256v1 -genkey -noout -out config/client.key
chmod 644 config/client.key
PUBLIC_KEY=$(openssl pkey -in config/client.key -pubout)
cat > openxpki-config/config.d/system/cli.yaml << EOF
auth:
  admin:
    key: |
$(echo "$PUBLIC_KEY" | sed 's/^/      /')
    role: RA Operator
EOF
```

### 3. Set Vault Secret

```bash
VAULT_KEY=$(openssl rand -hex 32)
sed -i "s|you must put your own 64 characters key here ##SVAULTKEY##|$VAULT_KEY|" openxpki-config/config.d/system/crypto.yaml
```

### 4. Apply Custom RPC Configuration

```bash
sed -i 's/approval_points: 1/approval_points: 0/' openxpki-config/config.d/realm.tpl/rpc/generic.yaml
sed -i 's/allow_anon_enroll: 0/allow_anon_enroll: 1/' openxpki-config/config.d/realm.tpl/rpc/generic.yaml
sed -i 's/max_active_certs: 1/max_active_certs: 0/' openxpki-config/config.d/realm.tpl/rpc/generic.yaml
```

Also set all `eligible` values to `1` in the same file to bypass the connector check.

### 5. Generate Custom CA Certificates

```bash
mkdir -p custom-ca && cd custom-ca

# Root CA (10 years)
openssl ecparam -name secp384r1 -genkey -noout -out root-ca.key
openssl req -new -x509 -key root-ca.key -out root-ca.crt -days 3650 \
  -subj "/C=DE/O=Belzir/OU=PKI/CN=Belzir Root CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

# Issuing CA (5 years, signed by Root)
openssl ecparam -name secp384r1 -genkey -noout -out issuing-ca.key
openssl req -new -key issuing-ca.key -out issuing-ca.csr -subj "/CN=Belzir Issuing CA"
openssl x509 -req -in issuing-ca.csr -CA root-ca.crt -CAkey root-ca.key \
  -CAcreateserial -out issuing-ca.crt -days 1825 \
  -extfile <(echo -e "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign")

cd ..
```

### 6. Start OpenXPKI and Import Custom CA

```bash
# Copy certs into config volume
cp custom-ca/* openxpki-config/
sudo chown 100:102 openxpki-config/issuing-ca.key
sudo chmod 400 openxpki-config/issuing-ca.key

# Start containers
docker compose up -d web

# Import certificates
docker compose exec server bash -c "
  openxpkiadm certificate import --file /etc/openxpki/root-ca.crt &&
  openxpkiadm certificate import --file /etc/openxpki/issuing-ca.crt
"

# Create token aliases
docker compose exec server bash -c "
  openxpkiadm alias --realm democa --token certsign \
    --file /etc/openxpki/issuing-ca.crt --key /etc/openxpki/issuing-ca.key
"
docker compose exec server bash -c "
  openxpkiadm alias --realm democa --token root --file /etc/openxpki/root-ca.crt
"

# Reload and issue CRL
docker compose exec server bash -c "openxpkictl reload server"
docker compose exec server bash -c "
  openxpkicli create_workflow_instance --realm democa \
    --arg workflow=crl_issuance --arg ca_alias=ca-signer-1
"
```

### 7. Application Setup

```bash
cd ~
git clone https://github.com/dhruvrajsinh9/openxpki-cert-manager.git
cd openxpki-cert-manager
npm install
node seed.js
node server.js
```

The `.env` file is included with a pre-configured MongoDB Atlas connection string. No additional database setup is required.

### 8. Access the Application

For servers behind NAT, use SSH tunneling:

```bash
ssh -L 3000:localhost:3000 -L 8443:localhost:8443 dzala@80.151.246.133 -p 2100
```

Then open: http://localhost:3000

## Login Credentials

| Username | Password | Role |
|----------|----------|------|
| john | requester123 | Requester |
| selina | approver123 | Approver |

## Workflow

### Server-Side Key Generation
1. Login as `john` → Request Certificate → Select "Server-side (automatic)" → Fill form → Submit
2. Login as `selina` → Pending Requests → Approve
3. Login as `john` → My Certificates → Download Cert + Download Key

### Client-Side CSR Upload
1. Generate CSR locally: `openssl req -new -newkey rsa:2048 -nodes -keyout key.pem -out csr.pem -subj "/CN=example.test/O=Company/C=DE"`
2. Login as `john` → Request Certificate → Select "Upload my own CSR" → Upload csr.pem → Submit
3. After approval: Download Cert only (private key stays on your machine)

### Failed State & Retry
If OpenXPKI is unreachable during approval:
- Request moves to **FAILED** status with visible error message
- Approver sees **"Retry"** button instead of "Approve"
- After OpenXPKI is restored, click Retry to issue the certificate

### Certificate Verification

```bash
# Check issuer (should show Belzir Issuing CA)
openssl x509 -in cert.pem -issuer -subject -noout

# Verify key matches certificate
openssl x509 -in cert.pem -noout -modulus | openssl md5
openssl rsa -in key.pem -noout -modulus | openssl md5
```

## API Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | / | Login page | Public |
| POST | /login | Authentication | Public |
| GET | /dashboard | Dashboard | Authenticated |
| GET | /request | Certificate request form | Requester |
| POST | /request | Submit request (server/upload) | Requester |
| GET | /pending | Pending + failed requests | Approver |
| POST | /approve/:id | Approve / Retry | Approver |
| POST | /reject/:id | Reject with reason | Approver |
| GET | /certificates | User's certificates | Requester |
| GET | /certificates/:id | Certificate details | Requester |
| GET | /certificates/:id/download | Download cert PEM | Requester |
| GET | /certificates/:id/download-key | Download private key | Requester |
| POST | /logout | Logout | Authenticated |

## Project Structure

```
openxpki-cert-manager/
├── .env                           # Environment variables (pre-configured)
├── package.json                   # Dependencies (v2.0.0)
├── server.js                      # Express entry point (binds 0.0.0.0)
├── seed.js                        # Database seeder
├── config/
│   └── db.js                      # MongoDB connection
├── middleware/
│   ├── auth.js                    # Authentication check
│   └── role.js                    # Role-based authorization
├── models/
│   ├── User.js                    # User schema
│   └── CertRequest.js             # Certificate request schema
├── routes/
│   ├── authRoutes.js              # Login/logout/dashboard
│   ├── requesterRoutes.js         # Request/upload/view/download
│   └── approverRoutes.js          # Pending/approve/reject/retry
├── services/
│   ├── csrService.js              # CSR generation (node-forge)
│   └── openxpkiService.js         # OpenXPKI RPC (no fallback)
├── views/
│   ├── header.ejs                 # Navigation (role-based)
│   ├── footer.ejs                 # Footer
│   ├── login.ejs                  # Login form
│   ├── dashboard.ejs              # Role-specific dashboard
│   ├── requestForm.ejs            # Request form (server + CSR upload)
│   ├── certificates.ejs           # Certificate list with key source
│   ├── certDetail.ejs             # Certificate details
│   ├── pending.ejs                # Pending/failed list with retry
│   └── pendingDetail.ejs          # Request details with error display
└── public/
    └── css/style.css              # Application styles
```

## Security Notes

- Passwords hashed with bcrypt (10 salt rounds)
- Sessions stored in MongoDB via connect-mongo (survives restarts)
- Per-route role middleware prevents unauthorized access
- Certificate download restricted to the original requester (ownership check)
- Client-side CSR mode: private key never touches the server
- OpenXPKI self-signed cert accepted in development (`rejectUnauthorized: false`)

## Custom CA Configuration

This project uses a custom CA hierarchy instead of the OpenXPKI demo configuration:

| Certificate | Subject | Validity |
|-------------|---------|----------|
| Root CA | CN=Belzir Root CA, O=Belzir, C=DE | 10 years |
| Issuing CA | CN=Belzir Issuing CA | 5 years |

All issued certificates show `Issuer: CN = Belzir Issuing CA`, confirming they are signed by the custom CA.
