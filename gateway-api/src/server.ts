// src/server.ts
// Load .env before Fabric client reads CRYPTO_PATH / TLS_CERT_PATH (required for `npm run start`)
import 'dotenv/config';

import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { getContract, getNetwork } from './fabricClient';
import { prisma } from './prismaClient';

/** Unique paper ballot token (QR identifies ballot only — not vote data). */
function generateBallotToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return `TKN-${code}`;
}

/** Student voter roster for an election (who may participate in that election only). */
async function getElectionRosterVoterIds(electionId: string): Promise<number[]> {
  const rows = await prisma.electionVoter.findMany({
    where: { electionId },
    select: { voterId: true },
  });
  return rows.map((r) => r.voterId);
}

async function isVoterOnElectionRoster(electionId: string, voterId: number): Promise<boolean> {
  const row = await prisma.electionVoter.findUnique({
    where: { electionId_voterId: { electionId, voterId } },
  });
  return !!row;
}

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(bodyParser.json({ limit: '8mb' }));

// Simple health-check
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// --- Voter registry (SQLite) — admin roster & CSV import ---
app.get('/voters', async (_req, res) => {
  try {
    const rows = await prisma.voter.findMany({
      orderBy: { studentNumber: 'asc' },
    });
    res.json(rows);
  } catch (err: any) {
    console.error('GET /voters error:', err);
    res.status(500).json({ error: err.message || 'Failed to list voters' });
  }
});

type VoterImportInput = {
  studentNumber: string;
  upEmail: string;
  fullName: string;
  college: string;
  department: string;
  program: string;
  yearLevel: number;
  status?: string;
  isEligible?: boolean;
};

app.post('/voters/import', async (req, res) => {
  const body = req.body as { voters?: VoterImportInput[] };
  const voters = body?.voters;
  if (!Array.isArray(voters) || voters.length === 0) {
    return res.status(400).json({ error: 'Body must include non-empty voters array' });
  }

  let created = 0;
  let updated = 0;
  const errors: Array<{ index: number; studentNumber?: string; message: string }> = [];

  for (let i = 0; i < voters.length; i++) {
    const raw = voters[i];
    try {
      const studentNumber = String(raw?.studentNumber ?? '').trim();
      const upEmail = String(raw?.upEmail ?? '').trim();
      const fullName = String(raw?.fullName ?? '').trim();
      const college = String(raw?.college ?? '').trim();
      const department = String(raw?.department ?? '').trim();
      const program = String(raw?.program ?? '').trim();
      let yearLevel = Number(raw?.yearLevel);
      if (!Number.isFinite(yearLevel) || yearLevel < 1) {
        errors.push({
          index: i,
          studentNumber: String(raw?.studentNumber ?? '').trim() || undefined,
          message: 'yearLevel must be a positive number (e.g. 1–6)',
        });
        continue;
      }
      yearLevel = Math.floor(yearLevel);

      if (!studentNumber || !upEmail || !fullName || !college || !department || !program) {
        errors.push({
          index: i,
          studentNumber: studentNumber || undefined,
          message: 'Missing required field (studentNumber, upEmail, fullName, college, department, program)',
        });
        continue;
      }

      const status = String(raw?.status ?? 'ENROLLED').trim() || 'ENROLLED';
      const isEligible =
        raw?.isEligible === undefined || raw?.isEligible === null ? true : Boolean(raw.isEligible);

      const existing = await prisma.voter.findUnique({ where: { studentNumber } });
      await prisma.voter.upsert({
        where: { studentNumber },
        create: {
          studentNumber,
          upEmail,
          fullName,
          college,
          department,
          program,
          yearLevel,
          status,
          isEligible,
        },
        update: {
          upEmail,
          fullName,
          college,
          department,
          program,
          yearLevel,
          status,
          isEligible,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    } catch (err: any) {
      errors.push({
        index: i,
        studentNumber: raw?.studentNumber ? String(raw.studentNumber) : undefined,
        message: err.message || String(err),
      });
    }
  }

  res.json({
    ok: true,
    created,
    updated,
    total: created + updated,
    failed: errors.length,
    errors,
  });
});

app.patch('/voters/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid voter id' });
  }
  const body = req.body ?? {};

  try {
    const existing = await prisma.voter.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Voter not found' });
    }

    const data: Record<string, unknown> = {};
    if (body.studentNumber !== undefined) data.studentNumber = String(body.studentNumber).trim();
    if (body.upEmail !== undefined) data.upEmail = String(body.upEmail).trim();
    if (body.fullName !== undefined) data.fullName = String(body.fullName).trim();
    if (body.college !== undefined) data.college = String(body.college).trim();
    if (body.department !== undefined) data.department = String(body.department).trim();
    if (body.program !== undefined) data.program = String(body.program).trim();
    if (body.yearLevel !== undefined) {
      const y = Math.floor(Number(body.yearLevel));
      if (!Number.isFinite(y) || y < 1) {
        return res.status(400).json({ error: 'yearLevel must be a positive number' });
      }
      data.yearLevel = y;
    }
    if (body.status !== undefined) data.status = String(body.status).trim();
    if (body.isEligible !== undefined) data.isEligible = Boolean(body.isEligible);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updated = await prisma.voter.update({
      where: { id },
      data: data as any,
    });
    res.json(updated);
  } catch (err: any) {
    console.error('PATCH /voters/:id error:', err);
    res.status(400).json({ error: err.message || 'Update failed' });
  }
});

app.delete('/voters/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid voter id' });
  }
  try {
    await prisma.voter.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Voter not found' });
    }
    console.error('DELETE /voters/:id error:', err);
    res.status(400).json({ error: err.message || 'Delete failed' });
  }
});

