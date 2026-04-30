# OpenXPKI Certificate Management System

A full-stack certificate enrollment platform with a two-level approval workflow, integrated with [OpenXPKI](https://www.openxpki.org/) Certificate Authority. Built with Express.js, MongoDB Atlas, and Docker.

## Overview

This application automates the SSL/TLS certificate lifecycle — from request submission through approval to CA-signed certificate issuance. It replaces manual email-based workflows with a web interface where requesters submit certificate details and approvers review, approve, or reject requests with a single click.

Certificates are signed by a **custom CA hierarchy** (Root CA + Issuing CA) configured manually with OpenSSL and imported into OpenXPKI — not the default demo configuration.

## Architecture

```
Browser (Requester / Approver)
    │
    ▼
Express.js Application ──────► OpenXPKI (Docker)
    │                           │
    │                        ┌──┴──────┐
    ▼                        │ Server  │ ← Signs certificates
MongoDB Atlas               │ Client  │ ← CLI operations
(Users, Requests,            │ WebUI   │ ← Admin interface
 Sessions, Certs)            │ MariaDB │ ← Internal database
                             └─────────┘
```

## Key Features

**Two-Level Approval Workflow**
Requesters submit certificate details. The system generates a CSR and stores it with PENDING status. When an approver clicks Approve, the CSR is submitted to OpenXPKI's RPC API, which signs it with the Issuing CA and returns a real CA-signed certificate.

**Custom CA Hierarchy**
Instead of using OpenXPKI's demo CA, the system uses a manually configured certificate chain: Belzir Root CA (self-signed, EC P-384) → Belzir Issuing CA (signed by Root CA). All issued certificates show `Issuer: CN = Belzir Issuing CA`.

**Dual Key Generation Modes**
- **Server-side**: The application generates RSA 2048-bit key pairs and CSRs automatically using node-forge. Both the certificate and private key are downloadable.
- **Client-side**: Users generate their own key pair locally and upload only the CSR file (via multer). The private key never leaves the user's machine.

**FAILED State with Retry**
If OpenXPKI is unreachable during approval, the request moves to FAILED status with a visible error message. The approver can click "Retry" to attempt issuance again once the CA is available. No fallback self-signed certificates are generated.

**Role-Based Access Control**
Per-route middleware ensures requesters cannot access approver endpoints and vice versa. Passwords are hashed with bcrypt. Sessions are stored in MongoDB via connect-mongo.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js, Node.js 20 |
| Frontend | EJS templating |
| Database | MongoDB Atlas |
| Certificate Authority | OpenXPKI (Dockerized) |
| Cryptography | node-forge (CSR generation), OpenSSL (CA setup) |
| File Upload | multer |
| HTTP Client | axios |
| Auth | bcrypt, express-session, connect-mongo |

## Certificate Request Lifecycle

```
PENDING ──► ISSUED      (Approved + OpenXPKI signed successfully)
PENDING ──► FAILED      (Approved but OpenXPKI unreachable / error)
PENDING ──► REJECTED    (Approver rejected with reason)
FAILED  ──► ISSUED      (Retry succeeded)
FAILED  ──► REJECTED    (Approver decided to reject instead)
```

## API Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | /login | Authentication | Public |
| GET | /dashboard | Role-specific dashboard | Authenticated |
| GET | /request | Certificate request form | Requester |
| POST | /request | Submit request (server-side or CSR upload) | Requester |
| GET | /pending | Pending and failed requests | Approver |
| POST | /approve/:id | Approve or retry failed request | Approver |
| POST | /reject/:id | Reject with reason | Approver |
| GET | /certificates | User's certificate list | Requester |
| GET | /certificates/:id/download | Download certificate (PEM) | Requester |
| GET | /certificates/:id/download-key | Download private key (server-side only) | Requester |

## Project Structure

```
├── server.js                  # Entry point, middleware, route mounting
├── config/db.js               # MongoDB Atlas connection
├── middleware/
│   ├── auth.js                # Session-based authentication check
│   └── role.js                # Per-route role authorization
├── models/
│   ├── User.js                # User schema (username, bcrypt hash, role)
│   └── CertRequest.js         # Request schema (status, CSR, cert, error)
├── routes/
│   ├── authRoutes.js          # Login, logout, dashboard
│   ├── requesterRoutes.js     # Request, upload CSR, view, download
│   └── approverRoutes.js      # Pending list, approve/retry, reject
├── services/
│   ├── csrService.js          # RSA key pair + CSR generation (node-forge)
│   └── openxpkiService.js     # OpenXPKI RPC integration (no fallback)
└── views/                     # EJS templates (role-based UI)
```

## Security Considerations

- Passwords never stored in plaintext — bcrypt with 10 salt rounds
- Sessions stored in MongoDB, not server memory — survives restarts
- Certificate downloads restricted to the original requester (ownership verification)
- Client-side CSR mode ensures the private key never touches the server
- Per-route middleware prevents cross-role access (not global router-level)
- OpenXPKI communication over HTTPS with axios

## What I Learned

- **PKI fundamentals**: X.509 certificate chain of trust, CSR generation, CA signing, CRL issuance
- **OpenXPKI internals**: RPC API integration, workflow engine, token aliases, realm configuration
- **Docker orchestration**: Multi-container setup, volume mounts, cross-container networking
- **Cross-platform debugging**: Resolving Windows/Linux compatibility issues (symlinks, CRLF, DNS resolution)
- **Production patterns**: Error handling with retry, role-based middleware, secure session management
