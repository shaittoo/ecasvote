#!/bin/bash
# eCASVote — Start all services (local development)
#
# Production on Debian uses Docker Compose + Nginx — see DEPLOY.md and README.md.
#
# NOTE: Before running this script, ensure gateway-api/.env exists and
# CRYPTO_PATH is set to the correct path for your Fabric network crypto
# material. See SETUP.md for details.
#
# Usage: ./start.sh (from the repo root)

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
# Prefer sibling clone (same layout as docker-compose and README); fall back to legacy nested path.
if [ -d "$REPO_DIR/../fabric-network-ecasvote" ] && [ -f "$REPO_DIR/../fabric-network-ecasvote/network.sh" ]; then
  NETWORK_DIR="$(cd "$REPO_DIR/../fabric-network-ecasvote" && pwd)"
elif [ -d "$REPO_DIR/fabric-network-ecasvote" ] && [ -f "$REPO_DIR/fabric-network-ecasvote/network.sh" ]; then
  NETWORK_DIR="$REPO_DIR/fabric-network-ecasvote"
else
  echo -e "\033[0;31m[eCASVote]\033[0m fabric-network-ecasvote not found. Clone https://github.com/shaittoo/fabric-network-ecasvote next to this repo (../fabric-network-ecasvote) or under ${REPO_DIR}/fabric-network-ecasvote"
  exit 1
fi
GATEWAY_DIR="$REPO_DIR/gateway-api"
FRONTEND_DIR="$REPO_DIR/frontend-ecasvote"
OMR_DIR="$REPO_DIR/omr-worker"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[eCASVote]${NC} $1"; }
warn()  { echo -e "${YELLOW}[eCASVote]${NC} $1"; }
error() { echo -e "${RED}[eCASVote]${NC} $1"; }

# ------------------------------------------------------------------
# 1. Check Docker
# ------------------------------------------------------------------
info "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
  error "Docker is not available (daemon not running or no permission). On Linux start the service (e.g. sudo systemctl start docker) and ensure your user is in the docker group."
  exit 1
fi
info "Docker is running."

# ------------------------------------------------------------------
# 2. Fabric Network
# ------------------------------------------------------------------
FABRIC_JUST_STARTED=false
if docker ps --format '{{.Names}}' | grep -q 'peer0.org1'; then
  info "Fabric network is already running."
else
  info "Starting Fabric network..."
  cd "$NETWORK_DIR"
  # Cryptogen material (no -ca); matches README Quick Start and typical Linux setups.
  ./network.sh up createChannel -c mychannel
  cd "$REPO_DIR"
  info "Fabric network started."
  FABRIC_JUST_STARTED=true
fi

# ------------------------------------------------------------------
# 3. Org3 Peer
# ------------------------------------------------------------------
if docker ps --format '{{.Names}}' | grep -q 'peer0.org3'; then
  info "Org3 peer is already running."
else
  info "Starting Org3 peer..."
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
    -v "$NETWORK_DIR/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/msp:/etc/hyperledger/fabric/msp" \
    -v "$NETWORK_DIR/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls:/etc/hyperledger/fabric/tls" \
    -p 11051:11051 \
    hyperledger/fabric-peer:2.5 2>/dev/null || warn "Org3 peer container may already exist. Run: docker start peer0.org3.example.com"
  info "Org3 peer started."
fi

# ------------------------------------------------------------------
# 3b. Chaincode as a service (CCaaS)
# ------------------------------------------------------------------
# After a fresh network bring-up, install/commit definition and start chaincode-ecasvote.
if [ "$FABRIC_JUST_STARTED" = true ] && [ -x "$NETWORK_DIR/ccaas-deploy.sh" ]; then
  info "Deploying chaincode (CCaaS)..."
  (cd "$NETWORK_DIR" && ./ccaas-deploy.sh) || warn "ccaas-deploy.sh failed — run manually: cd \"$NETWORK_DIR\" && ./ccaas-deploy.sh"
elif [ "$FABRIC_JUST_STARTED" = false ] && ! docker ps --format '{{.Names}}' | grep -q '^chaincode-ecasvote$'; then
  warn "CCaaS container 'chaincode-ecasvote' is not running. Gateway needs chaincode: cd \"$NETWORK_DIR\" && ./ccaas-deploy.sh"
fi

