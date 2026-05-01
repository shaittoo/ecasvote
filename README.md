# eCASVote

**Blockchain-Based Electronic Voting System for the UP Visayas College of Arts and Sciences Student Council Elections**

A hybrid electronic and paper ballot voting system built on Hyperledger Fabric, designed to ensure transparency, immutability, and ballot secrecy for student council elections at the University of the Philippines Visayas, College of Arts and Sciences.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Tier 1: Frontend (Next.js :3000)                  │
│  ┌───────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────┐ │
│  │  Landing   │  │  Admin Panel │  │ Student Pages │  │Validator │ │
│  │  Page (/)  │  │  /admin/*    │  │/studentvoter/*│  │/validator│ │
│  └───────────┘  └──────────────┘  └───────────────┘  └──────────┘ │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP (port 3000 → 4000)
┌──────────────────────────▼──────────────────────────────────────────┐
│          Tier 2: Gateway API (Express :4000) + Services             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │   Auth    │  │  Election    │  │   Ballot   │  │  Integrity   │ │
│  │ Endpoints │  │  Management  │  │  Scanning  │  │    Check     │ │
│  └──────────┘  └──────────────┘  └─────┬──────┘  └──────────────┘ │
│                                        │                            │
│  ┌─────────────────┐    ┌──────────────▼──────────────────┐        │
│  │ SQLite (Prisma)  │    │   OMR Worker (FastAPI :8090)    │        │
│  │   Off-chain DB   │    │   OpenCV bubble + QR detection  │        │
│  └─────────────────┘    └─────────────────────────────────┘        │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ gRPC (ports 7051, 9051, 11051)
┌──────────────────────────▼──────────────────────────────────────────┐
│            Tier 3: Hyperledger Fabric 2.5 Network                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Org1 (SEB)  │  │ Org2 (Dept)  │  │  Org3 (PMB)  │             │
│  │ Org1MSP:7051 │  │ Org2MSP:9051 │  │Org3MSP:11051 │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────────────────────────────────────────┐             │
│  │  Orderer (etcdraft) :7050                        │             │
│  └──────────────────────────────────────────────────┘             │
│  ┌──────────────────────────────────────────────────┐             │
│  │  Channel: mychannel | Chaincode: ecasvote (Node) │             │
│  │  PDC: pdcVoters, pdcBallots (Org1 only)          │             │
│  └──────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Hyperledger Fabric 2.5, Node.js Chaincode |
| Backend API | Express 5, TypeScript, Prisma ORM, SQLite |
| Frontend | Next.js 16, React 19, Tailwind CSS, Chart.js |
| OMR Worker | Python FastAPI, OpenCV (paper ballot bubble detection) |
| Authentication | bcrypt, cookie-based sessions |
| Infrastructure | Docker, WSL2/Ubuntu |

## Quick Deploy (Ubuntu/Debian)

### Prerequisites

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Go 1.21
sudo snap install go --classic

# Python 3.10+ (for OMR worker)
sudo apt-get install -y python3 python3-pip python3-venv

# Hyperledger Fabric 2.5 binaries
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.0 binary
```

### Setup

```bash
git clone https://github.com/shaittoo/ecasvote.git
cd ecasvote
cp gateway-api/.env.example gateway-api/.env
# Edit gateway-api/.env — set CRYPTO_PATH to your Fabric network crypto material
./start.sh
```

### Access

| URL | Credentials |
|-----|-------------|
| http://localhost:3000 | Landing page (public) |
| http://localhost:3000/login | Admin: `admin@up.edu.ph` / `admin123` |
| http://localhost:3000/login | Validator: `validator@up.edu.ph` / `validator123` |

See [SETUP.md](SETUP.md) for the full setup guide.

## Organizations

The Fabric network models the real stakeholders in CAS SC elections:

| Org | MSP ID | Role | Peers |
|-----|--------|------|-------|
| **Org1** (SEB) | Org1MSP | Supreme Electoral Board — administers elections, registers voters, submits votes | peer0:7051 |
| **Org2** (Dept) | Org2MSP | Department/Adviser — co-endorses transactions, validates results | peer0:9051 |
| **Org3** (PMB) | Org3MSP | Party/Independent observer — co-endorses for transparency | peer0:11051 |

Private Data Collections (`pdcVoters`, `pdcBallots`) are accessible only to Org1, preserving ballot secrecy while maintaining an auditable on-chain hash.

## Key Features

- **Blockchain-backed voting** — every vote is recorded on Hyperledger Fabric with multi-org endorsement
- **Hybrid paper + digital ballots** — supports both digital voting and OMR-scanned paper ballots with hybrid OMR+blockchain vote flow
- **Ballot secrecy** — voter identity is never linked to vote selections in public records
- **Private Data Collections** — voter registration and encrypted ballots stored in Org1-only PDC
- **Integrity verification** — real-time comparison of blockchain tally vs. database records with admin override to sync DB to blockchain
- **Per-election voter roster** — voters are enrolled per election with per-election `hasVoted` tracking via `ElectionVoter`
- **Paper ballot token generation** — per-election token issuance for paper ballot flow, respects per-election vote status
- **Candidate and results publishing** — admin controls when candidates and results become publicly visible via `candidatesPublished` / `resultsPublished` flags
- **Audit trail** — all chaincode transactions logged with timestamps
- **Paper ballot scanning** — OpenCV-based OMR with QR code identification
- **Role-based access** — separate dashboards for Admin (SEB), Validator (Adviser), and public viewing

## Quick Start

See [SETUP.md](SETUP.md) for detailed startup instructions.

```bash
# 1. Start Fabric network
cd fabric-network-ecasvote
./network.sh up createChannel -c mychannel -ca

# 2. Deploy chaincode
cd chaincode-ecasvote
./deploy-chaincode.sh

# 3. Start gateway API
cd gateway-api
cp .env.example .env
npx prisma db push
npm run dev

# 4. Seed default users
curl -X POST http://localhost:4000/seed-users

# 5. Start frontend
cd frontend-ecasvote
npm run dev
```

## Project Structure

```
ecasvote/
├── fabric-network-ecasvote/   # Fabric network config, docker-compose, crypto
│   ├── organizations/         # Crypto material for all orgs
│   ├── network.sh             # Network lifecycle (up/down/createChannel)
│   └── docker/                # Docker compose files
├── chaincode-ecasvote/        # Hyperledger Fabric chaincode (TypeScript)
│   ├── src/ecasVote.ts        # Smart contract with all chaincode functions
│   ├── collections_config.json # PDC definitions (pdcVoters, pdcBallots)
│   └── deploy-chaincode.sh   # Chaincode packaging and deployment
├── gateway-api/               # Express REST API + Prisma ORM
│   ├── src/server.ts          # All API endpoints
│   ├── src/fabricClient.ts    # Fabric Gateway SDK connection
│   └── prisma/schema.prisma  # Database schema (SQLite)
├── frontend-ecasvote/         # Next.js frontend
│   ├── app/admin/             # SEB admin dashboard
│   ├── app/validator/         # Validator/adviser dashboard
│   ├── app/studentvoter/      # Public candidate and results pages
│   └── lib/ecasvoteApi.ts     # API client functions
├── omr-worker/                # Python FastAPI OMR service (OpenCV)
├── start.sh                   # Start all services
├── stop.sh                    # Stop all services
├── SETUP.md                   # Startup instructions
├── CONNECT.md                 # Component connection guide
├── TROUBLESHOOTING.md         # Known issues and fixes
├── SECURITY_ANALYSIS.md       # Security design documentation
└── SYSTEM_INVENTORY.md        # Complete API and schema reference
```

## Screenshots

*Screenshots to be added.*

## Thesis Context

This system was developed as a thesis project for the **University of the Philippines Visayas, College of Arts and Sciences**. It addresses the need for a transparent, verifiable, and tamper-resistant electronic voting system for CAS Student Council elections.

The system demonstrates how permissioned blockchain technology (Hyperledger Fabric) can be applied to small-scale institutional elections, providing:
- Cryptographic proof of vote integrity
- Multi-stakeholder endorsement of transactions
- Separation of voter identity from ballot content
- Auditability without compromising ballot secrecy

## Authors

- Shaina Talisay
- University of the Philippines Visayas
- College of Arts and Sciences

## License

This project is developed for academic purposes.
