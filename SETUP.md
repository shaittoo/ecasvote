# eCASVote Setup Guide

Complete setup instructions for running eCASVote on WSL2/Ubuntu.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Required for chaincode, gateway, and frontend |
| npm | 9+ | Comes with Node.js |
| Docker | 24+ | For Fabric network containers |
| Docker Compose | v2+ | Fabric network orchestration |
| Go | 1.21+ | Required by Fabric peer CLI tools |
| Python | 3.10+ | OMR worker (optional, for paper ballot scanning) |
| Hyperledger Fabric binaries | 2.5.x | `peer`, `orderer`, `configtxgen` in PATH |

### WSL2-Specific Notes

- **Run from the Linux filesystem**, not `/mnt/c/`. The working directory should be:
  ```
  ~/go/src/github.com/shaittoo/ecasvote
  ```
  Running from `/mnt/c/Users/...` causes severe I/O performance issues with Docker and Node.js.

- Ensure Docker Desktop is configured to use the WSL2 backend.

- Add Fabric binaries to PATH:
  ```bash
  export PATH=$PATH:$HOME/go/src/github.com/shaittoo/fabric-samples/bin
  ```

## 1. Fabric Network

```bash
cd fabric-network-ecasvote

# Start the network with a channel and certificate authorities
./network.sh up createChannel -c mychannel -ca

# Verify containers are running
docker ps
# You should see: peer0.org1, peer0.org2, orderer, ca containers
```

### Org3 (PMB) -- Manual Docker Start

Org3 is not part of the default `network.sh`. Start it manually:

```bash
docker run -d \
  --name peer0.org3.example.com \
  --network fabric_test \
  -e CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock \
  -e CORE_PEER_ID=peer0.org3.example.com \
  -e CORE_PEER_ADDRESS=peer0.org3.example.com:11051 \
  -e CORE_PEER_LISTENADDRESS=0.0.0.0:11051 \
  -e CORE_PEER_LOCALMSPID=Org3MSP \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/server.crt \
  -e CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/server.key \
  -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt \
  -v $(pwd)/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/msp:/etc/hyperledger/fabric/msp \
  -v $(pwd)/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls:/etc/hyperledger/fabric/tls \
  -p 11051:11051 \
  hyperledger/fabric-peer:2.5
```

## 2. Chaincode Deployment

```bash
cd chaincode-ecasvote

# Build the chaincode
npm install
npm run build
npm run package    # Creates npm-shrinkwrap.json

# Deploy using the deployment script
./deploy-chaincode.sh
```

The deployment script uses `peer lifecycle chaincode` commands to:
1. Package the chaincode as `ecasvote.tar.gz`
2. Install on peer0.org1 and peer0.org2
3. Approve for both organizations
4. Commit to the channel with collections config

If upgrading, increment the sequence number in the script.

## 3. Gateway API

```bash
cd gateway-api

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env if needed (defaults work for local development)

# Initialize the database
npx prisma db push

# Start the development server (port 4000)
npm run dev
```

### Seed Default Users

After the gateway is running, create the default admin and validator accounts:

```bash
curl -X POST http://localhost:4000/seed-users
```

This creates:
- **Admin**: `admin@up.edu.ph` / `admin123`
- **Validator**: `validator@up.edu.ph` / `validator123`

### Initialize the Blockchain Ledger

```bash
curl -X POST http://localhost:4000/init
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Gateway API port |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite database path |
| `CHANNEL_NAME` | `mychannel` | Fabric channel name |
| `CHAINCODE_NAME` | `ecasvote` | Chaincode name |
| `MSP_ID` | `Org1MSP` | Gateway identity MSP |
| `CRYPTO_PATH` | Auto-detected | Path to org1 crypto material |
| `PEER_ENDPOINT` | `localhost:7051` | Org1 peer gRPC endpoint |
| `OMR_WORKER_URL` | `http://127.0.0.1:8090` | OMR worker URL (optional) |

## 4. Frontend

```bash
cd frontend-ecasvote

# Install dependencies
npm install

# Start the development server (port 3000)
npm run dev
```

The frontend connects to the gateway API. By default it proxies to `http://localhost:4000`. To change this, set `NEXT_PUBLIC_GATEWAY_URL` in the environment.

## 5. OMR Worker (Optional)

The OMR worker provides paper ballot bubble detection using OpenCV. It is optional -- without it, only QR code scanning is available.

```bash
cd omr-worker

# Using Docker (recommended)
docker build -t omr-worker .
docker run -d -p 8090:8090 --name omr-worker omr-worker

# Or using Python directly
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8090
```

Set `OMR_WORKER_URL=http://127.0.0.1:8090` in gateway-api/.env.

## 6. Import Voter Roster

1. Log in as admin at http://localhost:3000/login
2. Navigate to Voter Management > Voter Roster
3. Click "Import roster" and upload a CSV/TSV file with columns:
   ```
   student_id  full_name  up_mail  college  program  year_level  academic_org  enrollment_status
   ```
4. After import, voters are automatically synced to the active election roster.

## Startup Order

1. Docker (Fabric network containers)
2. Gateway API (`npm run dev` in gateway-api/)
3. Frontend (`npm run dev` in frontend-ecasvote/)
4. OMR Worker (optional, `docker run` or `uvicorn`)

## Shutdown

```bash
# Stop frontend and gateway (Ctrl+C in their terminals)

# Stop Fabric network
cd fabric-network-ecasvote
./network.sh down

# Stop OMR worker
docker stop omr-worker
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` on port 7051 | Fabric network not running. Run `./network.sh up createChannel` |
| `endorsement failure` | Check that chaincode is deployed and all peers are running |
| Prisma errors | Run `npx prisma db push` and `npx prisma generate` |
| Slow file operations | Ensure you are running from Linux filesystem, not `/mnt/c/` |
| OMR worker unavailable | Start the OMR worker container or set `OMR_WORKER_URL` correctly |
