# eCASVote Troubleshooting Guide

Common issues and solutions.

## Fabric Network

### Org3 Peer Not Starting

**Symptom**: `peer0.org3.example.com` container exits immediately or is not listed in `docker ps`.

**Solutions**:

1. Check if the crypto material exists:
   ```bash
   ls fabric-network-ecasvote/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/
   ```
   If missing, Org3 crypto was not generated. Re-run the network setup or generate Org3 crypto manually.

2. Check the Docker network exists:
   ```bash
   docker network ls | grep fabric_test
   ```
   The Org3 container must join the same Docker network as Org1/Org2.

3. Check for port conflicts:
   ```bash
   lsof -i :11051
   ```
   If port 11051 is in use, stop the conflicting process or change the Org3 port.

4. Check container logs:
   ```bash
   docker logs peer0.org3.example.com
   ```

### Gateway Cannot Connect to Fabric

**Symptom**: `ECONNREFUSED`, `UNAVAILABLE`, or `14 ABORTED` errors in gateway logs.

**Solutions**:

1. Verify peers are running:
   ```bash
   docker ps | grep peer
   ```

2. Check the gateway `.env` peer endpoints match running containers:
   ```
   PEER_ENDPOINT=localhost:7051
   ```

3. Verify TLS certificate paths exist:
   ```bash
   ls gateway-api/../fabric-network-ecasvote/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
   ```

4. If the network was restarted, crypto material may have changed. Delete `gateway-api/prisma/dev.db` and restart the gateway.

5. Check that the chaincode container is running:
   ```bash
   docker ps | grep ecasvote
   ```
   If no chaincode container exists, redeploy: `./deploy-chaincode.sh`

## Chaincode

### Endorsement Failures

**Symptom**: "endorsement failure", "chaincode response was not successful", or similar errors during `contract.submit()`.

**Solutions**:

1. **Missing org approval**: Ensure both Org1 and Org2 approved the chaincode with the same sequence:
   ```bash
   peer lifecycle chaincode checkcommitreadiness \
     --channelID mychannel --name ecasvote --version 1.0 --sequence <N>
   ```

2. **Sequence mismatch**: If you see "requested sequence is X but committed is Y", increment the sequence and re-approve/commit.

3. **Collections config mismatch**: Include `--collections-config` in both `approveformyorg` and `commit` commands.

4. **Chaincode crash**: Check the chaincode container logs:
   ```bash
   docker logs $(docker ps -q --filter "name=ecasvote") --tail 50
   ```

5. **Timeout**: Increase endorsement timeout in `fabricClient.ts`:
   ```typescript
   endorseOptions: () => ({ deadline: Date.now() + 30000 }), // 30 seconds
   ```

### PDC Private Data Not Available

**Symptom**: "private data matching public hash not found" or "collection pdcVoters not defined" errors.

**Solutions**:

1. Ensure `collections_config.json` was included in the chaincode commit:
   ```bash
   peer lifecycle chaincode querycommitted --channelID mychannel --name ecasvote
   ```
   The output should show `Collections: ...`

2. PDC data is only accessible to Org1. Verify the gateway is connecting as Org1:
   ```
   MSP_ID=Org1MSP
   ```

3. For `RegisterVoter` and `CastVoteEncrypted`, use Org1-only endorsement:
   ```typescript
   endorsingOrganizations: ['Org1MSP']
   ```

4. If `blockToLive` was changed, old data may have been purged. Default is 0 (never purge).

## OMR / Ballot Scanning

### OMR Not Detecting Bubbles

**Symptom**: Scanned ballot returns empty selections or incorrect candidates.

**Solutions**:

1. **Image quality**: Ensure scanned image is at least 300 DPI. Low-resolution images cause poor bubble detection.

2. **OMR worker not running**:
   ```bash
   curl http://localhost:8090/health
   ```
   If unavailable, start it:
   ```bash
   cd omr-worker && docker run -d -p 8090:8090 --name omr-worker omr-worker
   ```

3. **Ballot geometry not saved**: The OMR system needs measured bubble positions. Print a ballot first, then scan it. The geometry is saved on first successful scan.

4. **Ballot alignment**: The physical ballot must match the template. Reprinting with different margins or scaling will break detection.

5. **Image format**: Use PNG or JPEG. Other formats may not be supported.

### QR Code Not Detected

**Symptom**: "No ballot token detected" error.

**Solutions**:

1. Ensure the QR code is clearly visible and not obscured by folds or marks.
2. Try improving lighting and contrast in the scanned image.
3. The QR code contains only the ballot token (e.g., `{"e":"election-id","b":"TKN-ABC123","v":"ballot-template-v2"}`).

## Gateway API

### Port 4000 Already in Use

**Symptom**: `EADDRINUSE: address already in use :::4000`

**Solutions**:

1. Find and kill the existing process:
   ```bash
   lsof -i :4000
   kill <PID>
   ```

2. Or change the port in `gateway-api/.env`:
   ```
   PORT=4001
   ```
   Update `NEXT_PUBLIC_GATEWAY_URL=http://localhost:4001` in the frontend.

### Prisma Database Errors

**Symptom**: "table X has no column named Y" or similar schema errors.

**Solutions**:

