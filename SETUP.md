# eCASVote Setup Guide

Practical steps to run eCASVote locally on **WSL2/Ubuntu** (Linux filesystem). **Production deployment on Debian** (Nginx, TLS, backups) is in **[DEPLOY.md](DEPLOY.md)** — use that for servers, not this file.

## Ballot scanning (OMR)

**Use A4 paper** for printed ballots. The OMR pipeline rectifies to a canonical A4 aspect; other sizes skew geometry and degrade bubble read.

---

## WSL2 on Windows

- **Keep repos on the Linux filesystem**, not under `/mnt/c/`. Docker volume mounts and I/O break or slow badly on the 9P bridge.
  ```
  GOOD:  ~/go/src/github.com/shaittoo/ecasvote
  BAD:   /mnt/c/Users/.../ecasvote
  ```
- Docker Desktop: enable **WSL2 integration** for your distro.

## Directory layout (required)

Clone **two** repositories as **siblings** (same parent folder). The gateway **Docker Compose** file mounts **`../fabric-network-ecasvote/organizations`** into the container — a copy of Fabric **inside** `ecasvote/` will not work for that layout.

```text
~/go/src/github.com/shaittoo/
├── ecasvote/                    # this repo
└── fabric-network-ecasvote/     # https://github.com/shaittoo/fabric-network-ecasvote
```

Throughout this guide, **`ecasvote/`** means this repo and **`fabric-network-ecasvote/`** means the sibling clone.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 18+ | Chaincode build (`chaincode-ecasvote`), optional local gateway/frontend |
| npm | 9+ | With Node |
| Docker | 24+ | Fabric + app containers |
| Docker Compose | v2 | `docker compose` |
| Go | 1.21+ | Fabric peer CLI (`peer lifecycle …`) used by `ccaas-deploy.sh` |
| Python | 3.10+ | Optional: OMR worker outside Docker |
| Hyperledger Fabric binaries | 2.5.x | `peer`, `orderer`, `configtxgen`, `cryptogen` on `PATH` (or use `fabric-network-ecasvote/bin`) |

Add Fabric tools to `PATH` if needed (adjust paths to match your install):

```bash
export PATH="$PATH:$HOME/go/src/github.com/shaittoo/fabric-network-ecasvote/bin"
```

---

## 1. Fabric network (cryptogen, sibling repo)

```bash
cd ~/go/src/github.com/shaittoo/fabric-network-ecasvote
```

### Org3 crypto (before first network bring-up)

Org3 uses material from **`addOrg3/org3-crypto.yaml`**. Generate it **before** `./network.sh up` if those directories are missing:

```bash
bin/cryptogen generate --config=./addOrg3/org3-crypto.yaml --output=organizations
```

If `cryptogen` is on your `PATH` instead of `bin/`, run the same command with that binary.

### Start network and channel (no Fabric CA)

This stack uses **cryptogen** identities, **not** `./network.sh … -ca`.

```bash
./network.sh up createChannel -c mychannel
docker ps
# Expect peer0.org1, peer0.org2, orderer, etc. (no CA containers for this flow)
```

### Org3 peer container

Org3’s peer **does not** start with `network.sh up`. After the network is up, start the peer (paths assume you are still in `fabric-network-ecasvote/`):

```bash
docker start peer0.org3.example.com 2>/dev/null || docker run -d \
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
  -v "$(pwd)/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/msp:/etc/hyperledger/fabric/msp" \
  -v "$(pwd)/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls:/etc/hyperledger/fabric/tls" \
  -p 11051:11051 \
  hyperledger/fabric-peer:2.5
```

---

## 2. Chaincode (CCaaS)

Deploy **chaincode-as-a-service** from the **Fabric** repo (not `deploy-chaincode.sh`). The script packages CCaaS metadata, installs/commits on peers, and expects chaincode sources at **`../ecasvote/chaincode-ecasvote`** relative to `fabric-network-ecasvote/`.

```bash
cd ~/go/src/github.com/shaittoo/fabric-network-ecasvote
./ccaas-deploy.sh
```

Build TypeScript chaincode first if you changed contract code:

```bash
cd ~/go/src/github.com/shaittoo/ecasvote/chaincode-ecasvote
npm install
npm run build
cd ~/go/src/github.com/shaittoo/fabric-network-ecasvote
./ccaas-deploy.sh
```

### Chaincode service container

`ccaas-deploy.sh` normally ends by starting **`chaincode-ecasvote`** via `compose/docker/docker-compose-ccaas.yaml`. Confirm:

```bash
docker ps --format '{{.Names}}' | grep chaincode-ecasvote
```

If the container is **not** running after a successful commit, start it manually from `fabric-network-ecasvote/` (use the **package ID** printed at the end of `ccaas-deploy.sh`, or from `peer lifecycle chaincode calculatepackageid` on the packaged tarball):

```bash
cd ~/go/src/github.com/shaittoo/fabric-network-ecasvote
export CHAINCODE_ID='<package_id_from_ccaas_deploy_output>'
docker compose -f compose/docker/docker-compose-ccaas.yaml up -d --build
```

Legacy **`chaincode-ecasvote/deploy-chaincode.sh`** (in-docker chaincode lifecycle) is **not** the supported path for this environment; prefer **`ccaas-deploy.sh`**.

---

## 3. Gateway, frontend, OMR (Docker Compose)

From **`ecasvote/`** (repo root), run the app stack the same way you would on a server: **gateway + omr-worker + frontend** in containers with host networking.

