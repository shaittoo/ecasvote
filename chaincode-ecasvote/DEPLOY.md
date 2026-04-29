# Chaincode Deployment Guide

How to build and deploy the eCASVote chaincode to the Hyperledger Fabric network.

## Prerequisites

- Fabric network running (`./network.sh up createChannel -c mychannel -ca`)
- Fabric binaries (`peer`, `orderer`) in PATH
- Node.js 18+ installed
- Gateway API running on port 4000 (for the init step)

## Paths

```bash
CHAINCODE_DIR=~/go/src/github.com/shaittoo/ecasvote/chaincode-ecasvote
NETWORK_DIR=~/go/src/github.com/shaittoo/ecasvote/fabric-network-ecasvote
```

## Quick Deploy (Script)

```bash
cd chaincode-ecasvote
npm install
npm run build
npm run package      # Creates npm-shrinkwrap.json
./deploy-chaincode.sh
```

The script auto-detects the current sequence number and increments it for upgrades.

## Manual Deployment Steps

### 1. Build Chaincode

```bash
cd $CHAINCODE_DIR
npm install
npm run build        # Compiles TypeScript to dist/
npm run package      # Generates npm-shrinkwrap.json for reproducible installs
```

### 2. Set Environment

```bash
cd $NETWORK_DIR
export PATH="${PWD}/../bin:$PATH"
export FABRIC_CFG_PATH="${PWD}/../config"
```

### 3. Package Chaincode

```bash
# As Org1
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode package ecasvote.tar.gz \
  --path $CHAINCODE_DIR \
  --lang node \
  --label ecasvote_1.0
```

### 4. Install on Peers

```bash
# Install on Org1
peer lifecycle chaincode install ecasvote.tar.gz

# Switch to Org2
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install ecasvote.tar.gz
```

### 5. Get Package ID

```bash
peer lifecycle chaincode queryinstalled
# Output: ecasvote_1.0:abc123...
# Copy the full package ID
```

### 6. Check Current Sequence

```bash
peer lifecycle chaincode querycommitted \
  --channelID mychannel \
  --name ecasvote \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
```

If upgrading, use `SEQUENCE = current + 1`. For first deployment, use `SEQUENCE=1`.

### 7. Approve for Both Orgs

```bash
PACKAGE_ID="ecasvote_1.0:<hash>"
SEQUENCE=5   # Current sequence + 1

# Approve as Org1
# (set Org1 env vars as in step 3)
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name ecasvote \
  --version 1.0 \
  --package-id $PACKAGE_ID \
  --sequence $SEQUENCE \
  --collections-config $CHAINCODE_DIR/collections_config.json \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

# Approve as Org2
# (set Org2 env vars as in step 4)
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name ecasvote \
  --version 1.0 \
  --package-id $PACKAGE_ID \
  --sequence $SEQUENCE \
  --collections-config $CHAINCODE_DIR/collections_config.json \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
```

### 8. Commit to Channel

Include all peer addresses for endorsement:

```bash
# As Org1
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name ecasvote \
  --version 1.0 \
  --sequence $SEQUENCE \
  --collections-config $CHAINCODE_DIR/collections_config.json \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  --peerAddresses localhost:11051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt"
```

### 9. Initialize Ledger

```bash
curl -X POST http://localhost:4000/init
```

## Collections Config

The file `collections_config.json` defines two private data collections:

- **pdcVoters** -- voter registration (Org1 only)
- **pdcBallots** -- encrypted ballot envelopes (Org1 only)

Both use `OR('Org1MSP.member')` policy with `memberOnlyRead` and `memberOnlyWrite` enabled.

## Verify Deployment

```bash
# Check committed chaincode
peer lifecycle chaincode querycommitted --channelID mychannel --name ecasvote

# Check gateway health
curl http://localhost:4000/health
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "chaincode already successfully installed" | Safe to ignore, script continues |
| "requested sequence is N but committed is N" | Increment SEQUENCE |
| "endorsement policy not satisfied" | Ensure both orgs approved with same sequence |
| "collection config mismatch" | Include `--collections-config` in approve and commit |
