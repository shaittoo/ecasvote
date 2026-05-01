#!/bin/bash
# eCASVote — Install Hyperledger Fabric binaries and Docker images
#
# WSL2 COMPATIBILITY NOTE:
# This script must be run from the WSL2 Linux filesystem, NOT /mnt/c/.
# Docker volume mounts will break if the repo is on the Windows filesystem.
# Recommended path: ~/go/src/github.com/shaittoo/
#
# Usage: ./install-fabric.sh (from the repo root)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[eCASVote]${NC} $1"; }
warn()  { echo -e "${YELLOW}[eCASVote]${NC} $1"; }
error() { echo -e "${RED}[eCASVote]${NC} $1"; }

INSTALL_DIR="$HOME/go/src/github.com/shaittoo"
FABRIC_SAMPLES_DIR="$INSTALL_DIR/fabric-samples"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$REPO_DIR/fabric-network-ecasvote"

# ------------------------------------------------------------------
# 1. Check prerequisites
# ------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  error "Docker is not installed. Install Docker Desktop with WSL2 backend first."
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  error "Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

if ! command -v go &> /dev/null; then
  error "Go is not installed. Install Go 1.21+: sudo snap install go --classic"
  exit 1
fi

if ! command -v node &> /dev/null; then
  error "Node.js is not installed. Install Node.js 18+."
  exit 1
fi

info "All prerequisites met."

# ------------------------------------------------------------------
# 2. Install Fabric binaries and Docker images
# ------------------------------------------------------------------
info "Installing Hyperledger Fabric 2.5 binaries and Docker images..."
info "Install directory: $INSTALL_DIR"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [ -d "$FABRIC_SAMPLES_DIR/bin" ] && [ -f "$FABRIC_SAMPLES_DIR/bin/peer" ]; then
  info "Fabric binaries already exist at $FABRIC_SAMPLES_DIR/bin"
  info "To reinstall, remove $FABRIC_SAMPLES_DIR and re-run this script."
else
  curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
  chmod +x install-fabric.sh
  ./install-fabric.sh --fabric-version 2.5.0 binary docker
  rm -f install-fabric.sh
  info "Fabric binaries installed to $FABRIC_SAMPLES_DIR/bin"
fi

# ------------------------------------------------------------------
# 3. Add binaries to PATH
# ------------------------------------------------------------------
info "Fabric binary path: $FABRIC_SAMPLES_DIR/bin"
export PATH="$FABRIC_SAMPLES_DIR/bin:$PATH"

if ! grep -q 'fabric-samples/bin' "$HOME/.bashrc" 2>/dev/null; then
  echo "export PATH=\$PATH:\$HOME/go/src/github.com/shaittoo/fabric-samples/bin" >> "$HOME/.bashrc"
  info "Added fabric-samples/bin to ~/.bashrc"
fi

# ------------------------------------------------------------------
# 4. Start Fabric network
# ------------------------------------------------------------------
cd "$NETWORK_DIR"
info "Starting Fabric network..."
./network.sh up createChannel -c mychannel -ca
info "Fabric network started."

# ------------------------------------------------------------------
# 5. Start Org3 manually
# ------------------------------------------------------------------
info "Starting Org3 peer (not included in network.sh)..."
if docker ps --format '{{.Names}}' | grep -q 'peer0.org3'; then
  info "Org3 peer is already running."
else
  docker start peer0.org3.example.com 2>/dev/null || \
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
    hyperledger/fabric-peer:2.5
  info "Org3 peer started."
fi

# ------------------------------------------------------------------
# 6. Verify all containers are running
# ------------------------------------------------------------------
echo ""
info "Verifying all Fabric containers..."
ALL_OK=true
for CONTAINER in peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com orderer.example.com; do
  if docker ps --format '{{.Names}}' | grep -q "$CONTAINER"; then
    info "  $CONTAINER is running"
  else
    warn "  WARNING: $CONTAINER is NOT running!"
    ALL_OK=false
  fi
done

if [ "$ALL_OK" = true ]; then
  echo ""
  info "All Fabric containers are running."
else
  echo ""
  warn "Some containers are not running. Check 'docker ps' and 'docker logs <container>'."
fi

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------
echo ""
info "============================================"
info "  Fabric installation complete"
info "============================================"
echo ""
info "  Next steps:"
info "    1. Deploy chaincode:  cd chaincode-ecasvote && ./deploy-chaincode.sh"
info "    2. Start gateway:     cd gateway-api && npm install && npm run dev"
info "    3. Start frontend:    cd frontend-ecasvote && npm install && npm run dev"
info "    4. Or use:            ./start.sh"
echo ""
