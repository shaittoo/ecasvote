#!/bin/bash
# deploy-chaincode.sh — legacy in-docker chaincode path (not CCaaS).
# Prefer fabric-network-ecasvote/ccaas-deploy.sh for production on kernel 6.12+.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# This script lives in .../ecasvote/chaincode-ecasvote/
CHAINCODE_DIR="${CHAINCODE_DIR:-$SCRIPT_DIR}"
# Default: fabric-network-ecasvote as sibling of ecasvote (override with FABRIC_NETWORK_HOME)
_DEFAULT_NETWORK="$(cd "${SCRIPT_DIR}/../.." && pwd)/fabric-network-ecasvote"
NETWORK_DIR="${FABRIC_NETWORK_HOME:-$_DEFAULT_NETWORK}"

CHAINCODE_NAME="ecasvote"
CHANNEL_NAME="mychannel"
VERSION="1.0"
SEQUENCE="1"

if [ ! -d "$NETWORK_DIR" ]; then
  echo "❌ Fabric network directory not found: $NETWORK_DIR"
  echo "   Set FABRIC_NETWORK_HOME to your fabric-network-ecasvote clone."
  exit 1
fi

if [ ! -d "$NETWORK_DIR/bin" ]; then
  echo "❌ Missing Fabric binaries under $NETWORK_DIR/bin"
  exit 1
fi

echo "🔨 Step 1: Building chaincode..."
cd "$CHAINCODE_DIR"
npm run build
npm run package

echo ""
echo "📦 Step 2: Packaging chaincode for Fabric..."
cd "$NETWORK_DIR"

export PATH="${NETWORK_DIR}/bin:${PATH}"
export FABRIC_CFG_PATH="${NETWORK_DIR}/config"

# Helper functions to switch org context
setGlobalsForOrg1() {
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID="Org1MSP"
  export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
  export CORE_PEER_ADDRESS=localhost:7051
}

setGlobalsForOrg2() {
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID="Org2MSP"
  export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
  export CORE_PEER_ADDRESS=localhost:9051
}

# Ensure orderer TLS CA path exists (handles the missing file error you saw)
if [ ! -f "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlsca.example.com-cert.pem" ]; then
  mkdir -p "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp"
  cp "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
     "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlsca.example.com-cert.pem"
fi

# ------------------------------------------------------------------------------
# Step 2.5: Package chaincode
# ------------------------------------------------------------------------------
setGlobalsForOrg1

peer lifecycle chaincode package "${CHAINCODE_NAME}.tar.gz" \
  --path "$CHAINCODE_DIR" \
  --lang node \
  --label "${CHAINCODE_NAME}_${VERSION}"

echo ""
echo "📥 Step 3: Installing chaincode on peer0.org1..."
INSTALL_OUTPUT_ORG1=$(peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz" 2>&1) || {
  if echo "$INSTALL_OUTPUT_ORG1" | grep -q "already successfully installed"; then
    echo "   ℹ️  Package already installed on Org1, continuing..."
  else
    echo "   ❌ Installation failed:"
    echo "$INSTALL_OUTPUT_ORG1"
    exit 1
  fi
}

echo ""
echo "📥 Step 3b: Installing chaincode on peer0.org2..."
setGlobalsForOrg2
INSTALL_OUTPUT_ORG2=$(peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz" 2>&1) || {
  if echo "$INSTALL_OUTPUT_ORG2" | grep -q "already successfully installed"; then
    echo "   ℹ️  Package already installed on Org2, continuing..."
  else
    echo "   ❌ Installation failed:"
    echo "$INSTALL_OUTPUT_ORG2"
    exit 1
  fi
}

# Back to Org1 for querying
setGlobalsForOrg1

echo ""
echo "📋 Step 4: Getting package ID..."
# Try to extract package ID from install output first (if installation succeeded)
if echo "$INSTALL_OUTPUT_ORG1" | grep -q "Chaincode code package identifier"; then
  PACKAGE_ID=$(echo "$INSTALL_OUTPUT_ORG1" | grep -oP "${CHAINCODE_NAME}_${VERSION}:\K[a-f0-9]{64}" | tail -1)
fi

# If not found, query installed chaincodes
if [ -z "$PACKAGE_ID" ]; then
  INSTALL_OUTPUT=$(peer lifecycle chaincode queryinstalled)
  # Get the most recent package ID (last one in the list)
  PACKAGE_ID=$(echo "$INSTALL_OUTPUT" | grep -oP "${CHAINCODE_NAME}_${VERSION}:\K[a-f0-9]{64}" | tail -1)
fi

