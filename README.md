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
| Infrastructure | Docker (Compose v2), Debian 13, Nginx (TLS reverse proxy) |

## Production deployment on Debian 13

Use this path for a **single school server** (e.g. clients reach **`https://192.168.1.6`**). Nginx TLS paths, routing, **smoke tests**, and **SQLite backup** are in **[DEPLOY.md](DEPLOY.md)**—keep it open while you run the steps below.

### 0. Directory layout (required)

Clone **two** repos as **siblings** (the gateway Compose file mounts **`../fabric-network-ecasvote/organizations`**):

```text
~/ecasvote-system/
├── ecasvote/                    # this repository
└── fabric-network-ecasvote/     # https://github.com/shaittoo/fabric-network-ecasvote
```

### 1. Install packages on Debian

```bash
sudo apt-get update
sudo apt-get install -y git nginx curl ca-certificates

# Docker Engine + Compose v2 plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# Log out and back in for the docker group.
docker compose version
```

### 2. Hyperledger Fabric and chaincode

On the **same host**:

1. In **`fabric-network-ecasvote`**, bring up the network, create the channel, and deploy chaincode. **CCaaS** is recommended on recent Linux kernels (e.g. 6.12); use that repo’s **`ccaas-deploy.sh`** and its README.
2. Confirm **`fabric-network-ecasvote/organizations/`** exists before starting the gateway container.

### 3. TLS for Nginx

Install **`ecasvote.crt`** and **`ecasvote.key`** under **`/etc/nginx/ssl/`** as described in **[DEPLOY.md — TLS material](DEPLOY.md#tls-material)**. Adjust **`server_name`** in **`nginx/ecasvote.conf`** if your IP or DNS name is not **`192.168.1.6`**.

### 4. Build and run eCASVote (Docker Compose)

From **`ecasvote/`** (this repo root):

```bash
cd ~/ecasvote-system/ecasvote
cp .env.example .env
# For production behind Nginx, leave NEXT_PUBLIC_GATEWAY_URL empty in .env so the
# browser uses same-origin /ecasvote-gateway (see DEPLOY.md).

export NEXT_PUBLIC_IMAGE_REMOTE_HOSTS=192.168.1.6   # or your HTTPS hostname

docker compose build
docker compose up -d
```

This starts **gateway** (4000), **omr-worker** (8090), and **frontend** (3000) with **`network_mode: host`**.

### 5. Enable the Nginx site

```bash
cd ~/ecasvote-system/ecasvote
sudo cp nginx/ecasvote.conf /etc/nginx/sites-available/ecasvote.conf
sudo ln -sf /etc/nginx/sites-available/ecasvote.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Verify and back up

- Run **[DEPLOY.md — Smoke Tests](DEPLOY.md#smoke-tests)**.
- Schedule **[DEPLOY.md — SQLite Backup](DEPLOY.md#sqlite-backup)** before upgrades or Fabric resets.

### 7. After a reboot

1. Fabric (peers, orderer, CCaaS chaincode container if used)  
2. **`docker compose up -d`** in **`ecasvote/`**  
3. **Nginx**

---

## Local development

For laptops and **non-production** setups (Node, npm, optional local Fabric), follow **[SETUP.md](SETUP.md)** and **`./start.sh`**. Default URLs are **`http://localhost:3000`** (frontend) and **`http://localhost:4000`** (gateway); credentials and seeding are described in SETUP.md.

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
- **Paper ballot scanning** — OpenCV-based OMR with QR code identification (document camera path on the admin scanner UI; gateway `POST /scanner/scan-image` forwards to the OMR worker when `OMR_WORKER_URL` is set)
- **Public landing election picker** — students choose which election to view; defaults to the **most recently started OPEN** election (`lib/studentElectionDefaults.ts`); **View Candidates** / **View Results** pass `?election=<id>` to student pages
- **Role-based access** — separate dashboards for Admin (SEB), Validator (Adviser), and public viewing

## Quick Start

See [SETUP.md](SETUP.md) for detailed startup instructions. From this repo root you can also use **`./start.sh`** and **`./stop.sh`** to bring local services up or down (see SETUP.md for prerequisites). **Org3’s peer** often needs a manual `docker start` after the network is up—SETUP.md covers that.

```bash
# 1. Start Fabric network (cryptogen; no -ca). Sibling clone — see Project Structure.
cd ../fabric-network-ecasvote
./network.sh up createChannel -c mychannel

# 2. Deploy chaincode via CCaaS (still in fabric-network-ecasvote; reads ../ecasvote/chaincode-ecasvote)
./ccaas-deploy.sh

# 3. Start gateway API
cd ../ecasvote/gateway-api
cp .env.example .env
npx prisma db push
npm run dev

# 4. Seed default users
curl -X POST http://localhost:4000/seed-users

# 5. Start frontend
cd ../frontend-ecasvote
npm run dev
```

## Project Structure

The Fabric peer network is **[fabric-network-ecasvote](https://github.com/shaittoo/fabric-network-ecasvote)** (separate clone, **sibling** of this repo for production Compose; see **Production deployment on Debian 13** above).

```
ecasvote/
├── chaincode-ecasvote/        # Hyperledger Fabric chaincode (TypeScript)
│   ├── src/ecasVote.ts        # Smart contract with all chaincode functions
│   ├── collections_config.json # PDC definitions (pdcVoters, pdcBallots)
│   └── deploy-chaincode.sh   # Chaincode packaging and deployment
├── gateway-api/               # Express REST API + Prisma ORM
│   ├── src/server.ts          # All API endpoints
│   ├── src/fabricClient.ts    # Fabric Gateway SDK connection
│   └── prisma/schema.prisma  # Database schema (SQLite)
├── frontend-ecasvote/         # Next.js frontend
│   ├── lib/studentElectionDefaults.ts  # Public/student: default OPEN election + select ordering
│   ├── app/admin/             # SEB admin dashboard
│   ├── app/validator/         # Validator/adviser dashboard
│   ├── app/studentvoter/      # Public candidate and results pages
│   └── lib/ecasvoteApi.ts     # API client functions
├── omr-worker/                # Python FastAPI OMR service (OpenCV)
├── nginx/                     # Nginx site template (production)
├── start.sh                   # Start all services
├── stop.sh                    # Stop all services
├── SETUP.md                   # Local/dev startup instructions
├── DEPLOY.md                  # Production: TLS, Nginx, smoke tests, backups
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
- Jullyanne
- Elisha Andrea
- University of the Philippines Visayas
- College of Arts and Sciences

## License

This project is developed for academic purposes.