1. Regenerate the Prisma client and push schema:
   ```bash
   cd gateway-api
   npx prisma db push --accept-data-loss
   npx prisma generate
   ```

2. If the database is corrupted, delete and recreate:
   ```bash
   rm gateway-api/prisma/dev.db
   npx prisma db push
   ```

3. After schema changes, always run:
   ```bash
   npx prisma generate
   ```

## Frontend

### Login Redirect Loop

**Symptom**: Logging in redirects back to the login page immediately.

**Solutions**:

1. Clear browser cookies and localStorage:
   - Open DevTools > Application > Cookies > delete `ecasvote_role`
   - Application > Local Storage > clear all entries

2. Ensure the gateway API is running and the login endpoint returns successfully:
   ```bash
   curl -X POST http://localhost:4000/login/admin \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@up.edu.ph","password":"admin123"}'
   ```

3. Check the browser console for CORS or network errors.

### Results/Candidates Not Showing

**Symptom**: "Not yet published" even though data exists.

**Solutions**:

1. Check if `candidatesPublished` or `resultsPublished` is set:
   ```bash
   curl http://localhost:4000/elections/<id>
   ```

2. Publish from the admin panel:
   - Candidates: Election Management > Edit > Publish Candidates
   - Results: Tally & Results > Summary > Publish Results

3. The election must be CLOSED before results can be published.

## Org3 Not Running After Restart

**Symptom**: Org3 peer is missing from `docker ps` after restarting the Fabric network.

Org3 does NOT start automatically with `./network.sh up`.

**Fix**:
```bash
docker start peer0.org3.example.com
```

**Verify**:
```bash
docker ps | grep org3
```

## Candidates Missing from UI After Restart

**Symptom**: Positions exist in the database but not on-chain. Adding candidates fails with "Position does not exist for election".

This happens when `AddPosition` calls fail silently during election creation (timing issue after `CreateElection`).

**Fix**: Use the `peer` CLI to re-add all 9 positions on-chain, then re-register candidates via the UI (election must be in DRAFT status) or via terminal `RegisterCandidate` invocations.

## Voter Roster Shows Wrong Count After Import

**Symptom**: More voters appear on the roster than were imported from the CSV.

**Cause**: The old code called `syncCasEligibleToElectionRoster` after every import, which added ALL CAS-eligible voters to the roster.

**Fix applied** in `voter-roster/page.tsx` and `server.ts` — import now passes `electionId` to the gateway which scopes the roster to only imported voters.

If the count is still wrong, clear the `ElectionVoter` table for that election and re-import:
```bash
cd gateway-api
npx prisma db execute --stdin <<EOF
DELETE FROM "ElectionVoter" WHERE "electionId" = 'YOUR-ELECTION-ID';
EOF
```

## Token Generation Skips Voters Who Voted in Other Elections

**Symptom**: `generate-all` skips voters even though they haven't voted in the current election.

**Cause**: The global `hasVoted` flag on the `Voter` table was blocking token generation for new elections.

**Fix applied** in `server.ts` `generate-all` endpoint — now checks `ElectionVoter.hasVoted` (per-election) instead of `Voter.hasVoted` (global).

## Multi-Candidate Position Vote Fails (e.g. CAS Councilor)

**Symptom**: Votes for positions with `maxVotes > 1` fail or record incorrectly.

**Cause**: Comma-separated `candidateIds` were sent as a single string to chaincode.

**Fix applied** in `/scanner/confirm-vote` — `flatMap` split ensures each `candidateId` becomes a separate `{ positionId, candidateId }` entry.

## Election Auto-Closes When Admin Opens Election Management Page

**Symptom**: Elections auto-close unexpectedly when navigating to the Election Management page.

**Cause**: Each election row called `fetchElection()` individually, triggering auto-close logic for every election on every page load.

**Fix applied** in `election-management/utils.ts` — removed per-election `fetchElection` calls from `loadElectionRows()`.

## AddPosition Fails After CreateElection

**Symptom**: `AddPosition` calls fail with "10 ABORTED: failed to collect enough transaction endorsements" immediately after creating an election.

**Cause**: Chaincode needs time to process the `CreateElection` transaction before it can accept `AddPosition` calls.

**Fix applied** in `POST /elections` in `server.ts` — 2000ms wait after `CreateElection` + up to 5 retries with 1000ms delay for each `AddPosition` call.

## Candidate Registration Fails with Endorsement Error

**Symptom**: `RegisterCandidate` fails with endorsement errors.

**Cause**: Positions not yet on-chain when candidates are being registered.

**Fix**: Verify positions on-chain first with a `GetElection` query, then register candidates. The election must be in DRAFT status. The gateway now retries `RegisterCandidate` up to 3 times with 500ms delay.

## WSL2-Specific Issues

### Slow Performance

- Always work from the Linux filesystem (`~/`), not `/mnt/c/`
- Docker volumes on `/mnt/c/` are extremely slow due to the 9P filesystem bridge

### Docker Not Working

```bash
# Check Docker is accessible
docker info

# If not, ensure Docker Desktop WSL2 integration is enabled:
# Docker Desktop > Settings > Resources > WSL Integration > Enable for your distro
```

### Node.js File Watching

If `npm run dev` does not detect file changes:
```bash
# Increase inotify watchers
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```