if [ -z "$PACKAGE_ID" ]; then
  echo "❌ Error: Could not extract package ID. Full output:"
  echo "$INSTALL_OUTPUT"
  exit 1
fi

echo "   Package ID: ${CHAINCODE_NAME}_${VERSION}:$PACKAGE_ID"

echo ""
echo "🔍 Step 5: Checking current chaincode sequence..."
QUERY_OUTPUT=$(peer lifecycle chaincode querycommitted \
  --channelID "$CHANNEL_NAME" \
  --name "$CHAINCODE_NAME" \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" 2>&1)
QUERY_EXIT_CODE=$?

IS_UPGRADE=false
if [ $QUERY_EXIT_CODE -eq 0 ] && echo "$QUERY_OUTPUT" | grep -qi "sequence"; then
  # Try to extract sequence from various output formats
  CURRENT_SEQUENCE=$(echo "$QUERY_OUTPUT" | grep -oP "(?i)sequence[:\s]+\K[0-9]+" | head -1)
  if [ -z "$CURRENT_SEQUENCE" ]; then
    # Try JSON format
    CURRENT_SEQUENCE=$(echo "$QUERY_OUTPUT" | grep -oP '"sequence"\s*:\s*\K[0-9]+' | head -1)
  fi
  if [ -n "$CURRENT_SEQUENCE" ]; then
    SEQUENCE=$((CURRENT_SEQUENCE + 1))
    IS_UPGRADE=true
    echo "   Current sequence: $CURRENT_SEQUENCE"
    echo "   Using new sequence: $SEQUENCE (upgrade)"
  else
    echo "   Could not parse sequence, using provided sequence: $SEQUENCE"
    if [ "$SEQUENCE" -gt 1 ]; then
      IS_UPGRADE=true
      echo "   Treating as upgrade based on sequence number"
    fi
  fi
elif [ "$SEQUENCE" -gt 1 ]; then
  IS_UPGRADE=true
  echo "   Query failed, but sequence $SEQUENCE suggests upgrade"
else
  echo "   No existing chaincode found, using sequence: $SEQUENCE (new deployment)"
fi

echo ""
echo "✅ Step 6: Approving chaincode definition for both orgs..."

# ---------------------- Org1 approve ----------------------
setGlobalsForOrg1

if [ "$IS_UPGRADE" = true ] || [ "$SEQUENCE" -gt 1 ]; then
  echo "   [Org1] Upgrading existing chaincode (keeping existing endorsement policy)..."
  peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$VERSION" \
    --package-id "${CHAINCODE_NAME}_${VERSION}:$PACKAGE_ID" \
    --sequence "$SEQUENCE" \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
else
  echo "   [Org1] Approving new chaincode definition..."
  peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$VERSION" \
    --package-id "${CHAINCODE_NAME}_${VERSION}:$PACKAGE_ID" \
    --sequence "$SEQUENCE" \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
fi

# ---------------------- Org2 approve ----------------------
setGlobalsForOrg2

if [ "$IS_UPGRADE" = true ] || [ "$SEQUENCE" -gt 1 ]; then
  echo "   [Org2] Upgrading existing chaincode (keeping existing endorsement policy)..."
  peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$VERSION" \
    --package-id "${CHAINCODE_NAME}_${VERSION}:$PACKAGE_ID" \
    --sequence "$SEQUENCE" \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
else
  echo "   [Org2] Approving new chaincode definition..."
  peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$VERSION" \
    --package-id "${CHAINCODE_NAME}_${VERSION}:$PACKAGE_ID" \
    --sequence "$SEQUENCE" \
    --tls \
    --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
fi

echo ""
echo "🚀 Step 7: Committing chaincode to channel (both peers)..."

# Commit from Org1 admin, but include both peers
setGlobalsForOrg1

peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID "$CHANNEL_NAME" \
  --name "$CHAINCODE_NAME" \
  --version "$VERSION" \
  --sequence "$SEQUENCE" \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

echo ""
echo "✅ Chaincode deployed successfully!"
echo ""
echo "🔄 Step 8: Initializing ledger with new positions and candidates..."
sleep 2
GATEWAY_URL="${GATEWAY_URL:-http://localhost:4000}"
curl -sf -X POST "${GATEWAY_URL}/init" >/dev/null \
  || echo "⚠️  Warning: Could not POST ${GATEWAY_URL}/init — ensure gateway-api is running."

echo ""
echo "✨ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Seed DB if needed: cd gateway-api && npx prisma migrate deploy && npm run seed (if defined)"
echo "   2. Prefer CCaaS on Debian 13: fabric-network-ecasvote/ccaas-deploy.sh"
