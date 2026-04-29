#!/bin/bash
# eCASVote — Stop all services
#
# Usage: ./stop.sh (from the repo root)

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$REPO_DIR/fabric-network-ecasvote"

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
# 4. Stop Fabric Network
# ------------------------------------------------------------------
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'peer0.org1'; then
  info "Stopping Fabric network..."

  # Stop Org3 peer first (not managed by network.sh)
  if docker ps --format '{{.Names}}' | grep -q 'peer0.org3'; then
    docker stop peer0.org3.example.com 2>/dev/null
    docker rm peer0.org3.example.com 2>/dev/null
    info "Org3 peer stopped and removed."
  fi

  cd "$NETWORK_DIR"
  ./network.sh down
  cd "$REPO_DIR"
  info "Fabric network stopped."
else
  info "Fabric network is not running."
fi

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------
echo ""
info "All eCASVote services stopped."