# ------------------------------------------------------------------
# 4. Install npm dependencies if missing
# ------------------------------------------------------------------
if [ ! -d "$GATEWAY_DIR/node_modules" ]; then
  info "Installing gateway-api dependencies..."
  cd "$GATEWAY_DIR" && npm install
  cd "$REPO_DIR"
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  info "Installing frontend dependencies..."
  cd "$FRONTEND_DIR" && npm install
  cd "$REPO_DIR"
fi

# ------------------------------------------------------------------
# 5. Gateway API
# ------------------------------------------------------------------
if lsof -i :4000 -sTCP:LISTEN > /dev/null 2>&1; then
  info "Gateway API is already running on port 4000."
else
  info "Starting Gateway API..."
  cd "$GATEWAY_DIR"
  npx prisma db push --accept-data-loss > /dev/null 2>&1 || true
  npm run dev > /tmp/ecasvote-gateway.log 2>&1 &
  GATEWAY_PID=$!
  cd "$REPO_DIR"

  # Wait for gateway to be ready (up to 30 seconds)
  info "Waiting for Gateway API on port 4000..."
  for i in $(seq 1 30); do
    if curl -s http://localhost:4000/health > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if curl -s http://localhost:4000/health > /dev/null 2>&1; then
    info "Gateway API is ready (PID: $GATEWAY_PID)."
  else
    warn "Gateway API may still be starting. Check /tmp/ecasvote-gateway.log"
  fi
fi

# ------------------------------------------------------------------
# 6. Seed default users
# ------------------------------------------------------------------
info "Seeding default users..."
curl -s -X POST http://localhost:4000/seed-users 2>/dev/null | head -c 200
echo ""

# ------------------------------------------------------------------
# 7. Frontend
# ------------------------------------------------------------------
if lsof -i :3000 -sTCP:LISTEN > /dev/null 2>&1; then
  info "Frontend is already running on port 3000."
else
  info "Starting Frontend..."
  cd "$FRONTEND_DIR"
  npm run dev > /tmp/ecasvote-frontend.log 2>&1 &
  FRONTEND_PID=$!
  cd "$REPO_DIR"
  info "Frontend starting (PID: $FRONTEND_PID). Logs: /tmp/ecasvote-frontend.log"
fi

# ------------------------------------------------------------------
# 8. OMR Worker (optional)
# ------------------------------------------------------------------
if lsof -i :8090 -sTCP:LISTEN > /dev/null 2>&1; then
  info "OMR worker is already running on port 8090."
elif [ -f "$OMR_DIR/app/main.py" ]; then
  if command -v uvicorn > /dev/null 2>&1; then
    info "Starting OMR worker..."
    cd "$OMR_DIR"
    uvicorn app.main:app --host 0.0.0.0 --port 8090 > /tmp/ecasvote-omr.log 2>&1 &
    cd "$REPO_DIR"
    info "OMR worker starting. Logs: /tmp/ecasvote-omr.log"
  elif docker images --format '{{.Repository}}' | grep -q 'omr-worker'; then
    info "Starting OMR worker via Docker..."
    docker run -d -p 8090:8090 --name omr-worker omr-worker 2>/dev/null || docker start omr-worker 2>/dev/null
    info "OMR worker started."
  else
    warn "OMR worker not available (no uvicorn or docker image). Paper ballot bubble detection will be unavailable."
  fi
else
  warn "OMR worker directory not found. Skipping."
fi

# ------------------------------------------------------------------
# 9. Verify all peer containers are running
# ------------------------------------------------------------------
echo ""
for PEER in peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com orderer.example.com; do
  if docker ps --format '{{.Names}}' | grep -q "$PEER"; then
    info "  $PEER is running"
  else
    warn "  WARNING: $PEER is NOT running!"
  fi
done

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------
echo ""
info "============================================"
info "  eCASVote is running"
info "============================================"
echo ""
info "  Frontend:     http://localhost:3000"
info "  Gateway API:  http://localhost:4000"
info "  Health check: http://localhost:4000/health"
info "  OMR Worker:   http://localhost:8090 (if available)"
echo ""
info "  Admin login:     admin@up.edu.ph / admin123"
info "  Validator login:  validator@up.edu.ph / validator123"
echo ""
info "  Logs:"
info "    Gateway:  /tmp/ecasvote-gateway.log"
info "    Frontend: /tmp/ecasvote-frontend.log"
echo ""
info "  To stop: ./stop.sh"
