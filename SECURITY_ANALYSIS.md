# Security Analysis: eCASVote System

## Overview

This document describes the security design of the eCASVote blockchain-based voting system, covering voter privacy, ballot secrecy, data integrity, and tamper resistance.

## 1. Private Data Collections (PDC)

Voter registration and encrypted ballot data are stored in Hyperledger Fabric Private Data Collections, accessible only to Org1 (SEB).

### pdcVoters
- **Policy**: `OR('Org1MSP.member')`
- **Purpose**: Stores voter registration records (voterId, electionId, hasVoted flag)
- **Access**: Only Org1 peers can read/write
- **On-chain**: A hash of the private data is committed to the public ledger for verification
- **blockToLive**: 0 (data is never purged)

### pdcBallots
- **Policy**: `OR('Org1MSP.member')`
- **Purpose**: Stores encrypted ballot envelopes (ciphertextB64, castAt, encryption method)
- **Access**: Only Org1 peers can read/write
- **On-chain**: A hash of the private data is committed to the public ledger
- **blockToLive**: 0 (data is never purged)

### Implications
- Org2 (Dept) and Org3 (PMB) cannot read voter-to-ballot mappings
- They can verify the hash exists on the public ledger, confirming data was written
- The SEB is the only entity that can decrypt ballots, maintaining ballot secrecy

## 2. Ballot Secrecy Design

The system separates voter identity from vote content at multiple levels:

### On-Chain Separation
- `CastVoteEncrypted` stores the encrypted ballot in PDC (Org1 only) and updates public tallies
- Public tally counters increment per candidate but do not reference any voter
- The `GetElectionResults` function returns aggregate counts only

### Off-Chain Separation
- The `Vote` table in the database stores anonymized records:
  - `electionId`, `positionId`, `candidateId`, `voteHash`, `castAt`
  - **No voterId** is stored in the Vote record
- The `voteHash` is a SHA-256 hash of `ballotToken + positionId + candidateId + electionId`
- The `PaperBallotIssuance` table links voters to tokens, but the `PaperAnonymousVote` table does not reference voters

### Paper Ballot Flow
1. Voter is issued a ballot token (stored in `PaperBallotIssuance` with voterId)
2. Scanner reads the QR code (which contains only the token, not selections)
3. OMR detects bubble selections from the physical ballot
4. `confirm-vote` creates an anonymous vote record and marks the token as used
5. The anonymous vote record cannot be traced back to the voter without the private issuance table

## 3. Endorsement Policy

### Multi-Organization Endorsement
Most chaincode transactions require endorsement from all three organizations:
```
endorsingOrganizations: ['Org1MSP', 'Org2MSP', 'Org3MSP']
```

This ensures no single organization can unilaterally modify the ledger.

### PDC-Restricted Transactions
Voter registration and vote casting use Org1-only endorsement:
```
endorsingOrganizations: ['Org1MSP']
```

This is required because only Org1 has access to the private data collections. The chaincode enforces `requireSEB(ctx)` for these operations, verifying the caller's MSP ID is `Org1MSP`.

### Chaincode Access Control
```typescript
private requireSEB(ctx: Context): void {
  // Only Org1MSP (SEB) can call RegisterVoter, CastVoteEncrypted, etc.
}
```

## 4. SHA-256 Anonymized Vote Records

Each vote record in the database includes a SHA-256 hash for deduplication:

```
voteHash = SHA-256(ballotToken + positionId + candidateId + electionId)
```

- The hash is unique per vote (enforced by a database unique constraint)
- It prevents duplicate vote insertion without revealing voter identity
- The hash cannot be reversed to recover the ballot token

## 5. Integrity Check Mechanism

The system provides real-time integrity verification comparing blockchain and database records:

### Verification Process
1. `GET /elections/:id/integrity-check` fetches:
   - Blockchain tallies via `GetElectionResults` chaincode function
   - Database vote counts via Prisma aggregation
2. Compares per-candidate vote counts from both sources
3. Returns a `hasMismatch` flag if any discrepancy is found

### Override Mechanism
When a mismatch is detected, an admin can sync the database to match the blockchain:
- `POST /elections/:id/integrity/override` deletes all database vote records and recreates them to match blockchain tallies
- The blockchain is always treated as the source of truth
- This operation requires admin authentication and user confirmation

### Validator View
Validators can view the integrity check results but cannot perform overrides. They see:
- On-chain vote counts per candidate
- Off-chain vote counts per candidate
- Match/mismatch status per position
- Guidance to contact SEB admin if mismatches are found

## 6. Blockchain Immutability

### Tamper Evidence
- All transactions are recorded on the Hyperledger Fabric ledger with cryptographic hashes
- Each block references the hash of the previous block, forming an immutable chain
- Modifying any historical transaction would invalidate all subsequent block hashes

### Election Deletion Protection
- Elections with recorded votes cannot be deleted from the database
- The `DELETE /elections/:id` endpoint checks `GetElectionResults` on the blockchain
- If any votes exist, it returns HTTP 409 with `ELECTION_HAS_VOTES`
- Blockchain records are never deleted, even if the database record is removed

### Audit Trail
- All chaincode operations are logged in the `AuditLog` table:
  - `CREATE_ELECTION`, `OPEN_ELECTION`, `CLOSE_ELECTION`
  - `REGISTER_CANDIDATE`, `CAST_VOTE`
- Each log entry includes the election ID, action, timestamp, and optional transaction ID

## 7. Authentication and Access Control

### Role-Based Access
| Role | Access | Authentication |
|------|--------|----------------|
| Public | Landing page, published candidates, published results | None |
| Admin (SEB) | Full election management, voter roster, ballot scanning, results publishing | Email + bcrypt password |
| Validator | Read-only dashboard, integrity check, audit logs | Email + bcrypt password |

### Session Management
- Cookie-based sessions (`ecasvote_role`) with 8-hour sliding expiry
- Server-side middleware enforces route protection for `/admin/*` and `/validator/*`
- Session renews on every authenticated request (sliding window)

### Password Storage
- Admin and validator passwords are stored as bcrypt hashes (cost factor 10)
- Student authentication uses studentNumber + upEmail verification against the voter registry

## 8. Error Handling and Blockchain Resilience

### Vote Submission Rollback
If `CastVoteEncrypted` fails on the blockchain after the database transaction commits:
1. The anonymous vote record is deleted
2. The ballot token is marked as unused
3. The voter's `hasVoted` flag is reset (both global and per-election)
4. The voter can retry the submission

This ensures a vote only counts if it is confirmed on-chain. The blockchain is the source of truth.

### Network Unavailability
- Blockchain connection errors are sanitized before display to users
- Technical error details are logged to console but not shown in the UI
- The system displays: "Blockchain network is currently unavailable. Please contact the system administrator."
