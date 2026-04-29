# eCASVote Component Connections

How the system components connect to each other.

## Connection Diagram

```
Frontend (Next.js :3000)
    │
    │  NEXT_PUBLIC_GATEWAY_URL (default: http://localhost:4000)
    ▼
Gateway API (Express :4000)
    │
    ├── Prisma ORM → SQLite (prisma/dev.db)
    │
    ├── OMR_WORKER_URL → OMR Worker (FastAPI :8090)
    │
    └── gRPC → Fabric Network
            ├── peer0.org1 :7051 (primary gateway peer)
            ├── peer0.org2 :9051 (endorser via service discovery)
            └── peer0.org3 :11051 (endorser via service discovery)
```

## 1. Fabric Network to Gateway API

The Gateway API connects to the Fabric network through `gateway-api/src/fabricClient.ts`.

### Crypto Material Path

The gateway reads Org1's identity and TLS certificates from the Fabric network's crypto directory:

```
CRYPTO_BASE_PATH = fabric-network-ecasvote/organizations/peerOrganizations/
```

Within this base path, the gateway uses:

| Purpose | Path |
|---------|------|
| User identity (signing) | `org1.example.com/users/User1@org1.example.com/msp/signcerts/` |
| Private key | `org1.example.com/users/User1@org1.example.com/msp/keystore/` |
| Org1 TLS cert | `org1.example.com/peers/peer0.org1.example.com/tls/ca.crt` |
| Org2 TLS cert | `org2.example.com/peers/peer0.org2.example.com/tls/ca.crt` |
| Org3 TLS cert | `org3.example.com/peers/peer0.org3.example.com/tls/ca.crt` |

### Peer Connections

The gateway creates gRPC connections to all three peers:

| Peer | Endpoint | MSP ID | Host Alias |
|------|----------|--------|------------|
| Org1 (SEB) | `localhost:7051` | `Org1MSP` | `peer0.org1.example.com` |
| Org2 (Dept) | `localhost:9051` | `Org2MSP` | `peer0.org2.example.com` |
| Org3 (PMB) | `localhost:11051` | `Org3MSP` | `peer0.org3.example.com` |

The primary gateway peer is Org1. Service discovery routes endorsement requests to Org2 and Org3.

### Endorsement Configuration

Most transactions use all three orgs for endorsement:
```typescript
endorsingOrganizations: ['Org1MSP', 'Org2MSP', 'Org3MSP']
```

Exceptions (Org1 only, due to PDC access):
- `RegisterVoter` -- writes to `pdcVoters` (Org1 only)
- `CastVoteEncrypted` -- writes to `pdcBallots` (Org1 only)

## 2. Gateway API to OMR Worker

The OMR worker is an optional FastAPI service that performs paper ballot bubble detection using OpenCV.

```
Gateway API  ──POST /process──>  OMR Worker (:8090)
             <──JSON response──
```

Set in `gateway-api/.env`:
```
OMR_WORKER_URL=http://127.0.0.1:8090
```

If the OMR worker is unavailable, the gateway falls back to QR-code-only scanning (no bubble detection).

## 3. Frontend to Gateway API

The Next.js frontend communicates with the gateway API over HTTP.

```
Frontend (:3000)  ──HTTP──>  Gateway API (:4000)
```

Set in frontend environment (or use the default proxy):
```
NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000
```

All API calls go through `frontend-ecasvote/lib/ecasvoteApi.ts` which prepends the gateway base URL.

## 4. Gateway API .env Reference

```env
# Server
PORT=4000

# Database
DATABASE_URL=file:./prisma/dev.db

# Fabric Network
CHANNEL_NAME=mychannel
CHAINCODE_NAME=ecasvote
MSP_ID=Org1MSP
PEER_ENDPOINT=localhost:7051
PEER_HOST_ALIAS=peer0.org1.example.com

# Crypto paths (auto-detected from CRYPTO_BASE_PATH if not set)
# CRYPTO_PATH=../fabric-network-ecasvote/organizations/peerOrganizations/org1.example.com
# KEY_DIRECTORY_PATH=...
# CERT_DIRECTORY_PATH=...
# TLS_CERT_PATH=...

# Org2/Org3 peer endpoints (defaults shown)
# PEER_ENDPOINT_ORG2=localhost:9051
# PEER_ENDPOINT_ORG3=localhost:11051

# OMR Worker (optional)
OMR_WORKER_URL=http://127.0.0.1:8090
```

## 5. Authentication Flow

```
Login Page ──POST /login──> Gateway API
           ──POST /login/admin──>
           ──POST /login/validator──>

Gateway validates against:
  - Voter table (student login: studentNumber + upEmail)
  - User table (admin/validator login: email + bcrypt password)

On success:
  - localStorage stores user data
  - Cookie "ecasvote_role" set for middleware route protection
  - Redirect to role-specific dashboard
```

## 6. Vote Submission Flow (Paper Ballot)

```
1. Admin scans ballot image
2. Frontend sends base64 image to POST /scanner/scan-image
3. Gateway forwards to OMR worker for bubble detection
4. OMR returns detected selections
5. Admin reviews and confirms
6. Frontend calls POST /scanner/confirm-vote
7. Gateway:
   a. Validates ballot token in PaperBallotIssuance table
   b. Creates PaperAnonymousVote record (DB)
   c. Marks token as used
   d. Calls RegisterVoter on chaincode (Org1 only)
   e. Calls CastVoteEncrypted on chaincode (Org1 only)
   f. Creates anonymized Vote records (DB)
   g. If chaincode fails, rolls back DB changes
```
