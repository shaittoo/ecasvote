#!/bin/bash
# eCASVote — Stop local dev processes and Fabric-related containers
#
# Does not run network.sh down (volumes / crypto are preserved).
# Production on Debian: use docker compose down in this repo and your Fabric/CCaaS
# lifecycle — see DEPLOY.md.
#
# Usage: ./stop.sh (from the repo root)

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[eCASVote]${NC} $1"; }
warn() { echo -e "${YELLOW}[eCASVote]${NC} $1"; }

# ------------------------------------------------------------------
# 1. Stop Gateway API (port 4000)
# ------------------------------------------------------------------
GATEWAY_PID=$(lsof -ti :4000 -sTCP:LISTEN 2>/dev/null)
if [ -n "$GATEWAY_PID" ]; then
  info "Stopping Gateway API (PID: $GATEWAY_PID)..."
  kill $GATEWAY_PID 2>/dev/null
  info "Gateway API stopped."
else
  info "Gateway API is not running."
fi

# ------------------------------------------------------------------
# 2. Stop Frontend (port 3000)
# ------------------------------------------------------------------
FRONTEND_PID=$(lsof -ti :3000 -sTCP:LISTEN 2>/dev/null)
if [ -n "$FRONTEND_PID" ]; then
  info "Stopping Frontend (PID: $FRONTEND_PID)..."
  kill $FRONTEND_PID 2>/dev/null
  info "Frontend stopped."
else
  info "Frontend is not running."
fi

# ------------------------------------------------------------------
# 3. Stop OMR Worker (port 8090)
# ------------------------------------------------------------------
OMR_PID=$(lsof -ti :8090 -sTCP:LISTEN 2>/dev/null)
if [ -n "$OMR_PID" ]; then
  info "Stopping OMR worker (PID: $OMR_PID)..."
  kill $OMR_PID 2>/dev/null
  info "OMR worker stopped."
else
  # Try stopping Docker container
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'omr-worker'; then
    info "Stopping OMR worker Docker container..."
    docker stop omr-worker 2>/dev/null
    info "OMR worker container stopped."
  else
    info "OMR worker is not running."
  fi
fi

# ------------------------------------------------------------------
# 3b. Stop CCaaS chaincode container (fabric-network-ecasvote compose)
# ------------------------------------------------------------------
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^chaincode-ecasvote$'; then
  info "Stopping chaincode-ecasvote (CCaaS)..."
  docker stop chaincode-ecasvote 2>/dev/null
  info "CCaaS chaincode container stopped."
fi

# ------------------------------------------------------------------
# 4. Stop Fabric Network Containers
# ------------------------------------------------------------------
FABRIC_CONTAINERS="peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com orderer.example.com"
STOPPED_ANY=false

for CONTAINER in $FABRIC_CONTAINERS; do
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$CONTAINER"; then
    info "Stopping $CONTAINER..."
    docker stop "$CONTAINER" 2>/dev/null
    STOPPED_ANY=true
  fi
done

# Also stop CA containers
for CA in $(docker ps --format '{{.Names}}' 2>/dev/null | grep 'ca[._]'); do
  info "Stopping $CA..."
  docker stop "$CA" 2>/dev/null
  STOPPED_ANY=true
done

if [ "$STOPPED_ANY" = false ]; then
  info "Fabric network is not running."
else
  info "Fabric containers stopped."
fi

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------
echo ""
info "All eCASVote services stopped."
