# eCASVote Defense Demo Guide

Step-by-step script for demonstrating the system during the thesis defense.

## Pre-Demo Checklist

- [ ] Fabric network running (`docker ps` shows peer0.org1, peer0.org2, orderer)
- [ ] Gateway API running on port 4000 (`npm run dev` in gateway-api/)
- [ ] Frontend running on port 3000 (`npm run dev` in frontend-ecasvote/)
- [ ] OMR worker running on port 8090 (optional, for paper ballot demo)
- [ ] Default users seeded (`curl -X POST http://localhost:4000/seed-users`)
- [ ] Voter roster imported (CSV with test students)
- [ ] Browser open at http://localhost:3000

## Demo Script

### 1. System Architecture Overview

**Show**: The landing page at http://localhost:3000

**Explain**:
- Three-tier architecture: Frontend (Next.js) -> Gateway API (Express) -> Hyperledger Fabric
- Three organizations: Org1 (SEB), Org2 (Department), Org3 (PMB)
- Multi-org endorsement ensures no single party can manipulate votes
- Private Data Collections protect voter identity

**Terminal check** (optional):
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "peer|orderer"
```

### 2. Admin Login and Election Creation

**Steps**:
1. Click "Admin / Validator Login" on landing page
2. Log in with: `admin@up.edu.ph` / `admin123`
3. Navigate to Election Management
4. Click "Create New Election"
5. Fill in: Name, Academic Year, Semester, Start/End dates
6. Click Create

**Show**: The election appears in the list with "DRAFT" status. Default CAS SC positions (USC Councilor, CAS Chairperson, etc.) are automatically created and registered on the blockchain.

### 3. Candidate Management

**Steps**:
1. Click on the election to edit it
2. In the Candidate Management panel, click "Add New Candidate"
3. Add candidates with position, name, party, program, year level
4. Click "Add Candidates" to save
5. Click "Publish Candidates" to make them visible to the public

**Show**: Candidates are saved to the database and registered on the blockchain (DRAFT elections only). After publishing, the public landing page shows "View Candidates" as active.

### 4. Voter Roster Import

**Steps**:
1. Navigate to Voter Management > Voter Roster
2. Select the election from the dropdown
3. Click "Import roster" and upload the CSV file
4. Show the imported voters in the roster list

**Explain**: Voters are imported into the global registry and automatically synced to the selected election's roster via `ElectionVoter` records.

### 5. Paper Ballot Printing

**Steps**:
1. Navigate to Ballot Print
2. Select the election
3. Show the printable ballot with QR code and bubble grid
4. Print a sample ballot

**Explain**: Each ballot has a unique QR code containing the ballot token (not vote data). The QR identifies the ballot; selections are detected from the filled bubbles.

### 6. Ballot Scanning (OMR)

**Steps**:
1. Navigate to Ballot Scanning
2. Select the election
3. Upload a scanned ballot image (or use the camera)
4. Show the OMR detection results:
   - QR code decoded (ballot token)
   - Bubble detection (selected candidates per position)
5. Show the review modal with only selected candidates visible

**Explain**: The OMR worker (OpenCV/FastAPI) detects filled bubbles. The review modal shows only selected candidates to preserve ballot secrecy during the scanning process.

### 7. Vote Submission

**Steps**:
1. In the review modal, click "Confirm & Submit Vote"
2. Show the success toast

**Explain what happens behind the scenes**:
1. Ballot token validated against `PaperBallotIssuance` table
2. Token marked as used (prevents double voting)
3. `RegisterVoter` called on chaincode (Org1 PDC)
4. `CastVoteEncrypted` called on chaincode (Org1 PDC + public tally update)
5. Anonymized `Vote` records created in database (no voter linkage)
6. Audit log entry created

**If blockchain fails**: Database changes are rolled back. The token is unmarked. The voter can retry.

### 8. Blockchain Tally

**Steps**:
1. Navigate to Tally & Results > Results Summary
2. Select the election
3. Show the results charts and tables

**Explain**: Results are fetched directly from the blockchain via `GetElectionResults`. The charts show per-position vote counts with winner badges.

### 9. Integrity Check

**Steps**:
1. Navigate to Tally & Results > Integrity Check
2. Select the election
3. Show the comparison table:
   - "Stored in Blockchain" column
   - "Stored in Prisma" column
   - "Match" status for each candidate
4. Show "All Matches" badge (green)

**Explain**: The system compares on-chain tallies with off-chain database records in real time. Any discrepancy would be flagged immediately.

### 10. Tamper Detection (Mismatch Scenario)

**Steps**:
1. Open Prisma Studio or SQLite browser
2. Manually modify a vote count in the database:
   ```bash
   cd gateway-api
   npx prisma studio
   ```
3. Delete one Vote record for a candidate
4. Return to Integrity Check and click "Refresh"
5. Show the red "Mismatch Detected" badge
6. Show the comparison table highlighting the discrepancy

**Explain**: The blockchain record is immutable. Any modification to the database is immediately detectable. The blockchain is the source of truth.

### 11. Override (Sync DB to Blockchain)

**Steps**:
1. In the mismatch warning card, click "Override: Sync DB to Blockchain"
2. The confirmation modal appears
3. Click "Sync to Blockchain"
4. Show the integrity check refreshes to "All Matches"

**Explain**: The override deletes all database vote records and recreates them from the blockchain tally. This restores database integrity. Only admins can perform this action.

### 12. Publish Results

**Steps**:
1. Close the election (if not auto-closed):
   - Navigate to Election Management > Edit
   - Or wait for the end time to pass
2. Navigate to Results Summary
3. Show the "Results are ready" banner
4. Click "Publish Results"
5. Confirm the publish dialog

**Show**: After publishing, the landing page shows "View Results" as active.

### 13. Public and Validator Views

**Student/Public View**:
1. Open http://localhost:3000 in a new browser/incognito
2. Click "View Candidates" (shows published candidates)
3. Click "View Results" (shows published results with charts)
4. Show that unpublished data is hidden ("Not yet published" messages)

**Validator View**:
1. Log in as validator: `validator@up.edu.ph` / `validator123`
2. Show the validator dashboard with election selector
3. Navigate to Integrity Check -- show read-only view (no override button)
4. Show message: "Contact SEB admin to resolve mismatches"
5. Navigate to Audit Logs -- show transaction history

### 14. Audit Trail

**Steps**:
1. Navigate to Audit & Logs > Audit Trail (admin) or Audit (validator)
2. Show audit log entries:
   - CREATE_ELECTION
   - REGISTER_CANDIDATE
   - OPEN_ELECTION
   - CAST_VOTE (with ballotToken, no voter ID)
   - CLOSE_ELECTION
3. Use the search/filter to find specific transactions

**Explain**: Every significant action is logged. Vote entries include the ballot token but not the voter's identity, maintaining ballot secrecy in the audit trail.

## Key Talking Points

- **Why blockchain?** Immutability, multi-org endorsement, tamper detection
- **Why hybrid (paper + digital)?** Accessibility, verifiability, voter confidence
- **Ballot secrecy**: Voter-to-vote mapping exists only in Org1's private data collection
- **Integrity check**: Real-time comparison catches any database tampering
- **Three organizations**: Models real election stakeholders (SEB, Department, Party)
- **Private Data Collections**: Only SEB can see voter registrations and encrypted ballots
