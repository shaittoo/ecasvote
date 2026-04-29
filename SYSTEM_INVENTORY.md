# eCASVote System Inventory

Complete reference of all API endpoints, chaincode functions, database models, and frontend routes.

## 1. Gateway API Endpoints

Base URL: `http://localhost:4000`

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Student login (studentNumber + upEmail) |
| POST | `/login/admin` | Admin login (email + password) |
| POST | `/login/validator` | Validator login (email + password) |

### Initialization

| Method | Path | Description |
|--------|------|-------------|
| POST | `/init` | Initialize blockchain ledger (calls InitLedger) |
| POST | `/seed-users` | Create default admin and validator users |

### Voter Registry (Global)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/voters` | List all voters in registry |
| POST | `/voters/import` | Bulk import voters from CSV |
| PATCH | `/voters/:id` | Update a voter record |
| DELETE | `/voters/:id` | Delete a voter from registry |

### Elections

| Method | Path | Description |
|--------|------|-------------|
| GET | `/elections` | List all elections (from DB) |
| GET | `/elections/for-voter` | Elections where a voter is on the roster |
| POST | `/elections` | Create election (blockchain + DB + default positions) |
| GET | `/elections/:id` | Get election details (blockchain + DB merge) |
| PUT | `/elections/:id` | Update election settings |
| DELETE | `/elections/:id` | Delete election (blocked if votes exist on chain) |
| POST | `/elections/:id/open` | Open election for voting |
| POST | `/elections/:id/close` | Close election |
| POST | `/elections/:id/publish-results` | Publish/unpublish election results |
| POST | `/elections/:id/publish-candidates` | Publish/unpublish candidate list |

### Positions and Candidates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/elections/:id/positions` | List positions with candidates (ordered by `order ASC`) |
| POST | `/elections/:id/positions` | Create/upsert positions |
| GET | `/elections/:id/positions/:positionId/candidates` | Get candidates for a position (from blockchain) |
| POST | `/elections/:id/candidates` | Create candidates (DB + blockchain) |
| POST | `/elections/:id/candidates/:candidateId/image` | Upload candidate image |

### Voter Roster (Per-Election)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/elections/:id/voters` | Get election voters (pool=eligible or active) |
| POST | `/elections/:id/voters` | Register voter on blockchain |
| POST | `/elections/:id/voters/roster/sync-cas-eligible` | Sync CAS-eligible voters to election roster |
| POST | `/elections/:id/voters/roster` | Bulk add voters to roster |
| DELETE | `/elections/:id/voters/roster/:voterId` | Remove voter from roster |

### Digital Voting

| Method | Path | Description |
|--------|------|-------------|
| POST | `/elections/:id/votes` | Cast digital vote (blockchain + DB) |
| GET | `/elections/:id/voters/:voterId/transaction` | Get transaction ID for a voter's vote |

### Paper Ballot (Hybrid)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/elections/:id/paper-check-in` | List voters with paper ballot status |
| POST | `/elections/:id/paper-ballots/issue` | Issue a paper ballot token to a voter |
| GET | `/elections/:id/paper-tokens` | List all paper tokens for an election |
| POST | `/elections/:id/paper-tokens/generate-all` | Generate tokens for all roster voters |

### Ballot Scanning

| Method | Path | Description |
|--------|------|-------------|
| POST | `/scanner/scan-image` | Scan ballot image (OMR + QR) |
| POST | `/scanner/debug-image` | Generate debug overlay image |
| POST | `/scanner/validate` | Validate a ballot token |
| POST | `/scanner/confirm-vote` | Submit scanned vote (DB + blockchain) |

### OMR Layout

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/omr-layout` | Store measured ballot geometry |
| GET | `/api/omr-layout/:ballotId` | Retrieve ballot geometry |

### Results and Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/elections/:id/results` | Get election results (from blockchain) |
| GET | `/elections/:id/dashboard` | Admin/validator dashboard data |
| GET | `/elections/:id/audit-logs` | Audit log entries |
| GET | `/elections/:id/turnout` | Voter turnout statistics |
| GET | `/elections/:id/hourly-participation` | Hourly vote participation data |
| GET | `/elections/:id/integrity-check` | Compare blockchain vs DB vote counts |
| POST | `/elections/:id/integrity/override` | Sync DB to match blockchain (admin only) |

