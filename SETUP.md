# eCASVote – Full stack setup for teammates

Run the **Fabric network**, **chaincode**, **gateway API**, and **frontend** on your machine. Follow the steps in order.

---

## Quick start (Fabric + chaincode already running)

If the Fabric network and chaincode are already up and committed on `mychannel`:

1. **Gateway**
   ```bash
   cd gateway-api
   cp .env.example .env
   # Edit .env: set CRYPTO_PATH to your Fabric org1 path (see section 3)
   npm install && npm run dev
   ```
2. **Frontend**
   ```bash
   cd frontend-ecasvote
   echo "NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000" > .env.local
   npm install && npm run dev
   ```
3. Open **http://localhost:3000**. Optionally seed: `curl -X POST http://localhost:4000/init`

---

## Prerequisites

- **Node.js** 18+ and **npm**
- **Docker** and **Docker Compose** (for Fabric)
- **Go** 1.21+ (for Fabric `peer` CLI; optional if you use pre-built binaries)
- **Fabric test network** – either:
  - [fabric-samples/test-network](https://github.com/hyperledger/fabric-samples/tree/main/test-network) (2 orgs), or
  - your **test-network-ecasvote** (3 orgs) clone

---

## 1. Repo and paths

Clone the eCASVote repo (or pull latest). Decide where you keep:

- **eCASVote repo** – e.g. `~/dev/eCASVote` or `$HOME/dev/eCASVote`
- **Fabric network** – e.g. `~/go/src/github.com/<org>/fabric-samples/test-network-ecasvote` or `test-network`

Set these for the steps below:

```bash
# Your eCASVote project root
export ECASVOTE_ROOT=~/dev/eCASVote

# Your Fabric test-network directory (must contain network.sh, organizations/, etc.)
export FABRIC_NETWORK_DIR=~/go/src/github.com/shaittoo/fabric-samples/test-network-ecasvote
```

---

## 2. Fabric network

From your **Fabric network** directory.

### 2.1 Bring up the network and channel

```bash
cd "$FABRIC_NETWORK_DIR"

# Start peers and orderer
./network.sh up

# Create channel (e.g. mychannel)
./network.sh createChannel -c mychannel

# Join all orgs to the channel (adjust script name if yours is different)
# For standard test-network:
./network.sh joinChannel -c mychannel
```

If you use a **3-org** script, run the equivalent steps so Org1, Org2, (and Org3) join `mychannel`.

### 2.2 Build and deploy chaincode

**Option A – Using the deploy script (edit paths first)**

Edit `$ECASVOTE_ROOT/chaincode-ecasvote/deploy-chaincode.sh` and set:

- `CHAINCODE_DIR` – path to `chaincode-ecasvote` (e.g. `$ECASVOTE_ROOT/chaincode-ecasvote`)
- `NETWORK_DIR` – your `$FABRIC_NETWORK_DIR`

Then run:

```bash
cd "$ECASVOTE_ROOT/chaincode-ecasvote"
./deploy-chaincode.sh
```

**Option B – Manual (see DEPLOY.md)**

1. Build chaincode:
   ```bash
   cd "$ECASVOTE_ROOT/chaincode-ecasvote"
   npm run build
   npm run package
   ```
2. From `$FABRIC_NETWORK_DIR`: package with `peer lifecycle chaincode package`, install on each org’s peer, approve, commit. Use `--collections-config` pointing to `chaincode-ecasvote/collections_config_test_network.json` if you use private data.

After deploy, the chaincode **ecasvote** must be committed on **mychannel** and peers must be able to endorse.

---

## 3. Gateway API

The gateway connects to Fabric as **Org1** and talks to the chaincode.

### 3.1 Install and configure

```bash
cd "$ECASVOTE_ROOT/gateway-api"
npm install
cp .env.example .env
```

Edit **.env** and set paths to **your** Fabric org1 crypto:

```env
# Point to YOUR Fabric network’s Org1 crypto
CRYPTO_PATH=/path/to/your/fabric-samples/test-network-ecasvote/organizations/peerOrganizations/org1.example.com

# Usually these are fine if Fabric runs locally
CHANNEL_NAME=mychannel
CHAINCODE_NAME=ecasvote
MSP_ID=Org1MSP
PEER_ENDPOINT=localhost:7051
PEER_HOST_ALIAS=peer0.org1.example.com
PORT=4000
```

**Important:** `CRYPTO_PATH` must be the **full path** to `.../peerOrganizations/org1.example.com` (no trailing slash). Example for a teammate:

```env
CRYPTO_PATH=/home/teammate/go/src/github.com/shaittoo/fabric-samples/test-network-ecasvote/organizations/peerOrganizations/org1.example.com
```

### 3.2 Run

```bash
npm run dev
```

The API will listen on **http://localhost:4000**.

---

## 4. Frontend

The frontend talks to the gateway API.

### 4.1 Install and configure

```bash
cd "$ECASVOTE_ROOT/frontend-ecasvote"
npm install
```

Create **.env.local** if it doesn’t exist:

```env
# Gateway API URL (default if gateway runs on same machine)
NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000
# or
NEXT_PUBLIC_ECASVOTE_API_URL=http://localhost:4000
```

If the gateway runs on another machine, use that host:

```env
NEXT_PUBLIC_GATEWAY_URL=http://192.168.1.10:4000
```

### 4.2 Run

```bash
npm run dev
```

Open **http://localhost:3000** in the browser.

---

## 5. Initialize the ledger (first time)

After the gateway and chaincode are running, seed the default election (optional):

```bash
curl -X POST http://localhost:4000/init
```

This calls chaincode `InitLedger` and syncs the default election to the DB. If you prefer to create elections only via the UI, you can skip this.

---

## 6. Order of operations (summary)

| Step | What to run | Where |
|------|-------------|--------|
| 1 | `./network.sh up` and create/join channel | Fabric network dir |
| 2 | Deploy chaincode (script or manual) | chaincode-ecasvote + Fabric network dir |
| 3 | `npm run dev` | gateway-api |
| 4 | `npm run dev` | frontend-ecasvote |
| 5 | (Optional) `POST /init` | curl to gateway |

**Daily workflow:**  
Start Fabric (if stopped), then start gateway-api, then frontend. Use the same `CRYPTO_PATH` and channel/chaincode names everywhere.

---

## 7. Troubleshooting

- **Gateway can’t connect to peer**  
  Check `CRYPTO_PATH`, `PEER_ENDPOINT`, and that the Fabric network is up (`docker ps` should show peer and orderer containers).

- **“Election does not exist” or 404**  
  Call `POST http://localhost:4000/init` once, or create an election from Admin → Election Management.

- **Frontend can’t reach API**  
  Check `NEXT_PUBLIC_GATEWAY_URL` / `NEXT_PUBLIC_ECASVOTE_API_URL` and CORS. Gateway runs on port 4000 by default.

- **Different machine / network**  
  Set `CRYPTO_PATH` to the path **on the machine where the gateway runs** (that’s where the Fabric crypto must be). Frontend only needs the gateway’s URL (e.g. `http://host:4000`).

---

## 8. Optional: Prisma Studio (gateway DB)

To inspect or edit data in the gateway’s SQLite DB:

```bash
cd "$ECASVOTE_ROOT/gateway-api"
npm run studio
```

Opens Prisma Studio at http://localhost:5555.