```bash
cd ~/go/src/github.com/shaittoo/ecasvote
cp .env.example .env
# Edit .env if needed; for local all-on-one-host, defaults usually suffice.
docker compose build
docker compose up -d
```

- Gateway listens on **4000**, frontend on **3000**, OMR on **8090** (see root `docker-compose.yml`).
- Crypto is mounted from **`../fabric-network-ecasvote/organizations`**.

### Seed users and init (once per fresh DB)

```bash
curl -X POST http://localhost:4000/seed-users
curl -X POST http://localhost:4000/init
```

Defaults:

- **Admin**: `admin@up.edu.ph` / `admin123`
- **Validator**: `validator@up.edu.ph` / `validator123`

### Gateway environment (reference)

| Variable | Typical local value | Description |
|----------|---------------------|-------------|
| `PORT` | `4000` | Gateway port |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite (path inside container image layout) |
| `CHANNEL_NAME` | `mychannel` | Fabric channel |
| `CHAINCODE_NAME` | `ecasvote` | Chaincode name |
| `MSP_ID` | `Org1MSP` | Gateway MSP |
| `CRYPTO_PATH` / `CRYPTO_BASE_PATH` | Set in Compose | Org crypto inside mounted volume |
| `PEER_ENDPOINT` | `localhost:7051` | Org1 peer |
| `OMR_WORKER_URL` | `http://127.0.0.1:8090` | OMR worker (Compose sets this) |

Do **not** rely on **`npm run dev`** in `gateway-api/` for the “full stack” you ship to production — that is only for quick edits (see **Local dev shortcut** below).

---

## 4. Frontend URL

Open **http://localhost:3000** (containerized Next.js). Gateway is reached via Compose wiring / same host.

---

## 5. OMR worker

With root **`docker compose up -d`**, the OMR worker is already included. To run it alone for debugging, see **`omr-worker/README.md`** or:

```bash
cd ~/go/src/github.com/shaittoo/ecasvote/omr-worker
docker compose up --build
```

---

## 6. Local dev shortcut (`start.sh`)

For day-to-day coding on gateway/frontend with **hot reload**, you can use the repo script (Fabric + **npm** gateway/frontend + optional OMR). From **`ecasvote/`**:

```bash
./start.sh
```

It expects the **sibling** `../fabric-network-ecasvote`, runs **cryptogen** network bring-up (no `-ca`), runs **`ccaas-deploy.sh`** when the network was just started, and starts **npm run dev** for gateway and frontend. Use **`./stop.sh`** to tear down those processes and stop Fabric-related containers.

This path is **development convenience**; parity with deployment is **`docker compose`** in this repo plus **[DEPLOY.md](DEPLOY.md)** on Debian.

---

## 7. Import voter roster

1. Log in as admin at http://localhost:3000/login  
2. **Voter Management → Voter Roster**  
3. **Select the target election** in the dropdown  
4. **Import roster** — CSV/TSV columns:
   ```
   student_id  full_name  up_mail  college  program  year_level  academic_org  enrollment_status
   ```

---

## 8. Election setup sequence

1. Create election (DRAFT) via UI or `POST /elections`  
2. Confirm positions on-chain (`GetElection` or UI)  
3. Add candidates (DRAFT)  
4. Confirm candidates on-chain  
5. Import voter CSV (election selected first)  
6. Generate tokens (Token Status)  
7. Open election (`POST /elections/:id/open`)  
8. Then scan / vote  

---

## Peer CLI (optional)

From a shell (adjust `FABRIC_NET` to your sibling clone path):

```bash
export FABRIC_NET="$HOME/go/src/github.com/shaittoo/fabric-network-ecasvote"
export PATH="$PATH:$FABRIC_NET/bin"
export FABRIC_CFG_PATH="$FABRIC_NET/config"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_TLS_ROOTCERT_FILE=$FABRIC_NET/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=$FABRIC_NET/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
export ORDERER_CA=$FABRIC_NET/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
```

---

## Startup order (summary)

1. Docker (Fabric peers, orderer, Org3 peer, **chaincode-ecasvote**)  
2. **`docker compose up -d`** in **`ecasvote/`** (gateway, omr-worker, frontend)  
3. Optional: **`./start.sh`** instead for npm-based local dev only  

---

## Shutdown

```bash
cd ~/go/src/github.com/shaittoo/ecasvote
docker compose down

docker stop chaincode-ecasvote 2>/dev/null || true

cd ~/go/src/github.com/shaittoo/fabric-network-ecasvote
./network.sh down
```

If you used **`./stop.sh`**, run it from `ecasvote/` first, then `network.sh down` as above.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| `ECONNREFUSED` on 7051 | Fabric up? `cd ../fabric-network-ecasvote && ./network.sh up createChannel -c mychannel` |
| Gateway cannot load crypto | Sibling path: `../fabric-network-ecasvote/organizations` must exist; Compose mounts it |
| Endorsement / chaincode errors | Org3 peer up? `chaincode-ecasvote` container running? Re-run **`./ccaas-deploy.sh`** after code changes (bump sequence as needed) |
| Prisma errors | `docker compose` logs for gateway; for local DB tools, `npx prisma db push` from `gateway-api/` against same `dev.db` |
| Slow I/O | Not on `/mnt/c/` |
| OMR unavailable | `docker compose` includes omr-worker; check port 8090 and gateway `OMR_WORKER_URL` |

For component wiring details, see **[CONNECT.md](CONNECT.md)**. For scan/Omr tuning, see **`omr-worker`** env vars in root **`docker-compose.yml`**.
