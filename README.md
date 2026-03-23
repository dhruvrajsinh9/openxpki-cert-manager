# OpenXPKI Certificate Management System

A web application built with Express.js that integrates with OpenXPKI to enable SSL certificate enrollment through a two-level approval workflow.

## Features

- **Role-based access**: Requester and Approver roles with separate interfaces
- **Certificate Request Flow**: Requesters submit certificate details, system generates CSR
- **Approval Workflow**: Approvers review, approve, or reject pending requests
- **OpenXPKI Integration**: Communicates with OpenXPKI RPC API for certificate issuance
- **Certificate Download**: Issued certificates downloadable in PEM format
- **Session Authentication**: Secure login with bcrypt-hashed passwords stored in MongoDB

## Tech Stack

- **Backend**: Express.js (Node.js)
- **Frontend**: EJS templating engine
- **Database**: MongoDB Atlas
- **Certificate Generation**: node-forge (CSR + key pair generation)
- **OpenXPKI Communication**: axios (HTTPS RPC calls)
- **Authentication**: express-session + connect-mongo
- **Request Parsing**: body-parser

## Prerequisites

- Node.js (v18+)
- Docker Desktop (for OpenXPKI)
- Git

## OpenXPKI Installation (Docker)

### 1. Clone repositories

```bash
git clone https://github.com/openxpki/openxpki-docker.git
cd openxpki-docker

# Clone config (use admin shell on Windows for symlink support)
git clone -c core.symlinks=true https://github.com/openxpki/openxpki-config.git --single-branch --branch=community
```

### 2. Generate CLI authentication key

```bash
mkdir -p config
openssl ecparam -name prime256v1 -genkey -noout -out config/client.key
```

Extract the public key and paste it into `openxpki-config/config.d/system/cli.yaml`:

```bash
openssl pkey -in config/client.key -pubout
```

### 3. Set up vault secret

Generate a key and add it to `openxpki-config/config.d/system/crypto.yaml`:

```bash
openssl rand -hex 32
```

### 4. Start OpenXPKI

On Windows: comment out the timezone volume mounts in `docker-compose.yml` (`/etc/timezone` and `/etc/localtime` lines).

```bash
docker compose up -d web
```

### 5. Run sample configuration

```bash
docker compose exec -u pkiadm server bash -c "sed 's/\r$//' /etc/openxpki/contrib/sampleconfig.sh | bash"
```

### 6. Configure for auto-issuance

```bash
docker exec -it OpenXPKI_Server bash
sed -i 's/approval_points: 1/approval_points: 0/' /etc/openxpki/config.d/realm.tpl/rpc/generic.yaml
sed -i 's/allow_anon_enroll: 0/allow_anon_enroll: 1/' /etc/openxpki/config.d/realm.tpl/rpc/generic.yaml
sed -i 's/max_active_certs: 1/max_active_certs: 0/' /etc/openxpki/config.d/realm.tpl/rpc/generic.yaml
openxpkictl reload server
exit
```

Also set all `eligible` values to `1` in the same file to bypass connector checks.

### 7. Verify

Open https://localhost:8443/webui/index/ and login as `raop` / `openxpki`.

## Application Setup

### 1. Clone and install

```bash
git clone https://github.com/dhruvrajsinh9/openxpki-cert-manager.git
cd openxpki-cert-manager
npm install
```

### 2. Seed database with test users

The `.env` file is included with a pre-configured MongoDB Atlas connection string. No additional database setup is required.

```bash
node seed.js
```

This creates two predefined users:

| Username | Password | Role |
|----------|----------|------|
| john | requester123 | Requester |
| selina | approver123 | Approver |

### 3. Run the application

```bash
node server.js
```

Open http://localhost:3000 in your browser.

## Environment Variables

The `.env` file is included in the repository with a pre-configured MongoDB Atlas connection string. No additional database setup is required.

| Variable | Description |
|----------|-------------|
| PORT | Server port (default: 3000) |
| MONGODB_URI | MongoDB Atlas connection string (pre-configured) |
| SESSION_SECRET | Secret for session encryption |
| OPENXPKI_URL | OpenXPKI server URL (default: https://localhost:8443) |

## Workflow Demonstration

### Step 1: Requester submits a certificate request
1. Login as `john` / `requester123`
2. Click "Request Certificate"
3. Fill in: CN=`test.openxpki.test`, O=`Test Company`, C=`DE`, Email=`john@test.com`
4. Submit the request
5. View request in "My Certificates" with PENDING status
6. Logout

### Step 2: Approver reviews and approves
1. Login as `selina` / `approver123`
2. Click "Pending Requests"
3. View john's request details
4. Click "Approve" (or "Reject" with reason)
5. Logout

### Step 3: Requester downloads certificate
1. Login as `john` again
2. Go to "My Certificates" — status shows ISSUED
3. Click "Download Cert" and "Download Key"
4. Verify the certificate:

```bash
openssl x509 -in cert.pem -text -noout
```

The Issuer field confirms: `CN=OpenXPKI Issuing DUMMY CA 20260320`

## API Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | / | Login page | Public |
| POST | /login | User authentication | Public |
| GET | /dashboard | User-specific dashboard | Authenticated |
| GET | /request | Certificate request form | Requester |
| POST | /request | Submit certificate request | Requester |
| GET | /pending | List pending requests | Approver |
| POST | /approve/:requestId | Approve a request | Approver |
| POST | /reject/:requestId | Reject a request | Approver |
| GET | /certificates | List user's certificates | Requester |
| GET | /certificates/:id/download | Download certificate | Requester |
| POST | /logout | Logout | Authenticated |

## Project Structure

```
openxpki-cert-manager/
├── .env                        # Environment variables (pre-configured)
├── package.json                # Dependencies
├── server.js                   # Express entry point
├── seed.js                     # Database seeder
├── config/
│   └── db.js                   # MongoDB connection
├── middleware/
│   ├── auth.js                 # Authentication check
│   └── role.js                 # Role-based authorization
├── models/
│   ├── User.js                 # User schema
│   └── CertRequest.js          # Certificate request schema
├── routes/
│   ├── authRoutes.js           # Login/logout/dashboard
│   ├── requesterRoutes.js      # Requester endpoints
│   └── approverRoutes.js       # Approver endpoints
├── services/
│   ├── csrService.js           # CSR generation (node-forge)
│   └── openxpkiService.js      # OpenXPKI RPC integration
├── views/                      # EJS templates (9 files)
└── public/css/style.css        # Application styles
```

## Security Notes

- Passwords are hashed with bcrypt (10 salt rounds)
- Sessions are stored in MongoDB (not in-memory)
- Private keys are stored in the database (in production, use HSM or encrypted storage)
- OpenXPKI self-signed certificate is accepted in development (`rejectUnauthorized: false`)
- Certificate download is restricted to the original requester only
