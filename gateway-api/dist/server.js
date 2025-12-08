"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const fabricClient_1 = require("./fabricClient");
const prismaClient_1 = require("./prismaClient");
const app = (0, express_1.default)();
// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(body_parser_1.default.json());
// Simple health-check
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
// Login endpoint - validates CAS student eligibility
app.post('/login', async (req, res) => {
    const { studentNumber, upEmail } = req.body;
    if (!studentNumber && !upEmail) {
        return res.status(400).json({ error: 'studentNumber or upEmail is required' });
    }
    try {
        // 1. Look up the voter in the DB
        const voter = await prismaClient_1.prisma.voter.findFirst({
            where: {
                OR: [
                    studentNumber ? { studentNumber } : {},
                    upEmail ? { upEmail } : {},
                ].filter(obj => Object.keys(obj).length > 0),
            },
        });
        if (!voter) {
            return res.status(404).json({
                error: 'You are not in the official CAS voter list. Please contact the CAS SEB.',
            });
        }
        // 2. Enforce CAS + ENROLLED + isEligible
        if (voter.college !== 'CAS') {
            return res.status(403).json({
                error: 'This election is for CAS students only.',
            });
        }
        if (voter.status !== 'ENROLLED' || !voter.isEligible) {
            return res.status(403).json({
                error: 'You are currently not eligible to vote. Please contact the CAS SEB.',
            });
        }
        // 3. If all checks pass → return voter info
        // Note: We allow login even if they've already voted so they can view results
        return res.json({
            ok: true,
            message: 'Login successful',
            voter: {
                id: voter.id,
                studentNumber: voter.studentNumber,
                upEmail: voter.upEmail,
                fullName: voter.fullName,
                program: voter.program,
                yearLevel: voter.yearLevel,
                department: voter.department,
                hasVoted: voter.hasVoted,
            },
        });
    }
    catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: err.message || 'Login failed' });
    }
});
// Validator login endpoint - for Org2 (Adviser/Validator) users
app.post('/login/validator', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        // Find user by email
        const user = await prismaClient_1.prisma.user.findUnique({
            where: { email },
        });
        if (!user) {
            return res.status(401).json({
                error: 'Invalid credentials. Please contact the system administrator.',
            });
        }
        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({
                error: 'Your account has been deactivated. Please contact the system administrator.',
            });
        }
        // Check if user is a validator
        if (user.role !== 'VALIDATOR') {
            return res.status(403).json({
                error: 'Access denied. This login is for validators only.',
            });
        }
        // Verify password using bcrypt
        const bcrypt = require('bcrypt');
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                error: 'Invalid credentials. Please check your email and password.',
            });
        }
        // Update last login
        await prismaClient_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() },
        });
        // Return validator info
        return res.json({
            ok: true,
            message: 'Validator login successful',
            validator: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    }
    catch (err) {
        console.error('Validator login error:', err);
        return res.status(500).json({ error: err.message || 'Validator login failed' });
    }
});
// Admin login endpoint
app.post('/login/admin', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    try {
        // Find user by email
        const user = await prismaClient_1.prisma.user.findUnique({
            where: { email },
        });
        if (!user) {
            return res.status(401).json({
                error: 'Invalid credentials. Please contact the system administrator.',
            });
        }
        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({
                error: 'Your account has been deactivated. Please contact the system administrator.',
            });
        }
        // Check if user is an admin
        if (user.role !== 'ADMIN') {
            return res.status(403).json({
                error: 'Access denied. This login is for administrators only.',
            });
        }
        // Verify password using bcrypt
        const bcrypt = require('bcrypt');
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                error: 'Invalid credentials. Please check your email and password.',
            });
        }
        // Update last login
        await prismaClient_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() },
        });
        // Return admin info
        return res.json({
            ok: true,
            message: 'Admin login successful',
            admin: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    }
    catch (err) {
        console.error('Admin login error:', err);
        return res.status(500).json({ error: err.message || 'Admin login failed' });
    }
});
// Initialize ledger with default election data (calls InitLedger)
app.post('/init', async (_req, res) => {
    try {
        const contract = await (0, fabricClient_1.getContract)();
        // Check if election already exists
        try {
            const electionBuffer = await contract.evaluateTransaction('GetElection', 'election-2025');
            const election = JSON.parse(electionBuffer.toString());
            if (election && election.id === 'election-2025') {
                console.log('Election already exists, skipping InitLedger');
                return res.json({
                    ok: true,
                    message: 'Ledger already initialized',
                    election: election
                });
            }
        }
        catch (checkErr) {
            // Election doesn't exist, proceed with InitLedger
            console.log('Election not found, initializing ledger...');
        }
        console.log('Calling InitLedger...');
        await contract.submitTransaction('InitLedger');
        console.log('InitLedger completed successfully');
        // Sync election to database after initialization
        try {
            const electionBuffer = await contract.evaluateTransaction('GetElection', 'election-2025');
            const election = JSON.parse(electionBuffer.toString());
            await prismaClient_1.prisma.election.upsert({
                where: { id: 'election-2025' },
                update: {
                    name: election.name,
                    description: election.description || null,
                    startTime: new Date(election.startTime),
                    endTime: new Date(election.endTime),
                    status: election.status,
                },
                create: {
                    id: election.id,
                    name: election.name,
                    description: election.description || null,
                    startTime: new Date(election.startTime),
                    endTime: new Date(election.endTime),
                    status: election.status,
                    createdBy: election.createdBy || 'system',
                },
            });
            console.log('✅ Election synced to database after InitLedger');
        }
        catch (syncErr) {
            console.warn('⚠️ Failed to sync election to database after InitLedger:', syncErr.message);
            // Continue - blockchain is initialized
        }
        res.json({ ok: true, message: 'Ledger initialized successfully' });
    }
    catch (err) {
        console.error('InitLedger error:', err);
        const errorMessage = err.message || String(err);
        // Check if it's an endorsement error
        if (errorMessage.includes('endorsement') || errorMessage.includes('ABORTED') || errorMessage.includes('ProposalResponsePayloads do not match')) {
            res.status(400).json({
                error: errorMessage,
                hint: 'This error indicates that Org1 and Org2 peers are returning different chaincode execution results. This usually means:',
                possibleCauses: [
                    'Org2 has a different chaincode package installed than Org1',
                    'Org2 has different chaincode state than Org1',
                    'The chaincode packages on both orgs are out of sync'
                ],
                solution: 'Ensure both Org1 and Org2 have the exact same chaincode package installed. Run the deploy script to sync both orgs: ./deploy-chaincode.sh'
            });
        }
        else {
            res.status(400).json({ error: errorMessage });
        }
    }
});
// 1) Get election details
app.get('/elections/:id', async (req, res) => {
    try {
        const contract = await (0, fabricClient_1.getContract)();
        const bytes = await contract.evaluateTransaction('GetElection', req.params.id);
        const responseText = Buffer.from(bytes).toString('utf8').trim();
        if (!responseText) {
            throw new Error('Empty response from chaincode');
        }
        const election = JSON.parse(responseText);
        // Auto-close election if end time has passed
        const now = new Date();
        const endTime = new Date(election.endTime);
        if (election.status === 'OPEN' && now > endTime) {
            try {
                await contract.submitTransaction('CloseElection', req.params.id);
                election.status = 'CLOSED';
                console.log(`✅ Election ${req.params.id} automatically closed (end time passed)`);
            }
            catch (closeErr) {
                console.warn(`⚠️ Failed to auto-close election ${req.params.id}:`, closeErr.message);
                // Continue with current status if close fails
            }
        }
        // Sync election to database (upsert)
        try {
            await prismaClient_1.prisma.election.upsert({
                where: { id: req.params.id },
                update: {
                    name: election.name,
                    description: election.description || null,
                    startTime: new Date(election.startTime),
                    endTime: new Date(election.endTime),
                    status: election.status,
                },
                create: {
                    id: election.id,
                    name: election.name,
                    description: election.description || null,
                    startTime: new Date(election.startTime),
                    endTime: new Date(election.endTime),
                    status: election.status,
                    createdBy: election.createdBy || 'system',
                },
            });
            console.log(`✅ Election ${req.params.id} synced to database`);
        }
        catch (dbErr) {
            console.warn(`⚠️ Failed to sync election ${req.params.id} to database:`, dbErr.message);
            // Continue even if database sync fails - return blockchain data
        }
        res.json(election);
    }
    catch (err) {
        console.error('GetElection error:', err);
        const errorMessage = err.message || String(err);
        // Map "election does not exist" to 404
        if (errorMessage.includes('does not exist') || errorMessage.includes('Election')) {
            return res.status(404).json({ error: 'No election configured' });
        }
        res.status(400).json({ error: errorMessage || 'GetElection failed' });
    }
});
// 2) Get all positions with candidates for an election
app.get('/elections/:id/positions', async (req, res) => {
    const { id } = req.params;
    try {
        // Get positions from database
        const positions = await prismaClient_1.prisma.position.findMany({
            where: { electionId: id },
            orderBy: { order: 'asc' },
        });
        // Get candidates from database for each position
        const positionsWithCandidates = await Promise.all(positions.map(async (position) => {
            const candidates = await prismaClient_1.prisma.candidate.findMany({
                where: {
                    electionId: id,
                    positionId: position.id,
                },
                orderBy: { name: 'asc' },
            });
            return {
                ...position,
                candidates,
            };
        }));
        res.json(positionsWithCandidates);
    }
    catch (err) {
        console.error('GetPositions error:', err);
        res.status(400).json({ error: err.message || 'GetPositions failed' });
    }
});
// 2b) Get candidates for a position (from blockchain)
app.get('/elections/:id/positions/:positionId/candidates', async (req, res) => {
    const { id, positionId } = req.params;
    try {
        const contract = await (0, fabricClient_1.getContract)();
        const bytes = await contract.evaluateTransaction('GetCandidatesByPosition', id, positionId);
        const responseText = Buffer.from(bytes).toString('utf8').trim();
        if (!responseText) {
            throw new Error('Empty response from chaincode');
        }
        res.json(JSON.parse(responseText));
    }
    catch (err) {
        console.error('GetCandidatesByPosition error:', err);
        res.status(400).json({ error: err.message || 'GetCandidatesByPosition failed' });
    }
});
// 2c) Create/Add candidates to database and blockchain
app.post('/elections/:id/candidates', async (req, res) => {
    const { id } = req.params;
    const { candidates } = req.body; // Array of { positionName, name, party, yearLevel, program? }
    if (!Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ error: 'candidates array is required' });
    }
    try {
        // Get all positions to map position names to IDs
        const positions = await prismaClient_1.prisma.position.findMany({
            where: { electionId: id },
        });
        const positionMap = new Map(positions.map(p => [p.name, p]));
        const contract = await (0, fabricClient_1.getContract)();
        const createdCandidates = [];
        for (const candidateData of candidates) {
            const { positionName, name, party, yearLevel, program } = candidateData;
            if (!positionName || !name) {
                continue; // Skip invalid candidates
            }
            const position = positionMap.get(positionName);
            if (!position) {
                console.warn(`Position "${positionName}" not found for election ${id}`);
                continue;
            }
            // Generate candidate ID
            const existingCount = await prismaClient_1.prisma.candidate.count({
                where: {
                    electionId: id,
                    positionId: position.id,
                },
            });
            const candidateId = `cand-${position.id}-${existingCount + 1}`;
            // Save to database
            const candidate = await prismaClient_1.prisma.candidate.upsert({
                where: { id: candidateId },
                update: {
                    name,
                    party: party || null,
                    program: program || null,
                    yearLevel: yearLevel || null,
                    electionId: id,
                    positionId: position.id,
                },
                create: {
                    id: candidateId,
                    electionId: id,
                    positionId: position.id,
                    name,
                    party: party || null,
                    program: program || null,
                    yearLevel: yearLevel || null,
                },
            });
            // Also register on blockchain (only if election is in DRAFT status)
            try {
                // Check election status first
                const electionBytes = await contract.evaluateTransaction('GetElection', id);
                const electionText = Buffer.from(electionBytes).toString('utf8').trim();
                if (electionText) {
                    const election = JSON.parse(electionText);
                    if (election.status === 'DRAFT') {
                        await contract.submitTransaction('RegisterCandidate', id, position.id, candidateId, name, party || 'Independent', program || '', yearLevel || '');
                        console.log(`✅ Candidate ${candidateId} registered on blockchain`);
                    }
                    else {
                        console.warn(`⚠️ Skipping blockchain registration: Election ${id} is ${election.status} (must be DRAFT)`);
                    }
                }
            }
            catch (blockchainErr) {
                console.warn(`⚠️ Failed to register candidate ${candidateId} on blockchain:`, blockchainErr.message);
                // Continue even if blockchain registration fails - candidate is in database
            }
            createdCandidates.push(candidate);
        }
        res.json({ ok: true, candidates: createdCandidates, count: createdCandidates.length });
    }
    catch (err) {
        console.error('CreateCandidates error:', err);
        res.status(400).json({ error: err.message || 'CreateCandidates failed' });
    }
});
// 2.5) Update election (update name, description, dates)
app.put('/elections/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, startTime, endTime } = req.body;
    if (!name || !startTime || !endTime) {
        return res.status(400).json({ error: 'name, startTime, and endTime are required' });
    }
    try {
        const contract = await (0, fabricClient_1.getContract)();
        // Retry logic for MVCC_READ_CONFLICT (up to 3 attempts)
        let lastError = null;
        let success = false;
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Update on blockchain
                await contract.submitTransaction('UpdateElection', id, name, description || '', startTime, endTime);
                success = true;
                break; // Success, exit retry loop
            }
            catch (err) {
                lastError = err;
                // Check if it's an MVCC_READ_CONFLICT error (code 11)
                if (err.code === 11 && attempt < maxRetries) {
                    console.warn(`⚠️ MVCC_READ_CONFLICT on attempt ${attempt}, retrying...`);
                    // Wait a bit before retrying (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 200 * attempt));
                    continue;
                }
                // If not MVCC_READ_CONFLICT or max retries reached, throw
                throw err;
            }
        }
        if (!success) {
            throw lastError;
        }
        // Only update database after successful blockchain transaction
        try {
            await prismaClient_1.prisma.election.upsert({
                where: { id },
                update: {
                    name,
                    description: description || null,
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                },
                create: {
                    id,
                    name,
                    description: description || null,
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    status: 'DRAFT',
                    createdBy: 'admin',
                },
            });
            console.log(`✅ Election ${id} updated in database`);
        }
        catch (dbErr) {
            console.warn(`⚠️ Failed to update election ${id} in database:`, dbErr.message);
            // Continue even if database update fails - blockchain is updated
        }
        res.json({ ok: true, message: 'Election updated successfully' });
    }
    catch (err) {
        console.error('UpdateElection error:', err);
        // Provide helpful error message for MVCC_READ_CONFLICT
        if (err.code === 11) {
            return res.status(409).json({
                error: 'Transaction conflict: Another update is in progress. Please try again in a moment.',
                code: 'MVCC_READ_CONFLICT',
                hint: 'This usually happens when multiple updates occur simultaneously. Retry the request.'
            });
        }
        res.status(400).json({ error: err.message || 'UpdateElection failed' });
    }
});
// 3) Open election (change status from DRAFT to OPEN)
app.post('/elections/:id/open', async (req, res) => {
    const { id } = req.params;
    try {
        const contract = await (0, fabricClient_1.getContract)();
        await contract.submitTransaction('OpenElection', id);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('OpenElection error:', err);
        res.status(400).json({ error: err.message || 'OpenElection failed' });
    }
});
// 3.5) Close election (change status from OPEN to CLOSED)
app.post('/elections/:id/close', async (req, res) => {
    const { id } = req.params;
    try {
        const contract = await (0, fabricClient_1.getContract)();
        await contract.submitTransaction('CloseElection', id);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('CloseElection error:', err);
        res.status(400).json({ error: err.message || 'CloseElection failed' });
    }
});
// 4) Register voter
app.post('/elections/:id/voters', async (req, res) => {
    const { id } = req.params;
    const { voterId } = req.body; // e.g., UP mail or student ID
    if (!voterId) {
        return res.status(400).json({ error: 'voterId is required' });
    }
    try {
        const contract = await (0, fabricClient_1.getContract)();
        await contract.submitTransaction('RegisterVoter', id, voterId);
        res.json({ ok: true });
    }
    catch (err) {
        console.error(err);
        res.status(400).json({ error: err.message || 'RegisterVoter failed' });
    }
});
// 5) Cast vote
app.post('/elections/:id/votes', async (req, res) => {
    const { id } = req.params;
    const { studentNumber, selections } = req.body;
    // selections = [{ positionId, candidateId }, ...]
    if (!studentNumber || !Array.isArray(selections)) {
        return res.status(400).json({ error: 'studentNumber and selections[] are required' });
    }
    try {
        // --- 1) OFF-CHAIN: Verify voter exists and is eligible ---
        const voter = await prismaClient_1.prisma.voter.findUnique({
            where: { studentNumber },
        });
        if (!voter) {
            return res.status(404).json({ error: 'Voter not found in registry' });
        }
        if (voter.college !== 'CAS') {
            return res.status(403).json({ error: 'This election is for CAS students only' });
        }
        if (voter.status !== 'ENROLLED' || !voter.isEligible) {
            return res.status(403).json({ error: 'Voter is not eligible to vote' });
        }
        if (voter.hasVoted) {
            return res.status(403).json({ error: 'Voter has already cast their vote' });
        }
        // --- Validate department governor restriction ---
        const voterDepartment = voter.department.toLowerCase();
        const governorPositions = ['clovers-governor', 'elektrons-governor', 'redbolts-governor', 'skimmers-governor'];
        for (const selection of selections) {
            const { positionId } = selection;
            // Check if this is a governor position
            if (governorPositions.includes(positionId)) {
                // Extract department from position ID (e.g., "clovers-governor" -> "clovers")
                const positionDepartment = positionId.split('-')[0].toLowerCase();
                // Verify the position matches the voter's department
                if (positionDepartment !== voterDepartment) {
                    return res.status(403).json({
                        error: `You can only vote for ${voter.department} Governor. You attempted to vote for ${positionId.replace('-governor', '').charAt(0).toUpperCase() + positionId.replace('-governor', '').slice(1)} Governor.`
                    });
                }
            }
        }
        // Update voter as voted
        console.log(`[Vote] Marking voter ${studentNumber} as voted...`);
        await prismaClient_1.prisma.voter.update({
            where: { studentNumber },
            data: {
                hasVoted: true,
                votedAt: new Date(),
            },
        });
        console.log(`[Vote] ✅ Voter ${studentNumber} marked as voted`);
        // --- 2) ON-CHAIN: call ECASVote chaincode (CastVote) ---
        console.log(`[Vote] Submitting vote to blockchain...`);
        const contract = await (0, fabricClient_1.getContract)();
        const selectionsJson = JSON.stringify(selections);
        let transactionId;
        try {
            // Create proposal to get transaction ID, then endorse and submit
            // Use studentNumber as voterId for chaincode
            const proposal = contract.newProposal('CastVote', {
                arguments: [id, studentNumber, selectionsJson],
            });
            transactionId = proposal.getTransactionId();
            console.log(`[Vote] Created proposal with transaction ID: ${transactionId}`);
            // Endorse the proposal to get a transaction
            console.log(`[Vote] Endorsing proposal...`);
            const transaction = await proposal.endorse();
            console.log(`[Vote] ✅ Proposal endorsed successfully`);
            // Submit the transaction
            console.log(`[Vote] Submitting transaction...`);
            await transaction.submit();
            console.log(`[Vote] ✅ Vote submitted to blockchain with transaction ID: ${transactionId}`);
        }
        catch (blockchainErr) {
            console.error('[Vote] Blockchain error details:', {
                message: blockchainErr.message,
                code: blockchainErr.code,
                details: blockchainErr.details,
                cause: blockchainErr.cause,
            });
            // Rollback: Mark voter as not voted if blockchain failed
            try {
                await prismaClient_1.prisma.voter.update({
                    where: { studentNumber },
                    data: {
                        hasVoted: false,
                        votedAt: null,
                    },
                });
                console.log(`[Vote] Rolled back voter ${studentNumber} status`);
            }
            catch (rollbackErr) {
                console.error('[Vote] Failed to rollback voter status:', rollbackErr);
            }
            throw blockchainErr;
        }
        // --- 3) Store vote in database ---
        const vote = await prismaClient_1.prisma.vote.create({
            data: {
                electionId: id,
                voterId: studentNumber,
                selections: selections,
                txId: transactionId,
                castAt: new Date(),
            },
        });
        console.log(`[Vote] ✅ Vote saved to database: ${vote.id}`);
        // --- 4) Store transaction ID in audit log ---
        await prismaClient_1.prisma.auditLog.create({
            data: {
                electionId: id,
                voterId: studentNumber,
                action: 'CAST_VOTE',
                txId: transactionId,
                details: {
                    selections: selections,
                    voteId: vote.id,
                },
            },
        });
        return res.json({
            ok: true,
            message: 'Vote recorded on-chain and stored in database.',
            transactionId: transactionId,
            voteId: vote.id,
        });
    }
    catch (err) {
        console.error('[Vote] Error:', err);
        const errorMessage = err.message ?? 'Internal server error';
        // Check if it's a blockchain error
        if (errorMessage.includes('endorsement') || errorMessage.includes('ABORTED') || err.code === 10) {
            // Rollback: Mark voter as not voted if blockchain failed
            // Note: studentNumber should be extracted from request body if available
            const requestBody = req.body;
            if (requestBody?.studentNumber) {
                try {
                    await prismaClient_1.prisma.voter.update({
                        where: { studentNumber: requestBody.studentNumber },
                        data: {
                            hasVoted: false,
                            votedAt: null,
                        },
                    });
                    console.log(`[Vote] Rolled back voter ${requestBody.studentNumber} status`);
                }
                catch (rollbackErr) {
                    console.error('[Vote] Failed to rollback voter status:', rollbackErr);
                }
            }
            // Provide detailed error information
            const errorDetails = {
                error: 'Blockchain transaction failed',
                details: errorMessage,
                code: err.code,
            };
            // Add more details if available
            if (err.details && Array.isArray(err.details)) {
                errorDetails.endorsementDetails = err.details;
            }
            if (err.cause) {
                errorDetails.cause = err.cause.message || String(err.cause);
            }
            errorDetails.solution = 'This usually means the chaincode needs to be redeployed or the network peers are out of sync. Try redeploying the chaincode.';
            return res.status(500).json(errorDetails);
        }
        return res.status(500).json({ error: errorMessage });
    }
});
// 6) Get results
app.get('/elections/:id/results', async (req, res) => {
    const { id } = req.params;
    try {
        const contract = await (0, fabricClient_1.getContract)();
        const bytes = await contract.evaluateTransaction('GetElectionResults', id);
        const responseText = Buffer.from(bytes).toString('utf8').trim();
        if (!responseText) {
            throw new Error('Empty response from chaincode');
        }
        res.json(JSON.parse(responseText));
    }
    catch (err) {
        console.error('GetElectionResults error:', err);
        res.status(400).json({ error: err.message || 'GetElectionResults failed' });
    }
});
// 7) Get transaction ID for a voter's vote
app.get('/elections/:id/voters/:voterId/transaction', async (req, res) => {
    const { id, voterId } = req.params;
    try {
        const auditLog = await prismaClient_1.prisma.auditLog.findFirst({
            where: {
                electionId: id,
                voterId: voterId,
                action: 'CAST_VOTE',
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        if (!auditLog || !auditLog.txId) {
            return res.status(404).json({ error: 'Transaction ID not found for this voter' });
        }
        res.json({
            electionId: id,
            voterId: voterId,
            transactionId: auditLog.txId,
            castAt: auditLog.createdAt,
            details: auditLog.details,
        });
    }
    catch (err) {
        console.error('GetTransactionId error:', err);
        res.status(400).json({ error: err.message || 'GetTransactionId failed' });
    }
});
// 8) Get dashboard statistics for an election
app.get('/elections/:id/dashboard', async (req, res) => {
    const { id } = req.params;
    try {
        // Get total CAS enrolled voters
        const totalVoters = await prismaClient_1.prisma.voter.count({
            where: {
                college: 'CAS',
                status: 'ENROLLED',
                isEligible: true,
            },
        });
        // Get voters who have voted
        const votedCount = await prismaClient_1.prisma.voter.count({
            where: {
                college: 'CAS',
                status: 'ENROLLED',
                isEligible: true,
                hasVoted: true,
            },
        });
        // Get election info from blockchain
        let election = null;
        try {
            const contract = await (0, fabricClient_1.getContract)();
            const bytes = await contract.evaluateTransaction('GetElection', id);
            const responseText = Buffer.from(bytes).toString('utf8').trim();
            if (responseText) {
                election = JSON.parse(responseText);
                // Auto-close election if end time has passed
                const now = new Date();
                const endTime = new Date(election.endTime);
                if (election.status === 'OPEN' && now > endTime) {
                    try {
                        await contract.submitTransaction('CloseElection', id);
                        election.status = 'CLOSED';
                        console.log(`✅ Election ${id} automatically closed in dashboard (end time passed)`);
                    }
                    catch (closeErr) {
                        console.warn(`⚠️ Failed to auto-close election ${id} in dashboard:`, closeErr.message);
                        // Continue with current status if close fails
                    }
                }
                // Sync election to database when fetched
                if (election) {
                    try {
                        await prismaClient_1.prisma.election.upsert({
                            where: { id },
                            update: {
                                name: election.name,
                                description: election.description || null,
                                startTime: new Date(election.startTime),
                                endTime: new Date(election.endTime),
                                status: election.status,
                            },
                            create: {
                                id: election.id,
                                name: election.name,
                                description: election.description || null,
                                startTime: new Date(election.startTime),
                                endTime: new Date(election.endTime),
                                status: election.status,
                                createdBy: election.createdBy || 'system',
                            },
                        });
                    }
                    catch (syncErr) {
                        console.warn(`⚠️ Failed to sync election ${id} to database in dashboard:`, syncErr.message);
                    }
                }
            }
        }
        catch (err) {
            console.warn('Could not fetch election from blockchain:', err);
        }
        // Get recent announcements (from audit logs)
        const announcements = await prismaClient_1.prisma.auditLog.findMany({
            where: {
                electionId: id,
                action: { not: 'CAST_VOTE' }, // Exclude vote actions
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 5,
        });
        res.json({
            election,
            statistics: {
                totalVoters,
                votedCount,
                notVotedCount: totalVoters - votedCount,
            },
            announcements: announcements.map((log) => ({
                id: log.id,
                action: log.action,
                details: log.details,
                createdAt: log.createdAt,
            })),
        });
    }
    catch (err) {
        console.error('GetDashboard error:', err);
        res.status(400).json({ error: err.message || 'GetDashboard failed' });
    }
});
// 9) Get all audit logs for an election (for validators)
app.get('/elections/:id/audit-logs', async (req, res) => {
    const { id } = req.params;
    try {
        const auditLogs = await prismaClient_1.prisma.auditLog.findMany({
            where: {
                electionId: id,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        res.json({
            ok: true,
            logs: auditLogs.map((log) => ({
                id: log.id,
                electionId: log.electionId,
                voterId: log.voterId,
                action: log.action,
                txId: log.txId,
                details: log.details,
                createdAt: log.createdAt,
            })),
            count: auditLogs.length,
        });
    }
    catch (err) {
        console.error('GetAuditLogs error:', err);
        res.status(400).json({ error: err.message || 'GetAuditLogs failed' });
    }
});
// 10) Get detailed voter turnout statistics
app.get('/elections/:id/turnout', async (req, res) => {
    const { id } = req.params;
    try {
        // Get total CAS enrolled voters
        const totalVoters = await prismaClient_1.prisma.voter.count({
            where: {
                college: 'CAS',
                status: 'ENROLLED',
                isEligible: true,
            },
        });
        // Get voters who have voted
        const votedCount = await prismaClient_1.prisma.voter.count({
            where: {
                college: 'CAS',
                status: 'ENROLLED',
                isEligible: true,
                hasVoted: true,
            },
        });
        // Get all eligible voters with their details
        const allVoters = await prismaClient_1.prisma.voter.findMany({
            where: {
                college: 'CAS',
                status: 'ENROLLED',
                isEligible: true,
            },
            select: {
                department: true,
                yearLevel: true,
                program: true,
                hasVoted: true,
            },
        });
        // Calculate breakdown by department
        const departmentMap = new Map();
        allVoters.forEach(voter => {
            const dept = voter.department || 'Unknown';
            if (!departmentMap.has(dept)) {
                departmentMap.set(dept, { total: 0, voted: 0 });
            }
            const stats = departmentMap.get(dept);
            stats.total++;
            if (voter.hasVoted) {
                stats.voted++;
            }
        });
        const byDepartment = Array.from(departmentMap.entries()).map(([name, stats]) => ({
            name,
            total: stats.total,
            voted: stats.voted,
            notVoted: stats.total - stats.voted,
        }));
        // Calculate breakdown by year level
        const yearLevelMap = new Map();
        allVoters.forEach(voter => {
            const year = voter.yearLevel || 0;
            if (!yearLevelMap.has(year)) {
                yearLevelMap.set(year, { total: 0, voted: 0 });
            }
            const stats = yearLevelMap.get(year);
            stats.total++;
            if (voter.hasVoted) {
                stats.voted++;
            }
        });
        const byYearLevel = Array.from(yearLevelMap.entries())
            .map(([yearLevel, stats]) => ({
            yearLevel,
            total: stats.total,
            voted: stats.voted,
            notVoted: stats.total - stats.voted,
        }))
            .sort((a, b) => a.yearLevel - b.yearLevel);
        // Calculate breakdown by program
        const programMap = new Map();
        allVoters.forEach(voter => {
            const program = voter.program || 'Unknown';
            if (!programMap.has(program)) {
                programMap.set(program, { total: 0, voted: 0 });
            }
            const stats = programMap.get(program);
            stats.total++;
            if (voter.hasVoted) {
                stats.voted++;
            }
        });
        const byProgram = Array.from(programMap.entries()).map(([program, stats]) => ({
            program,
            total: stats.total,
            voted: stats.voted,
            notVoted: stats.total - stats.voted,
        }));
        res.json({
            totalVoters,
            votedCount,
            notVotedCount: totalVoters - votedCount,
            byDepartment,
            byYearLevel,
            byProgram,
        });
    }
    catch (err) {
        console.error('GetTurnout error:', err);
        res.status(400).json({ error: err.message || 'GetTurnout failed' });
    }
});
// 11) Get hourly participation data for an election
app.get('/elections/:id/hourly-participation', async (req, res) => {
    const { id } = req.params;
    const { date } = req.query; // Optional date filter (YYYY-MM-DD format)
    try {
        // Get all votes for this election from the Vote table
        const votes = await prismaClient_1.prisma.vote.findMany({
            where: {
                electionId: id,
                ...(date ? {
                    castAt: {
                        gte: new Date(date),
                        lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
                    },
                } : {}),
            },
            select: {
                castAt: true,
            },
            orderBy: {
                castAt: 'asc',
            },
        });
        // Initialize hourly buckets (24 hours)
        const hourlyCounts = new Map();
        for (let i = 0; i < 24; i++) {
            hourlyCounts.set(i, 0);
        }
        // Count votes by hour
        votes.forEach(vote => {
            const hour = new Date(vote.castAt).getHours();
            hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
        });
        // Convert to array format
        const hourlyData = Array.from(hourlyCounts.entries())
            .map(([hour, count]) => ({
            hour: hour.toString().padStart(2, '0') + ':00',
            count,
        }))
            .sort((a, b) => a.hour.localeCompare(b.hour));
        // Find peak and slowest hours (handle empty data)
        let peakHour = { hour: '00:00', count: 0 };
        let slowestHour = { hour: '00:00', count: 0 };
        if (hourlyData.length > 0) {
            peakHour = hourlyData.reduce((max, item) => item.count > max.count ? item : max, hourlyData[0]);
            slowestHour = hourlyData.reduce((min, item) => item.count < min.count ? item : min, hourlyData[0]);
        }
        res.json({
            hourlyData,
            peakHour: {
                time: peakHour.hour,
                count: peakHour.count,
            },
            slowestHour: {
                time: slowestHour.hour,
                count: slowestHour.count,
            },
            totalVotes: votes.length,
        });
    }
    catch (err) {
        console.error('GetHourlyParticipation error:', err);
        res.status(400).json({
            error: err.message || 'GetHourlyParticipation failed',
            hourlyData: [],
            peakHour: { time: '00:00', count: 0 },
            slowestHour: { time: '00:00', count: 0 },
            totalVotes: 0,
        });
    }
});
// 12) Get integrity check data (blockchain vs database comparison)
app.get('/elections/:id/integrity-check', async (req, res) => {
    const { id } = req.params;
    try {
        // Get results from blockchain
        const contract = await (0, fabricClient_1.getContract)();
        const bytes = await contract.evaluateTransaction('GetElectionResults', id);
        const responseText = Buffer.from(bytes).toString('utf8').trim();
        const blockchainResults = responseText ? JSON.parse(responseText) : {};
        // Get vote counts from database (Prisma Vote table)
        const dbVotes = await prismaClient_1.prisma.vote.findMany({
            where: {
                electionId: id,
            },
            select: {
                selections: true,
            },
        });
        // Count votes by position and candidate in database
        const dbResults = {};
        dbVotes.forEach((vote) => {
            const selections = vote.selections;
            selections.forEach((sel) => {
                if (!dbResults[sel.positionId]) {
                    dbResults[sel.positionId] = {};
                }
                if (!dbResults[sel.positionId][sel.candidateId]) {
                    dbResults[sel.positionId][sel.candidateId] = 0;
                }
                dbResults[sel.positionId][sel.candidateId]++;
            });
        });
        // Compare blockchain vs database
        const comparison = [];
        // Get all positions and candidates
        const allPositions = new Set();
        const allCandidates = new Map();
        // From blockchain
        Object.keys(blockchainResults).forEach((positionId) => {
            allPositions.add(positionId);
            if (!allCandidates.has(positionId)) {
                allCandidates.set(positionId, new Set());
            }
            Object.keys(blockchainResults[positionId]).forEach((candidateId) => {
                allCandidates.get(positionId).add(candidateId);
            });
        });
        // From database
        Object.keys(dbResults).forEach((positionId) => {
            allPositions.add(positionId);
            if (!allCandidates.has(positionId)) {
                allCandidates.set(positionId, new Set());
            }
            Object.keys(dbResults[positionId]).forEach((candidateId) => {
                allCandidates.get(positionId).add(candidateId);
            });
        });
        // Build comparison
        allPositions.forEach((positionId) => {
            const candidates = allCandidates.get(positionId) || new Set();
            candidates.forEach((candidateId) => {
                const blockchainCount = blockchainResults[positionId]?.[candidateId] || 0;
                const databaseCount = dbResults[positionId]?.[candidateId] || 0;
                comparison.push({
                    position: positionId,
                    candidate: candidateId,
                    blockchainCount,
                    databaseCount,
                    match: blockchainCount === databaseCount,
                });
            });
        });
        // Calculate totals
        const totalBlockchainVotes = Object.values(blockchainResults).reduce((sum, pos) => {
            return sum + Object.values(pos).reduce((posSum, count) => posSum + count, 0);
        }, 0);
        const totalDatabaseVotes = dbVotes.length;
        const hasMismatch = comparison.some((item) => !item.match) || totalBlockchainVotes !== totalDatabaseVotes;
        res.json({
            blockchainResults,
            databaseResults: dbResults,
            comparison,
            totals: {
                blockchain: totalBlockchainVotes,
                database: totalDatabaseVotes,
                match: totalBlockchainVotes === totalDatabaseVotes,
            },
            hasMismatch,
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        console.error('GetIntegrityCheck error:', err);
        res.status(400).json({ error: err.message || 'GetIntegrityCheck failed' });
    }
});
const PORT = process.env.PORT || 4000;
// Start the server
let server;
try {
    server = app.listen(PORT, () => {
        console.log(`eCASVote gateway API listening on http://localhost:${PORT}`);
        console.log('Server is running. Press Ctrl+C to stop.');
    });
    // Handle server errors (like port already in use)
    server.on('error', (error) => {
        if (error.syscall !== 'listen') {
            throw error;
        }
        const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;
        switch (error.code) {
            case 'EACCES':
                console.error(`${bind} requires elevated privileges`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                console.error(`${bind} is already in use`);
                console.error('Please stop the existing server or use a different port.');
                process.exit(1);
                break;
            default:
                throw error;
        }
    });
}
catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
}
// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} signal received: closing HTTP server`);
    server.close(() => {
        console.log('HTTP server closed');
        prismaClient_1.prisma.$disconnect()
            .then(() => {
            console.log('Database connection closed');
            process.exit(0);
        })
            .catch((err) => {
            console.error('Error closing database connection:', err);
            process.exit(1);
        });
    });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejection - log it instead
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});
