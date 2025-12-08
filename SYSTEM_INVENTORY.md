# eCASVote System - Complete Inventory

## 📋 Table of Contents
1. [Frontend Pages & Features](#frontend-pages--features)
2. [Backend API Endpoints](#backend-api-endpoints)
3. [Blockchain Chaincode Functions](#blockchain-chaincode-functions)
4. [Database Models](#database-models)
5. [User Roles & Authentication](#user-roles--authentication)
6. [Security Features](#security-features)
7. [Key Features & Capabilities](#key-features--capabilities)

---

## 🖥️ Frontend Pages & Features

### 1. **Login Page** (`/login`)
- **Features**:
  - Multi-tab login interface (Student Voter, Administrator, Validator)
  - Student login: Student Number (masked) + UP Mail
  - Admin/Validator login: Email + Password
  - Tagline: "Where your vote truly matters."
  - Role-based redirection after login

### 2. **Student Voter Dashboard** (`/home`)
- **Features**:
  - Personalized greeting with voter's name
  - Voting status badge (Voted / Not Yet Voted)
  - Ongoing elections card with countdown timer
  - Voter turnout visualization (Chart.js Doughnut chart)
  - Toggle tabs: Overall / Breakdown
  - Calendar sidebar (May 2025)
  - Announcements section
  - Sidebar navigation with profile card

### 3. **Cast Vote Page** (`/vote`)
- **Features**:
  - Instructions screen (shown first)
  - Dynamic ballot loading from database
  - Voter information display card
  - Department-based governor voting restriction
  - "Abstain" option for each position
  - Multi-step modal flow:
    1. Review Vote Modal (blurred background)
    2. Vote Authentication Modal (name + confirmation checkbox)
    3. Success/Error Modal
  - Transaction ID capture (hidden from voters)
  - Automatic redirect if not logged in

### 4. **Election Results Page** (`/results`)
- **Features**:
  - Conditional rendering based on election status
  - "Results Not Available Yet!" message with countdown (if election ongoing)
  - Full results display (if election closed):
    - Bar charts for each position (Chart.js)
    - Results table with vote counts and percentages
    - Election information card
  - Sticky sidebar

### 5. **Admin Dashboard** (`/admin`)
- **Features**:
  - "SEB Admin" greeting with badge
  - "Admin Control Panel · Ongoing Elections" subtitle
  - Ongoing elections card with countdown timer
  - Voter turnout section with breakdown (Chart.js)
  - Blockchain network status display
  - Last transaction ID display
  - Action buttons: Open Election, Close Election, Manage Election
  - Calendar sidebar
  - Activity summary
  - Sidebar navigation

### 6. **Election Management Page** (`/admin/election-management`)
- **Features**:
  - Elections table with Edit buttons
  - Candidates table with Edit/Delete buttons
  - Create Election Modal:
    - Name, Description, Academic Year, Semester
    - Start Date/Time, End Date/Time (datetime-local)
    - Status selection
  - Edit Election Modal:
    - Pre-filled with existing election data
    - Updates both blockchain and database
  - Add Candidates Modal:
    - Position selection
    - Name, Party, Program, Year Level
    - Multiple candidates at once
  - Timezone display (Philippine time UTC+08:00)

### 7. **Voter Turnout Page** (`/admin/voter-turnout`)
- **Features**:
  - Overall turnout statistics (Doughnut chart)
  - Breakdown by:
    - Department (Elektrons, Redbolts, Skimmers, Clovers)
    - Year Level
    - Program
  - Hourly participation trends (Line chart)
  - Date selector for hourly data
  - Key insights (peak hours, slowest hours)

### 8. **Results Summary Page** (`/admin/tally-results/summary-result`)
- **Features**:
  - Election information display
  - Results by position:
    - Bar charts (Chart.js)
    - Detailed tables with:
      - Candidate votes
      - Percentages
      - Winner status
  - Export to CSV functionality
  - Print functionality (optimized CSS)

### 9. **Integrity Check Page** (`/admin/tally-results/integrity-check`)
- **Features**:
  - Summary card (Blockchain vs Database votes)
  - On-Chain Vote Count Verification table
  - Off-Chain Vote Record Count Comparison table
  - Mismatch detection and warnings
  - Refresh button
  - Loading states

### 10. **Validator Dashboard** (`/validator`)
- **Features**:
  - Read-only access
  - Tabs:
    1. **Overview**: Election details, greeting with "VALIDATOR" badge, voter turnout
    2. **Candidates**: List of positions and candidates
    3. **Results**: Bar charts for vote counts
    4. **Audit Logs**: Complete transaction history with:
       - Timestamp
       - Action
       - Voter ID
       - Transaction ID
       - Details
    5. **Integrity Check**: Same as admin integrity check (lazy-loaded)
  - All times displayed in Philippine time (UTC+08:00)

---

## 🔌 Backend API Endpoints

### Authentication Endpoints
1. **POST `/login`** - Student voter login
   - Validates CAS student eligibility
   - Returns voter info with `hasVoted` status

2. **POST `/login/admin`** - Administrator login
   - Email + password authentication
   - Returns admin user info

3. **POST `/login/validator`** - Validator login
   - Email + password authentication
   - Returns validator user info

### Election Management Endpoints
4. **POST `/init`** - Initialize blockchain ledger
   - Creates default election, positions, candidates
   - Syncs with database

5. **GET `/elections/:id`** - Get election details
   - Auto-closes election if `endTime` passed
   - Returns election data from blockchain

6. **PUT `/elections/:id`** - Update election
   - Updates name, description, startTime, endTime
   - Updates both blockchain and database
   - Retry logic for MVCC conflicts

7. **POST `/elections/:id/open`** - Open election
   - Changes status to OPEN on blockchain

8. **POST `/elections/:id/close`** - Close election
   - Changes status to CLOSED on blockchain

### Position & Candidate Endpoints
9. **GET `/elections/:id/positions`** - Get all positions with candidates
   - Returns positions with nested candidates

10. **GET `/elections/:id/positions/:positionId/candidates`** - Get candidates for position

11. **POST `/elections/:id/candidates`** - Create candidates
    - Saves to database
    - Registers on blockchain (if election is DRAFT)
    - Handles program and yearLevel

### Voting Endpoints
12. **POST `/elections/:id/votes`** - Cast vote
    - Validates voter eligibility
    - Validates department governor restrictions
    - Submits to blockchain (gets transaction ID)
    - Saves to database
    - Creates audit log
    - Rollback on blockchain failure

13. **GET `/elections/:id/voters/:voterId/transaction`** - Get voter's transaction ID

### Results & Analytics Endpoints
14. **GET `/elections/:id/results`** - Get election results
    - Returns vote counts by position and candidate

15. **GET `/elections/:id/dashboard`** - Get dashboard data
    - Election details
    - Voter statistics
    - Recent announcements
    - Auto-closes election if needed

16. **GET `/elections/:id/turnout`** - Get voter turnout statistics
    - Overall turnout
    - Breakdown by department, year level, program

17. **GET `/elections/:id/hourly-participation`** - Get hourly vote counts
    - For specific date
    - Includes peak and slowest hours

18. **GET `/elections/:id/integrity-check`** - Integrity verification
    - Compares blockchain vs database vote counts
    - Returns mismatch status

### Audit & Logs Endpoints
19. **GET `/elections/:id/audit-logs`** - Get all audit logs
    - Returns complete transaction history

### Utility Endpoints
20. **GET `/health`** - Health check

---

## ⛓️ Blockchain Chaincode Functions

### Election Management
1. **`InitLedger`** - Initialize ledger with default data
   - Creates default election
   - Creates positions and candidates

2. **`CreateElection`** - Create new election
   - Parameters: id, name, description, startTime, endTime, createdBy

3. **`UpdateElection`** - Update election details
   - Parameters: electionId, name, description, startTime, endTime

4. **`OpenElection`** - Change election status to OPEN

5. **`CloseElection`** - Change election status to CLOSED

6. **`GetElection`** - Get election details
   - Returns JSON string

### Position Management
7. **`AddPosition`** - Add position to election
   - Parameters: electionId, positionId, name, maxVotes, order

### Candidate Management
8. **`RegisterCandidate`** - Register candidate
   - Parameters: electionId, positionId, candidateId, name, party, program, yearLevel
   - Only works if election is DRAFT

9. **`GetCandidatesByElection`** - Get all candidates for election
   - Returns JSON string

10. **`GetCandidatesByPosition`** - Get candidates for specific position
    - Returns JSON string

### Voter Management
11. **`RegisterVoter`** - Register voter for election
    - Parameters: electionId, voterId

### Voting
12. **`CastVote`** - Cast vote
    - Parameters: electionId, voterId, selectionsJson
    - Validates election is OPEN
    - Validates election hasn't ended
    - Validates positions and candidates
    - Handles "ABSTAIN" votes
    - Prevents double voting (idempotent check)
    - Auto-closes election if endTime passed

13. **`GetBallot`** - Get voter's ballot
    - Returns JSON string

### Results
14. **`GetElectionResults`** - Get election results
    - Returns vote counts by position and candidate
    - Returns JSON string

---

## 💾 Database Models

### Core Models
1. **`User`** - Admin and Validator accounts
   - Fields: id, email, password (hashed), role, fullName, isActive, lastLogin, voterId
   - Roles: ADMIN, VALIDATOR, STUDENT (for future use)

2. **`Election`** - Election information
   - Fields: id, name, description, startTime, endTime, status, createdBy, createdAt
   - Status: DRAFT, OPEN, CLOSED

3. **`Position`** - Election positions
   - Fields: id, electionId, name, maxVotes, order

4. **`Candidate`** - Candidates for positions
   - Fields: id, electionId, positionId, name, party, program, yearLevel

5. **`Voter`** - Voter registry
   - Fields: id, studentNumber, upEmail, fullName, college, department, program, yearLevel, status, isEligible, hasVoted, votedAt, createdAt, updatedAt
   - Status: ENROLLED, LOA, CROSS_REGISTERED, NON_DEGREE

6. **`Ballot`** - Admin-created ballot templates
   - Fields: id, electionId, name, description, createdBy, createdAt

7. **`Vote`** - Individual voter votes
   - Fields: id, electionId, voterId, selections (JSON), txId, castAt
   - Selections: Array of {positionId, candidateId}

8. **`AuditLog`** - System audit trail
   - Fields: id, electionId, voterId, action, txId, details (JSON), createdAt
   - Actions: CAST_VOTE, OPEN_ELECTION, CLOSE_ELECTION, etc.

---

## 👥 User Roles & Authentication

### 1. **Student Voter**
- **Login Method**: Student Number + UP Mail
- **Access**:
  - View dashboard
  - Cast vote (once)
  - View results (after election closes)
- **Restrictions**:
  - Can only vote for their department's governor
  - Cannot vote twice
  - Must be CAS, ENROLLED, and eligible

### 2. **Administrator (SEB Admin)**
- **Login Method**: Email + Password
- **Access**:
  - Full election management
  - Candidate management
  - View all results and statistics
  - Open/Close elections
  - Integrity checks
- **Permissions**:
  - Create/Update elections
  - Add/Edit/Delete candidates
  - View all data
  - Export and print results

### 3. **Validator (Adviser)**
- **Login Method**: Email + Password
- **Access**:
  - Read-only access to all data
  - View election details
  - View candidates
  - View results
  - View audit logs
  - Perform integrity checks
- **Restrictions**:
  - Cannot modify anything
  - Cannot cast votes
  - Cannot manage elections

---

## 🔒 Security Features

### 1. **Encryption**
- TLS/SSL encryption for all network communications
- Hyperledger Fabric built-in ledger encryption
- Transaction data protected by cryptographic hash chains

### 2. **Access Control**
- Role-based access control (RBAC)
- Department-based voting restrictions
- Eligibility validation (CAS, ENROLLED, isEligible)

### 3. **Blockchain Security**
- Immutable ledger (append-only)
- Cryptographic hashing (each block linked to previous)
- Consensus mechanism (Raft)
- Multi-peer validation

### 4. **Integrity Verification**
- Automated integrity check system
- Compares blockchain vs database records
- Mismatch detection and alerts
- Independent validator verification

### 5. **Audit Trail**
- Complete transaction history
- Unique transaction IDs for each vote
- Timestamped audit logs
- Action tracking (CAST_VOTE, OPEN_ELECTION, etc.)

### 6. **Vote Protection**
- Double voting prevention
- Idempotency checks
- Transaction rollback on failure
- Vote secrecy (not publicly accessible until election closes)

### 7. **Security Testing**
- Automated security test suite (`securityTests.ts`)
- Tests for:
  - Blockchain immutability
  - Integrity check functionality
  - Transaction ID uniqueness
  - No double voting
  - Audit trail completeness

---

## ✨ Key Features & Capabilities

### Election Management
- ✅ Create, update, open, and close elections
- ✅ Set start and end times (with timezone support)
- ✅ Automatic election closure when endTime passes
- ✅ Election status tracking (DRAFT, OPEN, CLOSED)

### Voting System
- ✅ Dynamic ballot loading from database
- ✅ Department-based governor voting restrictions
- ✅ "Abstain" option for each position
- ✅ Multi-position voting support
- ✅ Vote review and authentication flow
- ✅ Transaction ID capture and storage
- ✅ Double voting prevention

### Results & Analytics
- ✅ Real-time vote counting
- ✅ Results visualization (bar charts, doughnut charts)
- ✅ Voter turnout statistics
- ✅ Breakdown by department, year level, program
- ✅ Hourly participation trends
- ✅ Export to CSV
- ✅ Print functionality

### Data Integrity
- ✅ Blockchain as source of truth
- ✅ Database for fast queries
- ✅ Integrity check system
- ✅ Mismatch detection
- ✅ Validator oversight

### User Experience
- ✅ Responsive design
- ✅ Sticky sidebars
- ✅ Loading states
- ✅ Error handling with modals
- ✅ Success confirmations
- ✅ Personalized greetings
- ✅ Voting status badges

### Technical Features
- ✅ TypeScript for type safety
- ✅ Prisma ORM for database
- ✅ Hyperledger Fabric blockchain
- ✅ Next.js frontend
- ✅ Express.js backend
- ✅ Chart.js for visualizations
- ✅ shadcn/ui components
- ✅ Tailwind CSS styling

---

## 📊 Current System Statistics

### Positions (from chaincode)
- 3 USC Councilors
- 1 CAS Rep. to the USC
- 1 CAS Chairperson
- 1 CAS Vice Chairperson
- 5 CAS Councilor
- 1 Clovers Governor
- 1 Elektrons Governor
- 1 Redbolts Governor
- 1 Skimmers Governor

### Departments
- Elektrons
- Redbolts
- Skimmers
- Clovers

### Parties
- PMB
- Samasa
- Independent

### User Accounts (Default)
- **Admin**: `admin@up.edu.ph` / `admin123`
- **Validator**: `validator@up.edu.ph` / `validator123`
- **Adviser**: `adviser@up.edu.ph` / `adviser123`

### Voters
- 31 dummy voters seeded
- Distributed across departments, year levels, and programs
- All CAS, ENROLLED, and eligible

---

## 🚀 Deployment & Scripts

### Chaincode Deployment
- `deploy-chaincode.sh` - Automated deployment script
- Handles package, install, approve, commit
- Auto-increments sequence numbers
- Handles endorsement policies

### Database Scripts
- `npm run seed` - Seed positions and candidates
- `npm run seed:voters` - Seed voter registry
- `npm run seed:users` - Seed admin/validator users

### Security Testing
- `npm run security:test` - Run security analysis tests

---

## 📝 Documentation Files

1. **`SECURITY_ANALYSIS.md`** - Comprehensive security analysis report
2. **`SECURITY_CLAIMS.md`** - Security claims with evidence
3. **`SECURITY_DEMO_GUIDE.md`** - Guide for demonstrating security
4. **`SYSTEM_INVENTORY.md`** - This file (complete system inventory)

---

## 🎯 System Capabilities Summary

✅ **Complete Election Lifecycle Management**
✅ **Secure Blockchain-Based Voting**
✅ **Multi-Role Access Control**
✅ **Real-Time Results & Analytics**
✅ **Integrity Verification System**
✅ **Comprehensive Audit Trail**
✅ **Department-Based Voting Restrictions**
✅ **Automatic Election Closure**
✅ **Export & Print Functionality**
✅ **Security Testing Suite**

---

**Last Updated**: December 2024  
**System Version**: 1.0  
**Blockchain**: Hyperledger Fabric 2.5  
**Database**: SQLite (Prisma ORM)

