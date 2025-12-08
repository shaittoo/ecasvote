# Chaincode Deployment Guide

This guide explains how to rebuild and redeploy the eCASVote chaincode to your Hyperledger Fabric network.

## Prerequisites

- Hyperledger Fabric test-network is running
- Chaincode name: `ecasvote`
- Channel name: `mychannel`
- Network path: `/home/shaina/go/src/github.com/shaittoo/fabric-samples/test-network`

## Step 1: Build the Chaincode

First, compile the TypeScript chaincode to JavaScript:

```bash
cd /home/shaina/dev/eCASVote/chaincode-ecasvote
npm run build
```

This will compile the TypeScript files in `src/` to JavaScript in `dist/`.

## Step 2: Package the Chaincode

Package the chaincode for deployment:

```bash
npm run package
```

This creates `npm-shrinkwrap.json` which is needed for deterministic packaging.

## Step 3: Set Environment Variables

Set the Fabric network environment variables:

```bash
export FABRIC_CFG_PATH=/home/shaina/go/src/github.com/shaittoo/fabric-samples/test-network/../config
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/

# Navigate to test-network directory
cd /home/shaina/go/src/github.com/shaittoo/fabric-samples/test-network
```

## Step 4: Package Chaincode for Fabric

Create a chaincode package using the peer CLI:

```bash
# Set peer environment for Org1
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Package the chaincode
peer lifecycle chaincode package ecasvote.tar.gz \
  --path /home/shaina/dev/eCASVote/chaincode-ecasvote \
  --lang node \
  --label ecasvote_1.0
```

## Step 5: Install Chaincode on Peers

Install the chaincode on Org1 peer:

```bash
peer lifecycle chaincode install ecasvote.tar.gz
```

**Note:** If you have multiple organizations, install on all peers. For Org2:

```bash
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install ecasvote.tar.gz
```

## Step 6: Get Package ID

Get the package ID from the installation output, or query it:

```bash
# For Org1
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode queryinstalled
```

Save the package ID (it will look like `ecasvote_1.0:abc123...`).

## Step 7: Approve Chaincode Definition

Approve the chaincode definition for your organization:

```bash
# Set package ID (replace with actual ID from step 6)
PACKAGE_ID="ecasvote_1.0:YOUR_PACKAGE_ID_HERE"

# Approve for Org1
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name ecasvote \
  --version 1.0 \
  --package-id $PACKAGE_ID \
  --sequence 1 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --signature-policy "OR('Org1MSP.peer')"
```

**Note:** For single-org testing, use `--signature-policy "OR('Org1MSP.peer')"`. For multi-org, use `--signature-policy "AND('Org1MSP.peer','Org2MSP.peer')"`.

If you have Org2, approve for Org2 as well:

```bash
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name ecasvote \
  --version 1.0 \
  --package-id $PACKAGE_ID \
  --sequence 1 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
```

## Step 8: Check Commit Readiness

Check if the chaincode is ready to be committed:

```bash
peer lifecycle chaincode checkcommitreadiness \
  --channelID mychannel \
  --name ecasvote \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --output json
```

## Step 9: Commit Chaincode Definition

Commit the chaincode definition to the channel:

```bash
# For single-org
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name ecasvote \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --signature-policy "OR('Org1MSP.peer')"

# For multi-org (add Org2 peer)
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name ecasvote \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
```

## Step 10: Query Committed Chaincode

Verify the chaincode is committed:

```bash
peer lifecycle chaincode querycommitted \
  --channelID mychannel \
  --name ecasvote \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
```

## Step 11: Initialize the Ledger

After deployment, initialize the ledger with the new positions and candidates:

```bash
curl -X POST http://localhost:4000/init
```

Or if your gateway-api is running on a different port, adjust accordingly.

## Quick Deployment Script

For convenience, here's a quick script you can save and run:

```bash
#!/bin/bash
# deploy-chaincode.sh

set -e

CHAINCODE_DIR="/home/shaina/dev/eCASVote/chaincode-ecasvote"
NETWORK_DIR="/home/shaina/go/src/github.com/shaittoo/fabric-samples/test-network"
CHAINCODE_NAME="ecasvote"
CHANNEL_NAME="mychannel"
VERSION="1.0"
SEQUENCE="1"

echo "🔨 Building chaincode..."
cd $CHAINCODE_DIR
npm run build
npm run package

echo "📦 Packaging chaincode for Fabric..."
cd $NETWORK_DIR
export FABRIC_CFG_PATH=${PWD}/../config

# Set Org1 environment
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Package
peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz \
  --path $CHAINCODE_DIR \
  --lang node \
  --label ${CHAINCODE_NAME}_${VERSION}

echo "📥 Installing chaincode..."
peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

echo "📋 Getting package ID..."
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep -oP "${CHAINCODE_NAME}_${VERSION}:\K[a-f0-9]+" | head -1)
echo "Package ID: $PACKAGE_ID"

echo "✅ Approving chaincode definition..."
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID $CHANNEL_NAME \
  --name $CHAINCODE_NAME \
  --version $VERSION \
  --package-id ${CHAINCODE_NAME}_${VERSION}:$PACKAGE_ID \
  --sequence $SEQUENCE \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --signature-policy "OR('Org1MSP.peer')"

echo "🚀 Committing chaincode..."
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID $CHANNEL_NAME \
  --name $CHAINCODE_NAME \
  --version $VERSION \
  --sequence $SEQUENCE \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --signature-policy "OR('Org1MSP.peer')"

echo "✅ Chaincode deployed successfully!"
echo "🔄 Initializing ledger..."
curl -X POST http://localhost:4000/init

echo "✨ Done!"
```

## Troubleshooting

### Error: "chaincode definition for 'ecasvote' exists, but chaincode is not installed"
- Solution: Make sure you've installed the chaincode on all peers before approving.

### Error: "endorsement policy failure"
- Solution: Check your signature policy matches your network setup. For single-org testing, use `"OR('Org1MSP.peer')"`.

### Error: "package ID mismatch"
- Solution: Make sure you're using the correct package ID from `peer lifecycle chaincode queryinstalled`.

### To Upgrade Chaincode
If you need to upgrade an existing chaincode:
1. Follow steps 1-6 above
2. In step 7, increment the `--sequence` number (e.g., from 1 to 2)
3. You can keep the same version or increment it

## Notes

- The chaincode is deployed to the `mychannel` channel
- The chaincode name is `ecasvote`
- After deployment, call `/init` endpoint to initialize the ledger with positions and candidates
- Make sure your Fabric test-network is running before deploying