---

## 2. Chaincode Functions

Smart contract: `chaincode-ecasvote/src/ecasVote.ts`

### Election Lifecycle

| Function | Parameters | Access | Description |
|----------|-----------|--------|-------------|
| `InitLedger` | (none) | SEB | Initialize ledger with default data |
| `CreateElection` | electionId, name, description, startTime, endTime, createdBy | SEB | Create a new election |
| `GetElection` | electionId | Any | Read election details |
| `UpdateElection` | electionId, name, description, startTime, endTime | SEB | Update election settings |
| `OpenElection` | electionId | SEB | Change status DRAFT to OPEN |
| `CloseElection` | electionId | SEB | Change status OPEN to CLOSED |
| `DeleteElection` | electionId | SEB | Remove election from world state |

### Positions and Candidates

| Function | Parameters | Access | Description |
|----------|-----------|--------|-------------|
| `AddPosition` | electionId, positionId, name, maxVotes, order | SEB | Add a voting position |
| `RegisterCandidate` | electionId, positionId, candidateId, name, party, program, yearLevel | SEB | Register a candidate |
| `GetCandidatesByElection` | electionId | Any | List all candidates for an election |
| `GetCandidatesByPosition` | electionId, positionId | Any | List candidates for a position |

### Voters and Ballots (PDC)

| Function | Parameters | Access | PDC |
|----------|-----------|--------|-----|
| `RegisterVoter` | electionId, voterId | SEB | pdcVoters |
| `GetVoter` | electionId, voterId | SEB | pdcVoters |
| `GetVoterHash` | electionId, voterId | Any | Hash only |
| `CastVoteEncrypted` | electionId, voterId, ciphertextB64, selectionsJson | SEB | pdcBallots |
| `GetEncryptedBallot` | electionId, voterId | SEB | pdcBallots |
| `GetBallotHash` | electionId, voterId | Any | Hash only |

### Results

| Function | Parameters | Access | Description |
|----------|-----------|--------|-------------|
| `GetElectionResults` | electionId | Any | Aggregate vote tallies per position per candidate |

---

## 3. Database Schema

Database: SQLite via Prisma ORM (`gateway-api/prisma/schema.prisma`)

### Enums

- **ElectionStatus**: `DRAFT` | `OPEN` | `CLOSED`
- **UserRole**: `STUDENT` | `ADMIN` | `VALIDATOR`

### Models

#### User
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK, autoincrement) | |
| email | String (unique) | |
| password | String | bcrypt hashed |
| role | UserRole | ADMIN or VALIDATOR |
| fullName | String? | |
| isActive | Boolean | default true |
| lastLogin | DateTime? | |
| voterId | Int? (unique) | Optional link to Voter |

#### Election
| Field | Type | Notes |
|-------|------|-------|
| id | String (PK) | Slug-based (e.g., "cas-sc-elections-2026") |
| name | String | |
| description | String? | |
| startTime | DateTime | |
| endTime | DateTime | |
| status | ElectionStatus | DRAFT, OPEN, or CLOSED |
| createdBy | String | |
| createdAt | DateTime | |
| resultsPublished | Boolean | default false |
| candidatesPublished | Boolean | default false |

#### Position
| Field | Type | Notes |
|-------|------|-------|
| id | String (PK) | Slug-based (e.g., "usc-councilor") |
| electionId | String | |
| name | String | Display name |
| maxVotes | Int | Max selections allowed |
| order | Int | Display order (governors share order 6) |

#### Candidate
| Field | Type | Notes |
|-------|------|-------|
| id | String (PK) | e.g., "cand-usc-councilor-1" |
| electionId | String | |
| positionId | String | |
| name | String | |
| party | String? | |
| program | String? | |
| yearLevel | String? | |
| imageUrl | String? | |

