# Connecting gateway-api and frontend to the 3-org Fabric network

After chaincode is committed on `mychannel` with Org1, Org2, Org3 (test-network-ecasvote), use this to run the gateway API and frontend together.

## 1. Fabric network (test-network-ecasvote)

Ensure the 3-org network is up:

```bash
cd ~/go/src/github.com/shaittoo/fabric-samples/test-network-ecasvote
# Bring up network (if not already)
./network.sh up createChannel -c mychannel
# ... join channel, install/approve/commit chaincode as per your deploy steps
```

## 2. Gateway API (connects to Fabric as Org1/SEB)

The gateway uses **Org1** identity and talks to **peer0.org1** (localhost:7051). Default paths in code point to `test-network-ecasvote`.

```bash
cd /home/shaina/dev/eCASVote/gateway-api

# Optional: copy and edit .env (see .env.example for Fabric vars)
# cp .env.example .env

# Install deps and run
npm install
npm run dev
```

API will listen on **http://localhost:4000**.  
If your Fabric network lives elsewhere, set in `.env`:

- `CRYPTO_PATH` – path to `.../peerOrganizations/org1.example.com`
- `PEER_ENDPOINT` – e.g. `localhost:7051`
- `CHANNEL_NAME` – `mychannel`
- `CHAINCODE_NAME` – `ecasvote`

## 3. Frontend (calls gateway API)

```bash
cd /home/shaina/dev/eCASVote/frontend-ecasvote

# Ensure API URL points to gateway (default is http://localhost:4000)
# .env.local: NEXT_PUBLIC_ECASVOTE_API_URL=http://localhost:4000
# or NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000

npm install
npm run dev
```

Frontend will run (e.g. http://localhost:3000) and use the gateway at **http://localhost:4000**.

## Summary

| Component    | Role                          | URL / endpoint              |
|-------------|--------------------------------|-----------------------------|
| Fabric      | test-network-ecasvote (Org1–3) | peers 7051, 9051, 11051     |
| Gateway API | Org1 identity → Fabric         | http://localhost:4000       |
| Frontend    | UI → Gateway API               | NEXT_PUBLIC_GATEWAY_URL → 4000 |

Run Fabric first, then gateway-api, then frontend. Use the same `CRYPTO_PATH` / Org1 paths as your test-network-ecasvote so the gateway can submit and evaluate chaincode (including SEB-only and multi-org endorsement).