// Login endpoint - validates CAS student eligibility
app.post('/login', async (req, res) => {
  const { studentNumber, upEmail } = req.body;

  if (!studentNumber && !upEmail) {return res.status(400).json({ error: 'studentNumber or upEmail is required' });
  }

  try {
    // 1. Look up the voter in the DB
    const voter = await prisma.voter.findFirst({
      where: {
        OR: [
          studentNumber ? { studentNumber } : {},
          upEmail ? { upEmail } : {},
        ].filter(obj => Object.keys(obj).length > 0),
      },
    });

    if (!voter) {return res.status(404).json({
        error: 'You are not in the official CAS voter list. Please contact the CAS SEB.',
      });
    }

    // 2. Enforce CAS + ENROLLED + isEligible
    if (voter.college !== 'CAS') {return res.status(403).json({
        error: 'This election is for CAS students only.',
      });
    }

    if (voter.status !== 'ENROLLED' || !voter.isEligible) {return res.status(403).json({
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
  } catch (err: any) {
    console.error('Login error:', err);
return res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// Validator login endpoint - for Org2 (Adviser/Validator) users
app.post('/login/validator', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {return res.status(401).json({
        error: 'Invalid credentials. Please contact the system administrator.',
      });
    }

    // Check if user is active
    if (!user.isActive) {return res.status(403).json({
        error: 'Your account has been deactivated. Please contact the system administrator.',
      });
    }

    // Check if user is a validator
    if (user.role !== 'VALIDATOR') {return res.status(403).json({
        error: 'Access denied. This login is for validators only.',
      });
    }

    // Verify password using bcrypt
    const bcrypt = require('bcrypt');
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {return res.status(401).json({
        error: 'Invalid credentials. Please check your email and password.',
      });
    }

    // Update last login
    await prisma.user.update({
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
  } catch (err: any) {
    console.error('Validator login error:', err);
return res.status(500).json({ error: err.message || 'Validator login failed' });
  }
});

// Admin login endpoint
app.post('/login/admin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials. Please contact the system administrator.',
      });
    }

    if (!user) {return res.status(401).json({
        error: 'Invalid credentials. Please contact the system administrator.',
      });
    }

    // Check if user is active
    if (!user.isActive) {return res.status(403).json({
        error: 'Your account has been deactivated. Please contact the system administrator.',
      });
    }

    // Check if user is an admin
    if (user.role !== 'ADMIN') {return res.status(403).json({
        error: 'Access denied. This login is for administrators only.',
      });
    }

    // Verify password using bcrypt
    const bcrypt = require('bcrypt');
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {return res.status(401).json({
        error: 'Invalid credentials. Please check your email and password.',
      });
    }

    // Update last login
    await prisma.user.update({
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
  } catch (err: any) {
    console.error('Admin login error:', err);
return res.status(500).json({ error: err.message || 'Admin login failed' });
  }
});

// Initialize ledger with default election data (calls InitLedger)
app.post('/init', async (req, res) => {
  const ip = req.ip || 'unknown';

  try {const contract = await getContract();

    // Check if election exists
    let electionExists = false;

    try {
      const electionBuffer = await contract.evaluateTransaction('GetElection', 'election-2025');
      const election = JSON.parse(electionBuffer.toString());

      if (election && election.id === 'election-2025') {
        electionExists = true;
return res.json({
          ok: true,
          message: 'Ledger already initialized',
          election,
        });
      }
    } catch (err) {
      // not found → continue
    }

    // Init ledgerawait contract.submitTransaction('InitLedger');
// Sync to DB
    try {
      const electionBuffer = await contract.evaluateTransaction('GetElection', 'election-2025');
      const election = JSON.parse(electionBuffer.toString());

      await prisma.election.upsert({
        where: { id: election.id },
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
} catch (syncErr: any) {}

    return res.json({ ok: true, message: 'Ledger initialized successfully' });

  } catch (err: any) {
    console.error('InitLedger error:', err);
    return res.status(400).json({ error: err.message });
  }
});

// 0) List all elections (from DB; created via POST /elections or synced from chaincode)
app.get('/elections', async (_req, res) => {
  try {
    const elections = await prisma.election.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(elections);
  } catch (err: any) {
    console.error('List elections error:', err);
    res.status(500).json({ error: err.message || 'Failed to list elections' });
  }
});

/** Elections where this student is on the voter roster (for student dashboard / eligibility). */
app.get('/elections/for-voter', async (req, res) => {
  const studentNumber = String(req.query.studentNumber ?? '');
  if (!studentNumber) {
    return res.status(400).json({ error: 'studentNumber query parameter is required' });
  }
  try {
    const voter = await prisma.voter.findUnique({ where: { studentNumber } });
    if (!voter) {
      return res.json({ elections: [] });
    }
    const memberships = await prisma.electionVoter.findMany({
      where: { voterId: voter.id },
      include: { election: true },
    });
    res.json({
      elections: memberships.map((m) => ({
        id: m.election.id,
        name: m.election.name,
        description: m.election.description,
        startTime: m.election.startTime,
        endTime: m.election.endTime,
        status: m.election.status,
        createdBy: m.election.createdBy,
        createdAt: m.election.createdAt,
      })),
    });
  } catch (err: any) {
    console.error('GET /elections/for-voter error:', err);
    res.status(500).json({ error: err.message || 'failed' });
  }
});

// 1) Create election (blockchain + DB)
app.post('/elections', async (req, res) => {
  const { electionId, name, description, startTime, endTime, createdBy } = req.body || {};
  const ip = req.ip;

  if (!electionId || !name || !startTime || !endTime) {
    return res.status(400).json({
      error: 'Missing required fields: electionId, name, startTime, endTime',
    });
  }

  try {
    const contract = await getContract();

    await contract.submitTransaction(
      'CreateElection',
      String(electionId),
      String(name),
      String(description ?? ''),
      String(startTime),
      String(endTime),
      String(createdBy ?? 'admin'),
    );

    // DB sync
    try {
      await prisma.election.upsert({
        where: { id: electionId },
        update: {
          name: String(name),
          description: description != null ? String(description) : null,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          status: 'DRAFT',
          createdBy: String(createdBy ?? 'admin'),
        },
        create: {
          id: electionId,
          name: String(name),
          description: description != null ? String(description) : null,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          status: 'DRAFT',
          createdBy: String(createdBy ?? 'admin'),
        },
      });
    } catch (dbErr: any) {
      console.warn('⚠️ Failed to sync new election to database:', dbErr.message);
    }

    const election = {
      id: electionId,
      name: String(name),
      description: description ?? '',
      startTime: String(startTime),
      endTime: String(endTime),
      status: 'DRAFT',
      createdBy: String(createdBy ?? 'admin'),
    };

    // Success log AFTER everything succeeds
    return res.status(201).json(election);

  } catch (err: any) {
    console.error('CreateElection error:', err);

    const msg = err.message || String(err);
    if (msg.includes('already exists')) {
      return res.status(409).json({ error: msg });
    }

    return res.status(400).json({ error: msg });
  }
});

// 2) Get election details
app.get('/elections/:id', async (req, res) => {
  try {
    const contract = await getContract();
    const bytes = await contract.evaluateTransaction('GetElection', req.params.id);
    const responseText = Buffer.from(bytes).toString('utf8').trim();
    if (!responseText) {
      throw new Error('Empty response from chaincode');
    }
    const election = JSON.parse(responseText);
    const now = new Date();
    const startTime = new Date(election.startTime);
    const endTime = new Date(election.endTime);

    // Auto-open: if DRAFT and start time has been reached, open the election
    if (election.status === 'DRAFT' && now >= startTime) {
      try {
        await contract.submitTransaction('OpenElection', req.params.id);
        election.status = 'OPEN';
        console.log(`✅ Election ${req.params.id} automatically opened (start time reached)`);
      } catch (openErr: any) {
        console.warn(`⚠️ Failed to auto-open election ${req.params.id}:`, openErr.message);
      }
    }

    // Auto-close: if OPEN and end time has passed, close the election
    if (election.status === 'OPEN' && now > endTime) {
      try {
        await contract.submitTransaction('CloseElection', req.params.id);
        election.status = 'CLOSED';
        console.log(`✅ Election ${req.params.id} automatically closed (end time passed)`);
      } catch (closeErr: any) {
        console.warn(`⚠️ Failed to auto-close election ${req.params.id}:`, closeErr.message);
      }
    }
    
    // Sync election to database (upsert)
    try {
      await prisma.election.upsert({
        where: { id: req.params.id },
        update: {
          name: election.name,
          description: election.description || null,
          startTime: new Date(election.startTime),
          endTime: new Date(election.endTime),
          status: election.status as any,
        },
        create: {
          id: election.id,
          name: election.name,
          description: election.description || null,
          startTime: new Date(election.startTime),
          endTime: new Date(election.endTime),
          status: election.status as any,
          createdBy: election.createdBy || 'system',
        },
      });
      console.log(`✅ Election ${req.params.id} synced to database`);
    } catch (dbErr: any) {
      console.warn(`⚠️ Failed to sync election ${req.params.id} to database:`, dbErr.message);
      // Continue even if database sync fails - return blockchain data
    }
    
    res.json({ ...election, onChain: true });
  } catch (err: any) {
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
    const positions = await prisma.position.findMany({
      where: { electionId: id },
      orderBy: { order: 'asc' },
    });

    // Get candidates from database for each position
    const positionsWithCandidates = await Promise.all(
      positions.map(async (position) => {
        const candidates = await prisma.candidate.findMany({
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
      })
    );

    res.json(positionsWithCandidates);
  } catch (err: any) {
    console.error('GetPositions error:', err);
    res.status(400).json({ error: err.message || 'GetPositions failed' });
  }
});

// --- Paper ballot (hybrid): check-in, issuance (private mapping), scanner validate/confirm ---

/** List eligible voters with paper status for an election (Not Issued / Issued / Voted). */
app.get('/elections/:id/paper-check-in', async (req, res) => {
  const { id: electionId } = req.params;
  /** full = all CAS-eligible (for issuing tokens). active = only voters with digital vote or paper row for this election. */
  const scope = String(req.query.scope ?? 'full');
  try {
    const digitalVotes = await prisma.vote.findMany({
      where: { electionId },
      select: { voterId: true },
    });
    const votedDigital = new Set(digitalVotes.map((v) => v.voterId));

    const rosterIds = await getElectionRosterVoterIds(electionId);
    const voters = await prisma.voter.findMany({
      where: {
        id: rosterIds.length > 0 ? { in: rosterIds } : { in: [] },
        college: 'CAS',
        status: 'ENROLLED',
        isEligible: true,
      },
      orderBy: { studentNumber: 'asc' },
    });
    const issRows = await prisma.$queryRaw<
      Array<{
        voterId: number;
        ballotToken: string;
        used: number | bigint | boolean;
      }>
    >`
      SELECT "voterId", "ballotToken", "used"
      FROM "PaperBallotIssuance"
      WHERE "electionId" = ${electionId}
    `;
    const isUsed = (u: number | bigint | boolean) =>
      u === true || u === 1 || u === BigInt(1);
    const byVoterId = new Map(issRows.map((i) => [i.voterId, i]));

    const rows = voters
      .map((v) => {
        const iss = byVoterId.get(v.id);
        let paperStatus: 'Not Issued' | 'Issued' | 'Voted';
        if (!iss) paperStatus = 'Not Issued';
        else if (isUsed(iss.used)) paperStatus = 'Voted';
        else paperStatus = 'Issued';

        const digital = votedDigital.has(v.studentNumber);
        const hasElectionActivity =
          digital || paperStatus !== 'Not Issued';

        return {
          voterId: v.id,
          studentNumber: v.studentNumber,
          name: v.fullName,
          paperStatus,
          ballotToken: iss ? iss.ballotToken : null,
          votedDigital: digital,
          hasElectionActivity,
        };
      })
      .filter((row) => (scope === 'active' ? row.hasElectionActivity : true));

    res.json({ electionId, scope, voters: rows });
  } catch (err: any) {
    console.error('GET /elections/:id/paper-check-in error:', err);
    res.status(500).json({ error: err.message || 'paper-check-in failed' });
  }
});

/** Issue or re-print a paper ballot token (private: voterId ↔ ballotToken). */
app.post('/elections/:id/paper-ballots/issue', async (req, res) => {
  const { id: electionId } = req.params;
  const voterId = Number(req.body?.voterId);
  const templateVersion = String(req.body?.templateVersion ?? 'ballot-template-v1');

  if (!Number.isFinite(voterId)) {
    return res.status(400).json({ error: 'voterId (number) is required' });
  }

  try {
    const voter = await prisma.voter.findUnique({ where: { id: voterId } });
    if (!voter) {
      return res.status(404).json({ error: 'Voter not found' });
    }
    if (voter.college !== 'CAS' || voter.status !== 'ENROLLED' || !voter.isEligible) {
      return res.status(403).json({ error: 'Voter is not eligible for this election' });
    }

    const onRoster = await isVoterOnElectionRoster(electionId, voter.id);
    if (!onRoster) {
      return res.status(403).json({
        error: 'Voter is not on the student voter roster for this election',
      });
    }

    const existingRows = await prisma.$queryRaw<
      Array<{
        ballotToken: string;
        used: number | bigint | boolean;
        templateVersion: string;
      }>
    >`
      SELECT "ballotToken", "used", "templateVersion"
      FROM "PaperBallotIssuance"
      WHERE "electionId" = ${electionId} AND "voterId" = ${voterId}
      LIMIT 1
    `;
    const existing = existingRows[0];
    const usedFlag = (u: number | bigint | boolean) =>
      u === true || u === 1 || u === BigInt(1);

    if (existing && usedFlag(existing.used)) {
      return res.status(400).json({ error: 'This voter has already cast a paper ballot' });
    }

    if (voter.hasVoted && !existing) {
      return res.status(400).json({
        error: 'Voter has already voted (digital). Cannot issue paper ballot.',
      });
    }

    if (existing && !usedFlag(existing.used)) {
      return res.json({
        electionId,
        ballotToken: existing.ballotToken,
        templateVersion: existing.templateVersion,
        voterId: voter.id,
        studentNumber: voter.studentNumber,
        reprint: true,
      });
    }

    let ballotToken = generateBallotToken();
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = await prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*) AS c FROM "PaperBallotIssuance" WHERE "ballotToken" = ${ballotToken}
      `;
      if (Number(clash[0]?.c ?? 0) === 0) break;
      ballotToken = generateBallotToken();
    }

    const rowId = crypto.randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "PaperBallotIssuance" (
        "id", "ballotToken", "electionId", "voterId", "used", "templateVersion"
      ) VALUES (
        ${rowId}, ${ballotToken}, ${electionId}, ${voter.id}, 0, ${templateVersion}
      )
    `;

    res.status(201).json({
      electionId,
      ballotToken,
      templateVersion,
      voterId: voter.id,
      studentNumber: voter.studentNumber,
      reprint: false,
    });
  } catch (err: any) {
    console.error('POST paper-ballots/issue error:', err);
    res.status(500).json({ error: err.message || 'issue failed' });
  }
});

/** Admin: list issued paper tokens + stats (for Token Status page). */
app.get('/elections/:id/paper-tokens', async (req, res) => {
  const { id: electionId } = req.params;
  try {
    // Use $queryRaw so this works even if `prisma generate` was not run after adding
    // PaperBallotIssuance (avoids undefined prisma.paperBallotIssuance.findMany).
    const rows = await prisma.$queryRaw<
      Array<{
        ballotToken: string;
        used: number | bigint | boolean;
        issuedAt: Date | string;
        usedAt: Date | string | null;
        studentNumber: string;
      }>
    >`
      SELECT
        p."ballotToken" AS "ballotToken",
        p."used" AS "used",
        p."issuedAt" AS "issuedAt",
        p."usedAt" AS "usedAt",
        v."studentNumber" AS "studentNumber"
      FROM "PaperBallotIssuance" AS p
      INNER JOIN "Voter" AS v ON v."id" = p."voterId"
      WHERE p."electionId" = ${electionId}
      ORDER BY p."issuedAt" DESC
    `;

    const isUsed = (u: number | bigint | boolean) =>
      u === true || u === 1 || u === BigInt(1);

    const used = rows.filter((r) => isUsed(r.used)).length;
    const toIso = (d: Date | string) =>
      d instanceof Date ? d.toISOString() : new Date(d).toISOString();

    const tokens = rows.map((i) => ({
      studentNumber: i.studentNumber,
      ballotToken: i.ballotToken,
      timeCreated: toIso(i.issuedAt),
      status: (isUsed(i.used) ? 'Used' : 'Unused') as 'Used' | 'Unused',
      timeUsed: i.usedAt != null ? toIso(i.usedAt) : undefined,
    }));

    res.json({
      electionId,
      stats: {
        totalIssued: rows.length,
        used,
        unused: rows.length - used,
      },
      tokens,
    });
  } catch (err: any) {
    console.error('GET paper-tokens error:', err);
    const msg = err?.message || String(err);
    if (/no such table|SQLITE_ERROR.*PaperBallotIssuance/i.test(msg)) {
      return res.status(503).json({
        error:
          'Paper ballot tables are missing. In gateway-api run: npx prisma db push && npx prisma generate',
      });
    }
    res.status(500).json({ error: msg || 'paper-tokens failed' });
  }
});

/**
 * Bulk-issue paper ballot tokens for every eligible voter who does not yet have an issuance
 * for this election (skips voters who already voted digitally without a paper record).
 */
app.post('/elections/:id/paper-tokens/generate-all', async (req, res) => {
  const { id: electionId } = req.params;
  const templateVersion = String(req.body?.templateVersion ?? 'ballot-template-v1');

  try {
    const rosterIds = await getElectionRosterVoterIds(electionId);
    if (rosterIds.length === 0) {
      return res.json({
        ok: true,
        electionId,
        created: 0,
        eligibleVoters: 0,
        errors: [],
        errorCount: 0,
        message: 'No student voters on the roster for this election. Add voters to the election roster first.',
      });
    }

    const eligible = await prisma.voter.findMany({
      where: {
        id: { in: rosterIds },
        college: 'CAS',
        status: 'ENROLLED',
        isEligible: true,
      },
      select: { id: true, hasVoted: true },
    });
    const issuedRows = await prisma.$queryRaw<Array<{ voterId: number }>>`
      SELECT "voterId" FROM "PaperBallotIssuance" WHERE "electionId" = ${electionId}
    `;
    const alreadyIssued = new Set(issuedRows.map((r) => r.voterId));

    const isTruthy = (x: number | bigint | boolean) =>
      x === true || x === 1 || x === BigInt(1);

    let created = 0;
    const errors: string[] = [];

    for (const v of eligible) {
      if (alreadyIssued.has(v.id)) continue;
      if (isTruthy(v.hasVoted)) continue;

      let ballotToken = generateBallotToken();
      for (let a = 0; a < 10; a++) {
        const clash = await prisma.$queryRaw<Array<{ c: bigint }>>`
          SELECT COUNT(*) AS c FROM "PaperBallotIssuance" WHERE "ballotToken" = ${ballotToken}
        `;
        const n = Number(clash[0]?.c ?? 0);
        if (n === 0) break;
        ballotToken = generateBallotToken();
      }

      const rowId = crypto.randomUUID();
      try {
        await prisma.$executeRaw`
          INSERT INTO "PaperBallotIssuance" (
            "id", "ballotToken", "electionId", "voterId", "used", "templateVersion"
          ) VALUES (
            ${rowId}, ${ballotToken}, ${electionId}, ${v.id}, 0, ${templateVersion}
          )
        `;
        created += 1;
        alreadyIssued.add(v.id);
      } catch (e: any) {
        errors.push(`voter ${v.id}: ${e?.message || e}`);
      }
    }

    res.json({
      ok: true,
      electionId,
      created,
      eligibleVoters: eligible.length,
      errors: errors.slice(0, 20),
      errorCount: errors.length,
    });
  } catch (err: any) {
    console.error('POST paper-tokens/generate-all error:', err);
    res.status(500).json({ error: err.message || 'generate-all failed' });
  }
});

/** Scanner: validate QR payload — token exists for election and is not used. Returns mock selections (OpenCV placeholder). */
app.post('/scanner/validate', async (req, res) => {
  const electionId = String(req.body?.electionId ?? '');
  const ballotToken = String(req.body?.ballotToken ?? '');
  const templateVersion = String(req.body?.templateVersion ?? '');

  if (!electionId || !ballotToken) {
    return res.status(400).json({ error: 'electionId and ballotToken are required' });
  }

  try {
    const issuance = await prisma.paperBallotIssuance.findFirst({
      where: { electionId, ballotToken },
    });

    if (!issuance) {
      return res.status(404).json({ ok: false, error: 'UNKNOWN_TOKEN' });
    }

    if (templateVersion && issuance.templateVersion !== templateVersion) {
      return res.status(400).json({ ok: false, error: 'TEMPLATE_MISMATCH' });
    }

    if (issuance.used) {
      return res.status(400).json({ ok: false, error: 'TOKEN_USED' });
    }

    const positions = await prisma.position.findMany({
      where: { electionId },
      orderBy: { order: 'asc' },
    });
    const mockSelections: Record<string, string> = {};
    for (const p of positions) {
      const first = await prisma.candidate.findFirst({
        where: { electionId, positionId: p.id },
        orderBy: { name: 'asc' },
      });
      if (first) mockSelections[p.id] = first.id;
    }

    res.json({
      ok: true,
      electionId,
      ballotToken,
      templateVersion: issuance.templateVersion,
      mockSelections,
    });
  } catch (err: any) {
    console.error('POST /scanner/validate error:', err);
    res.status(500).json({ error: err.message || 'validate failed' });
  }
});

/** Scanner: confirm paper vote — public anonymous record + mark issuance used (no voterId on vote). */
app.post('/scanner/confirm-vote', async (req, res) => {
  const electionId = String(req.body?.electionId ?? '');
  const ballotToken = String(req.body?.ballotToken ?? '');
  const templateVersion = String(req.body?.templateVersion ?? 'ballot-template-v1');
  const ciphertextB64 = String(req.body?.ciphertextB64 ?? 'mock-encrypted-data');
  const selections = req.body?.selections;

  if (!electionId || !ballotToken || typeof selections !== 'object' || selections === null) {
    return res.status(400).json({
      error: 'electionId, ballotToken, and selections object are required',
    });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const issuance = await tx.paperBallotIssuance.findFirst({
        where: { electionId, ballotToken },
      });
      if (!issuance) {
        throw Object.assign(new Error('UNKNOWN_TOKEN'), { code: 404 });
      }
      if (issuance.used) {
        throw Object.assign(new Error('TOKEN_USED'), { code: 400 });
      }
      if (issuance.templateVersion !== templateVersion) {
        throw Object.assign(new Error('TEMPLATE_MISMATCH'), { code: 400 });
      }

      const castAt = new Date();

      await tx.paperAnonymousVote.create({
        data: {
          electionId,
          ballotToken,
          ciphertextB64,
          selectionsJson: selections as object,
          templateVersion,
          castAt,
        },
      });

      await tx.paperBallotIssuance.update({
        where: { id: issuance.id },
        data: { used: true, usedAt: castAt },
      });

      await tx.voter.update({
        where: { id: issuance.voterId },
        data: { hasVoted: true, votedAt: castAt },
      });

      return { castAt: castAt.toISOString() };
    });

    res.json({
      ok: true,
      ballotToken,
      ciphertextB64,
      castAt: result.castAt,
      templateVersion,
    });
  } catch (err: any) {
    if (err.code === 404) {
      return res.status(404).json({ error: err.message });
    }
    if (err.code === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error('POST /scanner/confirm-vote error:', err);
    res.status(500).json({ error: err.message || 'confirm-vote failed' });
  }
});

// 2b) Get candidates for a position (from blockchain)
app.get('/elections/:id/positions/:positionId/candidates', async (req, res) => {
  const { id, positionId } = req.params;
  try {
    const contract = await getContract();
    const bytes = await contract.evaluateTransaction('GetCandidatesByPosition', id, positionId);
    const responseText = Buffer.from(bytes).toString('utf8').trim();
    if (!responseText) {
      throw new Error('Empty response from chaincode');
    }
    res.json(JSON.parse(responseText));
  } catch (err: any) {
  console.error('GetCandidatesByPosition error:', err);
res.status(400).json({ error: err.message || 'GetCandidatesByPosition failed' });
  }
});

// 2c) Create/Add candidates to database and blockchain
app.post('/elections/:id/candidates', async (req, res) => {
  const { id } = req.params;
  const { candidates } = req.body; // Array of { positionName, name, party, yearLevel, program? }

  if (!Array.isArray(candidates) || candidates.length === 0) {return res.status(400).json({ error: 'candidates array is required' });
  }

  try {
    // Get all positions to map position names to IDs
    const positions = await prisma.position.findMany({
      where: { electionId: id },
    });
    const positionMap = new Map(positions.map(p => [p.name, p]));

    const contract = await getContract();
    const createdCandidates: any[] = [];

    for (const candidateData of candidates) {
      const { positionName, name, party, yearLevel, program } = candidateData;

      if (!positionName || !name) {
        continue; // Skip invalid candidates
      }

      const position = positionMap.get(positionName);
      if (!position) {continue;
      }

      // Generate candidate ID
      const existingCount = await prisma.candidate.count({
        where: {
          electionId: id,
          positionId: position.id,
        },
      });
      const candidateId = `cand-${position.id}-${existingCount + 1}`;

      // Save to database
      const candidate = await prisma.candidate.upsert({
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
            await contract.submitTransaction(
              'RegisterCandidate',
              id,
              position.id,
              candidateId,
              name,
              party || 'Independent',
              program || '',
              yearLevel || ''
            );
            console.log(`✅ Candidate ${candidateId} registered on blockchain`);
          } else {
            console.warn(`⚠️ Skipping blockchain registration: Election ${id} is ${election.status} (must be DRAFT)`);
          }
        }
      } catch (blockchainErr: any) {
        console.warn(`⚠️ Failed to register candidate ${candidateId} on blockchain:`, blockchainErr.message);
        // Continue even if blockchain registration fails - candidate is in database
      }

      createdCandidates.push(candidate);
    }
    res.json({ ok: true, candidates: createdCandidates, count: createdCandidates.length });
  } catch (err: any) {
    console.error('CreateCandidates error:', err);
    res.status(400).json({ error: err.message || 'CreateCandidates failed' });
  }
});

// 2.5) Update election (update name, description, dates)
app.put('/elections/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, startTime, endTime } = req.body;

  // Validation
  if (!name || !startTime || !endTime) {return res.status(400).json({
      error: 'name, startTime, and endTime are required',
    });
  }

  try {
    const contract = await getContract();

    // Retry logic for MVCC conflict
    let lastError: any = null;
    let success = false;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await contract.submitTransaction(
          'UpdateElection',
          id,
          name,
          description || '',
          startTime,
          endTime
        );

        success = true;
        break;
      } catch (err: any) {
        lastError = err;

        // MVCC conflict handling
        if (err.code === 11 && attempt < maxRetries) {
          console.warn(`⚠️ MVCC_READ_CONFLICT on attempt ${attempt}, retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
          continue;
        }

        throw err;
      }
    }

    if (!success) {
      throw lastError;
    }

    // Database update (after blockchain success)
    try {
      await prisma.election.upsert({
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
    } catch (dbErr: any) {
      console.warn(
        `⚠️ Failed to update election ${id} in database:`,
        dbErr.message
      );
      // Continue since blockchain update succeeded
    }

    // Send response first
    res.json({ ok: true, message: 'Election updated successfully' });

  } catch (err: any) {
    console.error('UpdateElection error:', err);

    // MVCC conflict response
    if (err.code === 11) {
      return res.status(409).json({
        error:
          'Transaction conflict: Another update is in progress. Please try again in a moment.',
        code: 'MVCC_READ_CONFLICT',
        hint: 'This usually happens when multiple updates occur simultaneously. Retry the request.',
      });
    }

    res.status(400).json({
      error: err.message || 'UpdateElection failed',
    });
  }
});

/** Delete election from database (votes, roster, positions, etc.) and remove ledger world state. */
app.delete('/elections/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Election id is required' });
  }

  try {
    const existing = await prisma.election.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Election not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.vote.deleteMany({ where: { electionId: id } });
      await tx.paperBallotIssuance.deleteMany({ where: { electionId: id } });
      await tx.paperAnonymousVote.deleteMany({ where: { electionId: id } });
      await tx.candidate.deleteMany({ where: { electionId: id } });
      await tx.position.deleteMany({ where: { electionId: id } });
      await tx.ballot.deleteMany({ where: { electionId: id } });
      await tx.auditLog.deleteMany({ where: { electionId: id } });
      await (tx as typeof prisma).electionVoter.deleteMany({
        where: { electionId: id },
      });
      await tx.election.delete({ where: { id } });
    });

    try {
      const contract = await getContract();
      await contract.submitTransaction('DeleteElection', id);
    } catch (ledgerErr: any) {
      console.warn(
        `⚠️ Election ${id} removed from database but ledger delete failed (redeploy chaincode if needed):`,
        ledgerErr?.message || ledgerErr
      );
    }

    res.json({ ok: true, id });
  } catch (err: any) {
    console.error('DELETE /elections/:id error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete election' });
  }
});

// 3) Open election (change status from DRAFT to OPEN)
app.post('/elections/:id/open', async (req, res) => {
  const { id } = req.params;

  try {
    const contract = await getContract();
    await contract.submitTransaction('OpenElection', id);

    res.json({ ok: true });
  } catch (err: any) {
    console.error('OpenElection error:', err);
    res.status(400).json({
      error: err.message || 'OpenElection failed',
    });
  }
});


// 3.5) Close election (change status from OPEN to CLOSED)
app.post('/elections/:id/close', async (req, res) => {
  const { id } = req.params;

  try {
    const contract = await getContract();
    await contract.submitTransaction('CloseElection', id);

    res.json({ ok: true });
  } catch (err: any) {
    console.error('CloseElection error:', err);
    res.status(400).json({
      error: err.message || 'CloseElection failed',
    });
  }
});

/**
 * CAS-eligible voter rows with hasVotedThisElection (digital Vote or paper ballot used for this election).
 */
async function augmentVotersWithElectionVoteStatus(
  electionId: string,
  voters: Awaited<ReturnType<typeof prisma.voter.findMany>>
) {
  const digitalVotes = await prisma.vote.findMany({
    where: { electionId },
    select: { voterId: true },
  });
  const digitalSet = new Set(digitalVotes.map((v) => v.voterId));

  const usedPaper = await prisma.paperBallotIssuance.findMany({
    where: { electionId, used: true },
    select: { voterId: true },
  });
  const paperVoterIds = [...new Set(usedPaper.map((p) => p.voterId))];
  const paperVoters =
    paperVoterIds.length === 0
      ? []
      : await prisma.voter.findMany({
          where: { id: { in: paperVoterIds } },
          select: { studentNumber: true },
        });
  const paperVotedSns = new Set(paperVoters.map((v) => v.studentNumber));

  return voters.map((v) => ({
    ...v,
    hasVotedThisElection:
      digitalSet.has(v.studentNumber) || paperVotedSns.has(v.studentNumber),
  }));
}

/**
 * GET /elections/:id/voters — voters for the selected election (not the global /voters registry).
 * pool=eligible (default): CAS + ENROLLED + isEligible (same cohort as paper-check-in and turnout).
 * pool=active: only voters with a digital vote or a paper ballot issuance for this election (still CAS-eligible).
 */
app.get('/elections/:id/voters', async (req, res) => {
  const { id: electionId } = req.params;
  const pool = String(req.query.pool ?? 'eligible');
  try {
    const election = await prisma.election.findUnique({ where: { id: electionId } });
    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }

    const rosterIds = await getElectionRosterVoterIds(electionId);
    const rosterFilter =
      rosterIds.length > 0 ? ({ id: { in: rosterIds } } as const) : ({ id: { in: [] as number[] } } as const);

    const baseWhere = {
      college: 'CAS' as const,
      status: 'ENROLLED' as const,
      isEligible: true,
    };

    if (pool === 'active') {
      const voteSns = await prisma.vote.findMany({
        where: { electionId },
        select: { voterId: true },
      });
      const sns = new Set(voteSns.map((v) => v.voterId));

      const paperIss = await prisma.paperBallotIssuance.findMany({
        where: { electionId },
        select: { voterId: true },
      });
      const paperVoterIds = [...new Set(paperIss.map((p) => p.voterId))];
      if (paperVoterIds.length > 0) {
        const pv = await prisma.voter.findMany({
          where: { id: { in: paperVoterIds } },
          select: { studentNumber: true },
        });
        pv.forEach((v) => sns.add(v.studentNumber));
      }

      if (sns.size === 0 || rosterIds.length === 0) {
        return res.json({ electionId, pool: 'active', voters: [] });
      }

      const voters = await prisma.voter.findMany({
        where: {
          ...baseWhere,
          ...rosterFilter,
          studentNumber: { in: [...sns] },
        },
        orderBy: { studentNumber: 'asc' },
      });
      const augmented = await augmentVotersWithElectionVoteStatus(electionId, voters);
      return res.json({ electionId, pool: 'active', voters: augmented });
    }

    const voters = await prisma.voter.findMany({
      where: {
        ...baseWhere,
        ...rosterFilter,
      },
      orderBy: { studentNumber: 'asc' },
    });
    const augmented = await augmentVotersWithElectionVoteStatus(electionId, voters);
    res.json({ electionId, pool: 'eligible', voters: augmented });
  } catch (err: any) {
    console.error('GET /elections/:id/voters error:', err);
    res.status(500).json({ error: err.message || 'failed to load election voters' });
  }
});

/** Add all CAS enrolled eligible voters to this election roster (idempotent). */
app.post('/elections/:id/voters/roster/sync-cas-eligible', async (req, res) => {
  const { id: electionId } = req.params;
  try {
    const election = await prisma.election.findUnique({ where: { id: electionId } });
    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }
    const voters = await prisma.voter.findMany({
      where: { college: 'CAS', status: 'ENROLLED', isEligible: true },
      select: { id: true },
    });
    let added = 0;
    for (const v of voters) {
      try {
        await prisma.electionVoter.create({
          data: { electionId, voterId: v.id },
        });
        added += 1;
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2002') throw e;
      }
    }
    const count = await prisma.electionVoter.count({ where: { electionId } });
    res.json({ ok: true, electionId, added, totalOnRoster: count });
  } catch (err: any) {
    console.error('POST sync-cas-eligible error:', err);
    res.status(500).json({ error: err.message || 'sync failed' });
  }
});

app.delete('/elections/:id/voters/roster/:voterId', async (req, res) => {
  const { id: electionId, voterId: vid } = req.params;
  const voterId = Number(vid);
  if (!Number.isFinite(voterId)) {
    return res.status(400).json({ error: 'Invalid voterId' });
  }
  try {
    await prisma.electionVoter.deleteMany({
      where: { electionId, voterId },
    });
    res.json({ ok: true, electionId, voterId });
  } catch (err: any) {
    console.error('DELETE roster error:', err);
    res.status(500).json({ error: err.message || 'delete failed' });
  }
});

app.post('/elections/:id/voters/roster', async (req, res) => {
  const { id: electionId } = req.params;
  const voterIds = req.body?.voterIds;
  if (!Array.isArray(voterIds) || voterIds.length === 0) {
    return res.status(400).json({ error: 'voterIds (non-empty array) is required' });
  }
  const ids = voterIds
    .map((x: unknown) => Number(x))
    .filter((n: number) => Number.isFinite(n));
  try {
    const election = await prisma.election.findUnique({ where: { id: electionId } });
    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }
    let added = 0;
    for (const voterId of ids) {
      try {
        await prisma.electionVoter.create({
          data: { electionId, voterId },
        });
        added += 1;
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code !== 'P2002') throw e;
      }
    }
    res.json({ ok: true, electionId, added });
  } catch (err: any) {
    console.error('POST roster error:', err);
    res.status(500).json({ error: err.message || 'failed' });
  }
});

// 4) Register voter (chaincode) — also adds SQLite roster row when voter exists in registry
app.post('/elections/:id/voters', async (req, res) => {
  const { id } = req.params;
  const { voterId } = req.body;

  if (!voterId) {
    return res.status(400).json({ error: 'voterId is required' });
  }

  try {
    const contract = await getContract();
    await contract.submitTransaction('RegisterVoter', id, voterId);

    const v = await prisma.voter.findUnique({
      where: { studentNumber: String(voterId).trim() },
    });
    if (v) {
      await prisma.electionVoter.upsert({
        where: {
          electionId_voterId: { electionId: id, voterId: v.id },
        },
        create: { electionId: id, voterId: v.id },
        update: {},
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({
      error: err.message || 'RegisterVoter failed',
    });
  }
});

// 5) Cast vote
app.post('/elections/:id/votes', async (req, res) => {
  const { id } = req.params;
  const { studentNumber, selections } = req.body;

  if (!studentNumber || !Array.isArray(selections)) {
    return res.status(400).json({
      error: 'studentNumber and selections[] are required',
    });
  }

  try {
    // --- 1) OFF-CHAIN VALIDATION ---
    const voter = await prisma.voter.findUnique({
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

    const onRoster = await isVoterOnElectionRoster(id, voter.id);
    if (!onRoster) {
      return res.status(403).json({
        error: 'You are not registered as a student voter for this election',
      });
    }

    if (voter.hasVoted) {
      return res.status(403).json({ error: 'Voter has already cast their vote' });
    }

    // --- Mark voter as voted ---
    await prisma.voter.update({
      where: { studentNumber },
      data: {
        hasVoted: true,
        votedAt: new Date(),
      },
    });

    // --- 2) BLOCKCHAIN ---
    const contract = await getContract();
    const selectionsJson = JSON.stringify(selections);

    let transactionId: string;

    try {
      const proposal = contract.newProposal('CastVote', {
        arguments: [id, studentNumber, selectionsJson],
      });

      transactionId = proposal.getTransactionId();

      const transaction = await proposal.endorse();
      await transaction.submit();

    } catch (blockchainErr: any) {
      // rollback voter
      await prisma.voter.update({
        where: { studentNumber },
        data: {
          hasVoted: false,
          votedAt: null,
        },
      });
      throw blockchainErr;
    }

    // --- 3) Save vote ---
    const vote = await prisma.vote.create({
      data: {
        electionId: id,
        voterId: studentNumber,
        selections,
        txId: transactionId,
        castAt: new Date(),
      },
    });

    // --- 4) Audit log (already correct) ---
    await prisma.auditLog.create({
      data: {
        electionId: id,
        voterId: studentNumber,
        action: 'CAST_VOTE',
        txId: transactionId,
        details: {
          selections,
          voteId: vote.id,
        },
      },
    });

    // ✅ Success log
    res.json({
      ok: true,
      message: 'Vote recorded successfully',
      transactionId,
      voteId: vote.id,
    });
  } catch (err: any) {
    console.error('[Vote] Error:', err);

    const errorMessage = err.message ?? 'Internal server error';

    if (
      errorMessage.includes('endorsement') ||
      errorMessage.includes('ABORTED') ||
      err.code === 10
    ) {
      try {
        if (studentNumber) {
          await prisma.voter.update({
            where: { studentNumber },
            data: {
              hasVoted: false,
              votedAt: null,
            },
          });
        }
      } catch (rollbackErr: any) {
        console.error('[Vote] Rollback failed:', rollbackErr);
      }

      return res.status(500).json({
        error: 'Blockchain transaction failed',
        details: errorMessage,
        code: err.code,
      });
    }

    return res.status(500).json({
      error: errorMessage,
    });
  }
});

// 6) Get results
app.get('/elections/:id/results', async (req, res) => {
  const { id } = req.params;

  try {
    const contract = await getContract();
    const bytes = await contract.evaluateTransaction('GetElectionResults', id);
    const responseText = Buffer.from(bytes).toString('utf8').trim();

    if (!responseText) {
      throw new Error('Empty response from chaincode');
    }

    res.json(JSON.parse(responseText));

  } catch (err: any) {
    console.error('GetElectionResults error:', err);
res.status(400).json({
      error: err.message || 'GetElectionResults failed',
    });
  }
});

// 7) Get transaction ID for a voter's vote
app.get('/elections/:id/voters/:voterId/transaction', async (req, res) => {
  const { id, voterId } = req.params;

  try {
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        electionId: id,
        voterId: voterId,
        action: 'CAST_VOTE',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!auditLog || !auditLog.txId) {return res.status(404).json({
        error: 'Transaction ID not found for this voter',
      });
    }

    res.json({
      electionId: id,
      voterId: voterId,
      transactionId: auditLog.txId,
      castAt: auditLog.createdAt,
      details: auditLog.details,
    });

  } catch (err: any) {
    console.error('GetTransactionId error:', err);
    res.status(400).json({ error: err.message || 'GetTransactionId failed' });
  }
});

/**
 * Eligible CAS pool + who voted in this election (on-chain Vote rows + paper issuances used).
 * Shared by GET /dashboard and GET /turnout.
 */
async function computeElectionTurnout(electionId: string) {
  const baseWhere = {
    college: 'CAS' as const,
    status: 'ENROLLED' as const,
    isEligible: true,
  };

  const rosterIds = await getElectionRosterVoterIds(electionId);
  const rosterWhere =
    rosterIds.length > 0
      ? { id: { in: rosterIds } as const }
      : { id: { in: [] as number[] } as const };

  const allVoters = await prisma.voter.findMany({
    where: {
      ...baseWhere,
      ...rosterWhere,
    },
    select: {
      studentNumber: true,
      department: true,
      yearLevel: true,
      program: true,
    },
  });

  const digitalVotes = await prisma.vote.findMany({
    where: { electionId },
    select: { voterId: true },
  });
  const votedDigital = new Set(digitalVotes.map((v) => v.voterId));

  const usedPaper = await prisma.paperBallotIssuance.findMany({
    where: { electionId, used: true },
    select: { voterId: true },
  });
  const paperVoterIds = Array.from(new Set(usedPaper.map((p) => p.voterId))) as number[];
  const paperVoterRows =
    paperVoterIds.length > 0
      ? await prisma.voter.findMany({
          where: { id: { in: paperVoterIds } },
          select: { studentNumber: true },
        })
      : [];
  const votedPaper = new Set(paperVoterRows.map((v) => v.studentNumber));

  const votedInElection = new Set<string>([...votedDigital, ...votedPaper]);

  const eligibleNumbers = new Set(allVoters.map((v) => v.studentNumber));
  const votedCount = [...votedInElection].filter((sn) => eligibleNumbers.has(sn)).length;
  const totalVoters = allVoters.length;
  const notVotedCount = totalVoters - votedCount;

  const votedFor = (studentNumber: string) => votedInElection.has(studentNumber);

  const departmentMap = new Map<string, { total: number; voted: number }>();
  allVoters.forEach((voter) => {
    const dept = voter.department || 'Unknown';
    if (!departmentMap.has(dept)) {
      departmentMap.set(dept, { total: 0, voted: 0 });
    }
    const stats = departmentMap.get(dept)!;
    stats.total++;
    if (votedFor(voter.studentNumber)) stats.voted++;
  });

  const byDepartment = Array.from(departmentMap.entries()).map(([name, stats]) => ({
    name,
    total: stats.total,
    voted: stats.voted,
    notVoted: stats.total - stats.voted,
  }));

  const yearLevelMap = new Map<number, { total: number; voted: number }>();
  allVoters.forEach((voter) => {
    const year = voter.yearLevel ?? 0;
    if (!yearLevelMap.has(year)) {
      yearLevelMap.set(year, { total: 0, voted: 0 });
    }
    const stats = yearLevelMap.get(year)!;
    stats.total++;
    if (votedFor(voter.studentNumber)) stats.voted++;
  });

  const byYearLevel = Array.from(yearLevelMap.entries())
    .map(([yearLevel, stats]) => ({
      yearLevel,
      total: stats.total,
      voted: stats.voted,
      notVoted: stats.total - stats.voted,
    }))
    .sort((a, b) => a.yearLevel - b.yearLevel);

  const programMap = new Map<string, { total: number; voted: number }>();
  allVoters.forEach((voter) => {
    const program = voter.program || 'Unknown';
    if (!programMap.has(program)) {
      programMap.set(program, { total: 0, voted: 0 });
    }
    const stats = programMap.get(program)!;
    stats.total++;
    if (votedFor(voter.studentNumber)) stats.voted++;
  });

  const byProgram = Array.from(programMap.entries()).map(([program, stats]) => ({
    program,
    total: stats.total,
    voted: stats.voted,
    notVoted: stats.total - stats.voted,
  }));

  return {
    electionId,
    totalVoters,
    votedCount,
    notVotedCount,
    byDepartment,
    byYearLevel,
    byProgram,
  };
}

// 8) Get dashboard statistics for an election
app.get('/elections/:id/dashboard', async (req, res) => {
  const { id } = req.params;
  try {
    const turnout = await computeElectionTurnout(id);

    // Get election info from blockchain
    let election: any = null;

    try {
      const contract = await getContract();
      const bytes = await contract.evaluateTransaction('GetElection', id);
      const responseText = Buffer.from(bytes).toString('utf8').trim();

      if (responseText) {
        election = JSON.parse(responseText);

        const now = new Date();
        const endTime = new Date(election.endTime);

        // Auto-close election if expired
        if (election.status === 'OPEN' && now > endTime) {
          try {
            await contract.submitTransaction('CloseElection', id);
            election.status = 'CLOSED';
} catch (closeErr: any) {
            console.warn(`⚠️ Failed to auto-close election ${id}:`, closeErr.message);
}
        }

        // Sync election to DB
        try {
          await prisma.election.upsert({
            where: { id },
            update: {
              name: election.name,
              description: election.description || null,
              startTime: new Date(election.startTime),
              endTime: new Date(election.endTime),
              status: election.status as any,
            },
            create: {
              id: election.id,
              name: election.name,
              description: election.description || null,
              startTime: new Date(election.startTime),
              endTime: new Date(election.endTime),
              status: election.status as any,
              createdBy: election.createdBy || 'system',
            },
          });

        } catch (syncErr: any) {
          console.warn(`⚠️ Failed to sync election ${id}:`, syncErr.message);
}
      }

    } catch (err: any) {
      console.warn('Could not fetch election from blockchain:', err.message);
}

    // Get recent announcements
    const announcements = await prisma.auditLog.findMany({
      where: {
        electionId: id,
        action: { not: 'CAST_VOTE' },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    res.json({
      election,
      statistics: {
        totalVoters: turnout.totalVoters,
        votedCount: turnout.votedCount,
        notVotedCount: turnout.notVotedCount,
        byDepartment: turnout.byDepartment,
        byYearLevel: turnout.byYearLevel,
        byProgram: turnout.byProgram,
      },
      announcements: announcements.map((log) => ({
        id: log.id,
        action: log.action,
        txId: log.txId,
        details: log.details,
        createdAt: log.createdAt,
      })),
    });

  } catch (err: any) {
    console.error('GetDashboard error:', err);
res.status(400).json({
      error: err.message || 'GetDashboard failed',
    });
  }
});

// 9) Get all audit logs for an election (for validators)
app.get('/elections/:id/audit-logs', async (req, res) => {
  const { id } = req.params;

  try {
    const auditLogs = await prisma.auditLog.findMany({
      where: { electionId: id },
      orderBy: { createdAt: 'desc' },
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

  } catch (err: any) {
    console.error('GetAuditLogs error:', err);
res.status(400).json({
      error: err.message || 'GetAuditLogs failed',
    });
  }
});

// 10) Get detailed voter turnout statistics (same data as dashboard statistics + breakdowns)
app.get('/elections/:id/turnout', async (req, res) => {
  const { id } = req.params;

  try {
    const data = await computeElectionTurnout(id);
    res.json(data);
  } catch (err: any) {
    console.error('GetTurnout error:', err);
res.status(400).json({
      error: err.message || 'GetTurnout failed',
    });
  }
});

app.get('/elections/:id/hourly-participation', async (req, res) => {
  const { id } = req.params;
  const { date } = req.query; // Optional date filter (YYYY-MM-DD format)


  try {
    const dayFilter = date
      ? {
          castAt: {
            gte: new Date(date as string),
            lt: new Date(new Date(date as string).getTime() + 24 * 60 * 60 * 1000),
          },
        }
      : {};

    const [votes, paperVotes] = await Promise.all([
      prisma.vote.findMany({
        where: {
          electionId: id,
          ...dayFilter,
        },
        select: { castAt: true },
        orderBy: { castAt: 'asc' },
      }),
      prisma.paperAnonymousVote.findMany({
        where: {
          electionId: id,
          ...dayFilter,
        },
        select: { castAt: true },
        orderBy: { castAt: 'asc' },
      }),
    ]);

    // Initialize hourly buckets (24 hours) — local time from stored Date
    const hourlyCounts = new Map<number, number>();
    for (let i = 0; i < 24; i++) {
      hourlyCounts.set(i, 0);
    }

    const bumpHour = (castAt: Date) => {
      const hour = new Date(castAt).getHours();
      hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
    };

    votes.forEach((v) => bumpHour(v.castAt));
    paperVotes.forEach((v) => bumpHour(v.castAt));

    // Convert to array format
    const hourlyData = Array.from(hourlyCounts.entries())
      .map(([hour, count]) => ({
        hour: hour.toString().padStart(2, '0') + ':00',
        count,
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    let peakHour = { hour: '00:00', count: 0 };
    let slowestHour = { hour: '00:00', count: 0 };

    if (hourlyData.length > 0) {
      peakHour = hourlyData.reduce((max, item) =>
        item.count > max.count ? item : max,
        hourlyData[0]
      );

      slowestHour = hourlyData.reduce((min, item) =>
        item.count < min.count ? item : min,
        hourlyData[0]
      );
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
      totalVotes: votes.length + paperVotes.length,
    });

  } catch (err: any) {
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

app.get('/elections/:id/integrity-check', async (req, res) => {
  const { id } = req.params;

  try {
    // Get results from blockchain
    const contract = await getContract();
    const bytes = await contract.evaluateTransaction('GetElectionResults', id);
    const responseText = Buffer.from(bytes).toString('utf8').trim();
    const blockchainResults = responseText ? JSON.parse(responseText) : {};

    // Get vote counts from database
    const dbVotes = await (prisma as any).vote.findMany({
      where: { electionId: id },
      select: { selections: true },
    });

    // Count database votes
    const dbResults: Record<string, Record<string, number>> = {};

    dbVotes.forEach((vote: any) => {
      const selections = vote.selections as Array<{ positionId: string; candidateId: string }>;

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

    // Build comparison sets
    const comparison: Array<{
      position: string;
      candidate: string;
      blockchainCount: number;
      databaseCount: number;
      match: boolean;
    }> = [];

    const allPositions = new Set<string>();
    const allCandidates = new Map<string, Set<string>>();

    // From blockchain
    Object.keys(blockchainResults).forEach((positionId) => {
      allPositions.add(positionId);
      if (!allCandidates.has(positionId)) {
        allCandidates.set(positionId, new Set());
      }
      Object.keys(blockchainResults[positionId]).forEach((candidateId) => {
        allCandidates.get(positionId)!.add(candidateId);
      });
    });

    // From database
    Object.keys(dbResults).forEach((positionId) => {
      allPositions.add(positionId);
      if (!allCandidates.has(positionId)) {
        allCandidates.set(positionId, new Set());
      }
      Object.keys(dbResults[positionId]).forEach((candidateId) => {
        allCandidates.get(positionId)!.add(candidateId);
      });
    });

    // Build comparison results
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

    // Totals
    const totalBlockchainVotes = Object.values(blockchainResults).reduce((sum: number, pos: any) => {
      return sum + Object.values(pos).reduce((posSum: number, count: any) => posSum + count, 0);
    }, 0);

    const totalDatabaseVotes = dbVotes.length;

    const hasMismatch =
      comparison.some((item) => !item.match) ||
      totalBlockchainVotes !== totalDatabaseVotes;

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

  } catch (err: any) {
    console.error('GetIntegrityCheck error:', err);
res.status(400).json({
      error: err.message || 'GetIntegrityCheck failed',
    });
  }
}); 

// Coerce to number so env PORT=4000 is not treated as a named pipe in error messages
const rawPort = process.env.PORT;
const PORT = rawPort !== undefined && rawPort !== '' ? Number(rawPort) : 4000;

// Start the server
let server: any;

try {
  if (Number.isNaN(PORT) || PORT < 1 || PORT > 65535) {
    console.error(`Invalid PORT: ${process.env.PORT}`);
    process.exit(1);
  }

  server = app.listen(PORT, async () => {
    console.log(`eCASVote gateway API listening on http://localhost:${PORT}`);
    console.log('Server is running. Press Ctrl+C to stop.');

    // Log startup (callback must be async to use await)
    try {} catch (logErr) {
      console.error('Failed to log server startup:', logErr);
    }
  });

  // ❗ IMPORTANT: Do NOT use async here
  server.on('error', (error: any) => {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = `Port ${PORT}`;

    switch (error.code) {
      case 'EACCES': {
        const description = `${bind} requires elevated privileges`;
        console.error(description);
process.exit(1);
      }

      case 'EADDRINUSE': {
        const description = `${bind} is already in use`;
        console.error(description);
process.exit(1);
      }

      default:
        throw error;
    }
  });

} catch (error: any) {
  console.error('Failed to start server:', error);

  // ❗ No top-level await → wrap in async IIFE
  (async () => {
    try {} catch (logErr) {
      console.error('Logging failed:', logErr);
    } finally {
      process.exit(1);
    }
  })();
}

const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} signal received: closing HTTP server`);

  try {} catch (logErr) {
    console.error('Failed to log shutdown initiation:', logErr);
  }

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(() => {
    console.log('HTTP server closed');

    prisma.$disconnect()
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

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
gracefulShutdown('uncaughtException');
});