#### Voter
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK, autoincrement) | |
| studentNumber | String (unique) | e.g., "2021-00567" |
| upEmail | String (unique) | e.g., "cmendoza@up.edu.ph" |
| fullName | String | |
| college | String | e.g., "CAS" |
| department | String | e.g., "DPSM" |
| program | String | e.g., "BS Computer Science" |
| yearLevel | Int | |
| status | String | ENROLLED, LOA, etc. |
| isEligible | Boolean | default true |
| hasVoted | Boolean | Global convenience flag |
| votedAt | DateTime? | |

#### ElectionVoter
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | |
| electionId | String | |
| voterId | Int | |
| hasVoted | Boolean | Per-election vote status |
| votedAt | DateTime? | |
| Unique | [electionId, voterId] | |

#### Vote (Anonymized)
| Field | Type | Notes |
|-------|------|-------|
| id | String (PK, uuid) | |
| electionId | String | |
| positionId | String | |
| candidateId | String | |
| voteHash | String (unique) | SHA-256 for deduplication |
| castAt | DateTime | |
| Index | [electionId, positionId, candidateId] | |

#### PaperBallotIssuance (Private)
| Field | Type | Notes |
|-------|------|-------|
| id | String (PK, uuid) | |
| ballotToken | String (unique) | e.g., "TKN-ABC123" |
| electionId | String | |
| voterId | Int | Links voter to token |
| used | Boolean | default false |
| templateVersion | String | default "ballot-template-v1" |

#### PaperAnonymousVote (Public)
| Field | Type | Notes |
|-------|------|-------|
| id | String (PK, uuid) | |
| electionId | String | |
| ballotToken | String (unique) | No voter reference |
| ciphertextB64 | String | |
| selectionsJson | Json | |
| templateVersion | String | |
| castAt | DateTime | |

#### AuditLog
| Field | Type | Notes |
|-------|------|-------|
| id | Int (PK) | |
| electionId | String? | |
| voterId | String? | |
| action | String | CREATE_ELECTION, CAST_VOTE, etc. |
| txId | String? | Blockchain transaction ID |
| details | Json? | Additional metadata |
| createdAt | DateTime | |

#### BallotLayout
| Field | Type | Notes |
|-------|------|-------|
| ballotId | String (PK) | |
| electionId | String | |
| templateId | String | |
| templateVersion | String | |
| layoutJson | String | OMR geometry template |
| layoutHash | String | SHA-256 of layoutJson |

---

## 4. Frontend Routes

### Public Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Landing page | Active election info, candidate/results links |
| `/login` | Login | Unified login (student, admin, validator auto-detect) |
| `/studentvoter/candidates` | Candidates | Published candidate list by position |
| `/studentvoter/results` | Results | Published election results |

### Admin Routes (Protected)

| Path | Page | Description |
|------|------|-------------|
| `/admin` | Dashboard | Election overview, turnout charts |
| `/admin/election-management` | Election list | Create, edit, delete elections |
| `/admin/election-management/[electionId]/edit` | Edit election | Settings + candidate management |
| `/admin/voter-management/voter-roster` | Voter roster | Import CSV, manage voters per election |
| `/admin/voter-management/token-status` | Token status | Paper ballot token management |
| `/admin/ballot-print` | Ballot print | Preview and print paper ballots |
| `/admin/ballot-scanning` | Ballot scanning | Batch OMR/QR scanning |
| `/admin/ballot-scanning/[electionId]` | Single scan | Scan individual ballots |
| `/admin/tally-results/summary-result` | Results summary | Charts, tables, publish button |
| `/admin/tally-results/voter-turnout` | Voter turnout | Turnout breakdown by dept/year |
| `/admin/tally-results/integrity-check` | Integrity check | Blockchain vs DB comparison |
| `/admin/audit-and-logs/audit-trail` | Audit trail | Transaction history |

### Validator Routes (Protected)

| Path | Page | Description |
|------|------|-------------|
| `/validator` | Dashboard | Read-only election overview |
| `/validator/candidates` | Candidates | View published candidates |
| `/validator/results` | Results | View published results |
| `/validator/audit` | Audit logs | View transaction history |
| `/validator/integrity` | Integrity check | Verify blockchain vs DB (read-only) |

### Other Student Routes

| Path | Page | Description |
|------|------|-------------|
| `/studentvoter` | Dashboard | Student voter home (currently disabled) |
| `/studentvoter/castvote` | Cast vote | Digital voting interface |
