// src/server.ts
import express from 'express';
import bodyParser from 'body-parser';
import { getContract, getNetwork } from './fabricClient';
import { prisma } from './prismaClient';

const app = express();

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

app.use(bodyParser.json());

// Simple health-check
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Login endpoint - validates CAS student eligibility
app.post('/login', async (req, res) => {
  const { studentNumber, upEmail } = req.body;

  if (!studentNumber && !upEmail) {
    await prisma.systemActivity.create({
      data: {
        user: 'Unknown',
        role: 'Voter',
        action: 'Login Attempt',
        description: 'Missing studentNumber and upEmail',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });
    return res.status(400).json({ error: 'studentNumber or upEmail is required' });
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

    if (!voter) {
      await prisma.systemActivity.create({
        data: {
          user: studentNumber || upEmail,
          role: 'Voter',
          action: 'Login Attempt',
          description: 'User not found in voter list',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(404).json({
        error: 'You are not in the official CAS voter list. Please contact the CAS SEB.',
      });
    }

    // 2. Enforce CAS + ENROLLED + isEligible
    if (voter.college !== 'CAS') {
      await prisma.systemActivity.create({
        data: {
          user: voter.studentNumber,
          role: 'Voter',
          action: 'Login Attempt',
          description: 'Non-CAS student tried to login',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(403).json({
        error: 'This election is for CAS students only.',
      });
    }

    if (voter.status !== 'ENROLLED' || !voter.isEligible) {
      await prisma.systemActivity.create({
        data: {
          user: voter.studentNumber,
          role: 'Voter',
          action: 'Login Attempt',
          description: 'User not eligible to vote',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(403).json({
        error: 'You are currently not eligible to vote. Please contact the CAS SEB.',
      });
    }

    await prisma.systemActivity.create({
      data: {
        user: voter.studentNumber,
        role: 'Voter',
        action: 'Login',
        description: `Login successful for ${voter.fullName}`,
        ipAddress: req.ip,
        status: 'Success',
      },
    });

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

    await prisma.systemActivity.create({
      data: {
        user: studentNumber || upEmail || 'Unknown',
        role: 'Voter',
        action: 'Login Error',
        description: err.message || 'Login failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// Validator login endpoint - for Org2 (Adviser/Validator) users
app.post('/login/validator', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    await prisma.systemActivity.create({
      data: {
        user: email || 'Unknown',
        role: 'Validator',
        action: 'Validator Login Attempt',
        description: 'Missing email or password',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await prisma.systemActivity.create({
        data: {
          user: email,
          role: 'Validator',
          action: 'Validator Login Attempt',
          description: 'User not found',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(401).json({
        error: 'Invalid credentials. Please contact the system administrator.',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      await prisma.systemActivity.create({
        data: {
          user: user.email,
          role: user.role,
          action: 'Validator Login Attempt',
          description: 'Account is deactivated',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(403).json({
        error: 'Your account has been deactivated. Please contact the system administrator.',
      });
    }

    // Check if user is a validator
    if (user.role !== 'VALIDATOR') {
      await prisma.systemActivity.create({
        data: {
          user: user.email,
          role: user.role,
          action: 'Unauthorized Login Attempt',
          description: 'Non-validator tried to access validator login',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(403).json({
        error: 'Access denied. This login is for validators only.',
      });
    }

    // Verify password using bcrypt
    const bcrypt = require('bcrypt');
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      await prisma.systemActivity.create({
        data: {
          user: user.email,
          role: user.role,
          action: 'Validator Login Attempt',
          description: 'Incorrect password',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(401).json({
        error: 'Invalid credentials. Please check your email and password.',
      });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await prisma.systemActivity.create({
      data: {
        user: user.email,
        role: user.role, // VALIDATOR
        action: 'Validator Login',
        description: `Validator ${user.fullName} logged in`,
        ipAddress: req.ip,
        status: 'Success',
      },
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

    await prisma.systemActivity.create({
      data: {
        user: email || 'Unknown',
        role: 'Validator',
        action: 'Validator Login Error',
        description: err.message || 'Validator login failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(500).json({ error: err.message || 'Validator login failed' });
  }
});

// Admin login endpoint
app.post('/login/admin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    await prisma.systemActivity.create({
      data: {
        user: email || 'Unknown',
        role: 'Admin',
        action: 'Admin Login Attempt',
        description: 'Missing email or password',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(400).json({ error: 'Email and password are required' });
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

    if (!user) {
      await prisma.systemActivity.create({
        data: {
          user: email,
          role: 'Admin',
          action: 'Admin Login Attempt',
          description: 'User not found',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(401).json({
        error: 'Invalid credentials. Please contact the system administrator.',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      await prisma.systemActivity.create({
        data: {
          user: user.email,
          role: user.role,
          action: 'Admin Login Attempt',
          description: 'Account is deactivated',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(403).json({
        error: 'Your account has been deactivated. Please contact the system administrator.',
      });
    }

    // Check if user is an admin
    if (user.role !== 'ADMIN') {
      await prisma.systemActivity.create({
        data: {
          user: user.email,
          role: user.role,
          action: 'Unauthorized Login Attempt',
          description: 'Non-admin tried to access admin login',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(403).json({
        error: 'Access denied. This login is for administrators only.',
      });
    }

    // Verify password using bcrypt
    const bcrypt = require('bcrypt');
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      await prisma.systemActivity.create({
        data: {
          user: user.email,
          role: user.role,
          action: 'Admin Login Attempt',
          description: 'Incorrect password',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(401).json({
        error: 'Invalid credentials. Please check your email and password.',
      });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await prisma.systemActivity.create({
      data: {
        user: user.email,
        role: user.role, // ADMIN
        action: 'Admin Login',
        description: `Admin ${user.fullName} logged in`,
        ipAddress: req.ip,
        status: 'Success',
      },
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

    await prisma.systemActivity.create({
      data: {
        user: email || 'Unknown',
        role: 'Admin',
        action: 'Admin Login Error',
        description: err.message || 'Admin login failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(500).json({ error: err.message || 'Admin login failed' });
  }
});

// Initialize ledger with default election data (calls InitLedger)
app.post('/init', async (req, res) => {
  const ip = req.ip || 'unknown';

  try {
    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'System',
        action: 'Ledger Init Request',
        description: 'Init ledger endpoint called',
        ipAddress: ip,
        status: 'Success',
      },
    });

    const contract = await getContract();

    // Check if election exists
    let electionExists = false;

    try {
      const electionBuffer = await contract.evaluateTransaction('GetElection', 'election-2025');
      const election = JSON.parse(electionBuffer.toString());

      if (election && election.id === 'election-2025') {
        electionExists = true;

        await prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'System',
            action: 'Ledger Init Skipped',
            description: 'Election already exists',
            ipAddress: ip,
            status: 'Success',
          },
        });

        return res.json({
          ok: true,
          message: 'Ledger already initialized',
          election,
        });
      }
    } catch (err) {
      // not found → continue
    }

    // Init ledger
    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'System',
        action: 'InitLedger Started',
        description: 'Calling InitLedger on blockchain',
        ipAddress: ip,
        status: 'Success',
      },
    });

    await contract.submitTransaction('InitLedger');

    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'System',
        action: 'InitLedger Success',
        description: 'Ledger initialized successfully',
        ipAddress: ip,
        status: 'Success',
      },
    });

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

      await prisma.systemActivity.create({
        data: {
          user: 'system',
          role: 'System',
          action: 'Election Sync',
          description: 'Election synced to database',
          ipAddress: ip,
          status: 'Success',
        },
      });

    } catch (syncErr: any) {
      await prisma.systemActivity.create({
        data: {
          user: 'system',
          role: 'System',
          action: 'Election Sync Failed',
          description: syncErr.message,
          ipAddress: ip,
          status: 'Failed',
        },
      });
    }

    return res.json({ ok: true, message: 'Ledger initialized successfully' });

  } catch (err: any) {
    console.error('InitLedger error:', err);

    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'System',
        action: 'InitLedger Error',
        description: err.message,
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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

// 1) Create election (blockchain + DB)
app.post('/elections', async (req, res) => {
  const { electionId, name, description, startTime, endTime, createdBy } = req.body || {};
  const ip = req.ip;

  if (!electionId || !name || !startTime || !endTime) {
    await prisma.systemActivity.create({
      data: {
        user: createdBy || 'admin',
        role: 'Admin',
        action: 'CREATE_ELECTION_FAILED',
        description: 'Missing required fields',
        ipAddress: ip,
        status: 'Failed',
      },
    });

    return res.status(400).json({
      error: 'Missing required fields: electionId, name, startTime, endTime',
    });
  }

  try {
    const contract = await getContract();

    // Log BEFORE blockchain call (attempt)
    await prisma.systemActivity.create({
      data: {
        user: createdBy || 'admin',
        role: 'Admin',
        action: 'CREATE_ELECTION_ATTEMPT',
        description: `Creating election ${electionId}`,
        ipAddress: ip,
        status: 'Success',
      },
    });

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
      await prisma.systemActivity.create({
        data: {
          user: createdBy || 'admin',
          role: 'Admin',
          action: 'ELECTION_DB_SYNC_FAILED',
          description: dbErr.message,
          ipAddress: ip,
          status: 'Failed',
        },
      });

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
    await prisma.systemActivity.create({
      data: {
        user: createdBy || 'admin',
        role: 'Admin',
        action: 'CREATE_ELECTION_SUCCESS',
        description: `Election ${electionId} created successfully`,
        ipAddress: ip,
        status: 'Success',
      },
    });

    return res.status(201).json(election);

  } catch (err: any) {
    console.error('CreateElection error:', err);

    const msg = err.message || String(err);

    await prisma.systemActivity.create({
      data: {
        user: createdBy || 'admin',
        role: 'Admin',
        action: 'CREATE_ELECTION_FAILED',
        description: msg,
        ipAddress: ip,
        status: 'Failed',
      },
    });

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
        await prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'AUTO_OPEN_ELECTION',
            description: `Election ${req.params.id} auto-opened (start time reached)`,
            ipAddress: req.ip,
            status: 'Success',
          },
        });
        console.log(`✅ Election ${req.params.id} automatically opened (start time reached)`);
        await prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'AUTO_OPEN_ELECTION',
            description: `Election ${req.params.id} auto-opened (start time reached)`,
            ipAddress: req.ip,
            status: 'Success',
          },
        });
      } catch (openErr: any) {
        await prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'AUTO_OPEN_ELECTION_FAILED',
            description: openErr.message,
            ipAddress: req.ip,
            status: 'Failed',
          },
        });
        console.warn(`⚠️ Failed to auto-open election ${req.params.id}:`, openErr.message);
      }
    }

    // Auto-close: if OPEN and end time has passed, close the election
    if (election.status === 'OPEN' && now > endTime) {
      try {
        await contract.submitTransaction('CloseElection', req.params.id);
        election.status = 'CLOSED';
        await prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'AUTO_CLOSE_ELECTION',
            description: `Election ${req.params.id} auto-closed (end time passed)`,
            ipAddress: req.ip,
            status: 'Success',
          },
        });
        console.log(`✅ Election ${req.params.id} automatically closed (end time passed)`);
        await prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'AUTO_CLOSE_ELECTION',
            description: `Election ${req.params.id} auto-closed (end time passed)`,
            ipAddress: req.ip,
            status: 'Success',
          },
        });
      } catch (closeErr: any) {
        await prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'AUTO_CLOSE_ELECTION_FAILED',
            description: closeErr.message,
            ipAddress: req.ip,
            status: 'Failed',
          },
        });
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
      await prisma.systemActivity.create({
        data: {
          user: 'system',
          role: 'Admin',
          action: 'ELECTION_SYNC_FAILED',
          description: dbErr.message,
          ipAddress: req.ip,
          status: 'Failed',
        },
      });
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
    
    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'Admin',
        action: 'GET_ELECTION_FAILED',
        description: errorMessage,
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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

      await prisma.systemActivity.create({
        data: {
          user: 'system',
          role: 'Admin',
          action: 'GET_POSITIONS_FAILED',
          description: err.message || 'GetPositions failed',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      res.status(400).json({ error: err.message || 'GetPositions failed' });
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

  await prisma.systemActivity.create({
    data: {
        user: 'system',
        role: 'Admin',
        action: 'GET_CANDIDATES_FAILED',
        description: err.message || 'GetCandidatesByPosition failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    res.status(400).json({ error: err.message || 'GetCandidatesByPosition failed' });
  }
});

// 2c) Create/Add candidates to database and blockchain
app.post('/elections/:id/candidates', async (req, res) => {
  const { id } = req.params;
  const { candidates } = req.body; // Array of { positionName, name, party, yearLevel, program? }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'CREATE_CANDIDATES_FAILED',
        description: 'Candidates array is missing or empty',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(400).json({ error: 'candidates array is required' });
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
      if (!position) {
        await prisma.systemActivity.create({
          data: {
            user: 'admin',
            role: 'Admin',
            action: 'CREATE_CANDIDATE_FAILED',
            description: `Position "${positionName}" not found in election ${id}`,
            ipAddress: req.ip,
            status: 'Failed',
          },
        });
        continue;
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
        await prisma.systemActivity.create({
          data: {
            user: 'admin',
            role: 'Admin',
            action: 'BLOCKCHAIN_REGISTER_CANDIDATE_FAILED',
            description: `Candidate ${candidateId}: ${blockchainErr.message}`,
            ipAddress: req.ip,
            status: 'Failed',
          },
        });

        console.warn(`⚠️ Failed to register candidate ${candidateId} on blockchain:`, blockchainErr.message);
        // Continue even if blockchain registration fails - candidate is in database
      }

      createdCandidates.push(candidate);
    }

    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'CREATE_CANDIDATES',
        description: `Added ${createdCandidates.length} candidates to election ${id}`,
        ipAddress: req.ip,
        status: 'Success',
      },
    });

    res.json({ ok: true, candidates: createdCandidates, count: createdCandidates.length });
  } catch (err: any) {
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'CREATE_CANDIDATES_FAILED',
        description: err.message || 'CreateCandidates failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });
    console.error('CreateCandidates error:', err);
    res.status(400).json({ error: err.message || 'CreateCandidates failed' });
  }
});

// 2.5) Update election (update name, description, dates)
app.put('/elections/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, startTime, endTime } = req.body;

  // Validation
  if (!name || !startTime || !endTime) {
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'UPDATE_ELECTION_FAILED',
        description: 'Missing required fields',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(400).json({
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

          await prisma.systemActivity.create({
            data: {
              user: 'admin',
              role: 'Admin',
              action: 'UPDATE_ELECTION_RETRY',
              description: `MVCC conflict on election ${id}, attempt ${attempt}`,
              ipAddress: req.ip,
              status: 'Failed',
            },
          });

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
      await prisma.systemActivity.create({
        data: {
          user: 'admin',
          role: 'Admin',
          action: 'ELECTION_DB_UPDATE_FAILED',
          description: dbErr.message,
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      console.warn(
        `⚠️ Failed to update election ${id} in database:`,
        dbErr.message
      );
      // Continue since blockchain update succeeded
    }

    // Send response first
    res.json({ ok: true, message: 'Election updated successfully' });

    // Log success asynchronously
    prisma.systemActivity
      .create({
        data: {
          user: 'admin',
          role: 'Admin',
          action: 'UPDATE_ELECTION',
          description: `Election ${id} updated successfully`,
          ipAddress: req.ip,
          status: 'Success',
        },
      })
      .catch(console.error);

  } catch (err: any) {
    // ✅ Log failure
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'UPDATE_ELECTION_FAILED',
        description: err.message || 'UpdateElection failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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

// 3) Open election (change status from DRAFT to OPEN)
app.post('/elections/:id/open', async (req, res) => {
  const { id } = req.params;

  try {
    const contract = await getContract();
    await contract.submitTransaction('OpenElection', id);

    res.json({ ok: true });

    // Success log
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'OPEN_ELECTION',
        description: `Election ${id} opened`,
        ipAddress: req.ip,
        status: 'Success',
      },
    });
  } catch (err: any) {
    console.error('OpenElection error:', err);

    // Failure log
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'OPEN_ELECTION_FAILED',
        description: err.message || 'OpenElection failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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

    // Success log
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'CLOSE_ELECTION',
        description: `Election ${id} closed`,
        ipAddress: req.ip,
        status: 'Success',
      },
    });
  } catch (err: any) {
    console.error('CloseElection error:', err);

    // Failure log
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'CLOSE_ELECTION_FAILED',
        description: err.message || 'CloseElection failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    res.status(400).json({
      error: err.message || 'CloseElection failed',
    });
  }
});


// 4) Register voter
app.post('/elections/:id/voters', async (req, res) => {
  const { id } = req.params;
  const { voterId } = req.body;

  if (!voterId) {
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'REGISTER_VOTER_FAILED',
        description: 'voterId is required',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(400).json({ error: 'voterId is required' });
  }

  try {
    const contract = await getContract();
    await contract.submitTransaction('RegisterVoter', id, voterId);

    res.json({ ok: true });

    // Success log
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'REGISTER_VOTER',
        description: `Voter ${voterId} registered to election ${id}`,
        ipAddress: req.ip,
        status: 'Success',
      },
    });
  } catch (err: any) {
    console.error(err);

    // Failure log
    await prisma.systemActivity.create({
      data: {
        user: 'admin',
        role: 'Admin',
        action: 'REGISTER_VOTER_FAILED',
        description: err.message || 'RegisterVoter failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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
    await prisma.systemActivity.create({
      data: {
        user: studentNumber || 'Unknown',
        role: 'Voter',
        action: 'CAST_VOTE_FAILED',
        description: 'Missing studentNumber or selections',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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
      await prisma.systemActivity.create({
        data: {
          user: studentNumber,
          role: 'Voter',
          action: 'CAST_VOTE_FAILED',
          description: 'Voter not found',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(404).json({ error: 'Voter not found in registry' });
    }

    if (voter.college !== 'CAS') {
      await prisma.systemActivity.create({
        data: {
          user: studentNumber,
          role: 'Voter',
          action: 'CAST_VOTE_FAILED',
          description: 'Invalid college',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(403).json({ error: 'This election is for CAS students only' });
    }

    if (voter.status !== 'ENROLLED' || !voter.isEligible) {
      await prisma.systemActivity.create({
        data: {
          user: studentNumber,
          role: 'Voter',
          action: 'CAST_VOTE_FAILED',
          description: 'Voter not eligible',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(403).json({ error: 'Voter is not eligible to vote' });
    }

    if (voter.hasVoted) {
      await prisma.systemActivity.create({
        data: {
          user: studentNumber,
          role: 'Voter',
          action: 'CAST_VOTE_FAILED',
          description: 'Already voted',
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

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

      await prisma.systemActivity.create({
        data: {
          user: studentNumber,
          role: 'Voter',
          action: 'CAST_VOTE_BLOCKCHAIN_FAILED',
          description: blockchainErr.message,
          ipAddress: req.ip,
          status: 'Failed',
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

    prisma.systemActivity.create({
      data: {
        user: studentNumber,
        role: 'Voter',
        action: 'CAST_VOTE',
        description: `Vote cast in election ${id}`,
        ipAddress: req.ip,
        status: 'Success',
      },
    }).catch(console.error);

  } catch (err: any) {
  console.error('[Vote] Error:', err);

  const errorMessage = err.message ?? 'Internal server error';

  // 🔥 Blockchain-specific error handling FIRST
  if (
    errorMessage.includes('endorsement') ||
    errorMessage.includes('ABORTED') ||
    err.code === 10
  ) {
    // 🔁 Rollback voter (extra safety)
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

      await prisma.systemActivity.create({
        data: {
          user: studentNumber,
          role: 'Voter',
          action: 'VOTE_ROLLBACK_FAILED',
          description: rollbackErr.message,
          ipAddress: req.ip,
          status: 'Failed',
        },
      });
    }

    // ❌ Blockchain failure log
    await prisma.systemActivity.create({
      data: {
        user: studentNumber || 'Unknown',
        role: 'Voter',
        action: 'CAST_VOTE_BLOCKCHAIN_FAILED',
        description: errorMessage,
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    return res.status(500).json({
      error: 'Blockchain transaction failed',
      details: errorMessage,
      code: err.code,
    });
  }

  // ❌ General failure log (ONLY once)
  await prisma.systemActivity.create({
    data: {
      user: studentNumber || 'Unknown',
      role: 'Voter',
      action: 'CAST_VOTE_FAILED',
      description: errorMessage,
      ipAddress: req.ip,
      status: 'Failed',
    },
  });

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

    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'Admin',
        action: 'GET_ELECTION_RESULTS_FAILED',
        description: err.message || 'Failed to fetch election results',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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

    if (!auditLog || !auditLog.txId) {
      await prisma.systemActivity.create({
        data: {
          user: voterId,
          role: 'Admin',
          action: 'GET_TRANSACTION_NOT_FOUND',
          description: `No transaction found for voter ${voterId}`,
          ipAddress: req.ip,
          status: 'Failed',
        },
      });

      return res.status(404).json({
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

    await prisma.systemActivity.create({
      data: {
        user: voterId || 'Unknown',
        role: 'Admin',
        action: 'GET_TRANSACTION_FAILED',
        description: err.message || 'Failed to fetch transaction ID',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    res.status(400).json({
      error: err.message || 'GetTransactionId failed',
    });
  }
});

app.get('/elections/:id/dashboard', async (req, res) => {
  const { id } = req.params;

  try {
    // Get total CAS enrolled voters
    const totalVoters = await prisma.voter.count({
      where: { 
        college: 'CAS',
        status: 'ENROLLED',
        isEligible: true,
      },
    });

    // Get voters who have voted
    const votedCount = await prisma.voter.count({
      where: {
        college: 'CAS',
        status: 'ENROLLED',
        isEligible: true,
        hasVoted: true,
      },
    });

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

            await prisma.systemActivity.create({
              data: {
                user: 'system',
                role: 'Admin',
                action: 'AUTO_CLOSE_ELECTION',
                description: `Election ${id} auto-closed (end time passed)`,
                ipAddress: req.ip,
                status: 'Success',
              },
            });

          } catch (closeErr: any) {
            console.warn(`⚠️ Failed to auto-close election ${id}:`, closeErr.message);

            await prisma.systemActivity.create({
              data: {
                user: 'system',
                role: 'Admin',
                action: 'AUTO_CLOSE_ELECTION_FAILED',
                description: closeErr.message,
                ipAddress: req.ip,
                status: 'Failed',
              },
            });
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

          await prisma.systemActivity.create({
            data: {
              user: 'system',
              role: 'Admin',
              action: 'ELECTION_SYNC_FAILED',
              description: syncErr.message,
              ipAddress: req.ip,
              status: 'Failed',
            },
          });
        }
      }

    } catch (err: any) {
      console.warn('Could not fetch election from blockchain:', err.message);

      await prisma.systemActivity.create({
        data: {
          user: 'system',
          role: 'Admin',
          action: 'FETCH_ELECTION_BLOCKCHAIN_FAILED',
          description: err.message,
          ipAddress: req.ip,
          status: 'Failed',
        },
      });
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

  } catch (err: any) {
    console.error('GetDashboard error:', err);

    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'Admin',
        action: 'GET_DASHBOARD_FAILED',
        description: err.message || 'Dashboard fetch failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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

    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'Admin',
        action: 'GET_AUDIT_LOGS_FAILED',
        description: err.message || 'Failed to fetch audit logs',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    res.status(400).json({
      error: err.message || 'GetAuditLogs failed',
    });
  }
});

// 10) Get detailed voter turnout statistics
app.get('/elections/:id/turnout', async (req, res) => {
  const { id } = req.params;

  try {
    const totalVoters = await prisma.voter.count({
      where: { 
        college: 'CAS',
        status: 'ENROLLED',
        isEligible: true,
      },
    });

    const votedCount = await prisma.voter.count({
      where: {
        college: 'CAS',
        status: 'ENROLLED',
        isEligible: true,
        hasVoted: true,
      },
    });

    const allVoters = await prisma.voter.findMany({
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

    // Department breakdown
    const departmentMap = new Map<string, { total: number; voted: number }>();

    allVoters.forEach(voter => {
      const dept = voter.department || 'Unknown';
      if (!departmentMap.has(dept)) {
        departmentMap.set(dept, { total: 0, voted: 0 });
      }
      const stats = departmentMap.get(dept)!;
      stats.total++;
      if (voter.hasVoted) stats.voted++;
    });

    const byDepartment = Array.from(departmentMap.entries()).map(([name, stats]) => ({
      name,
      total: stats.total,
      voted: stats.voted,
      notVoted: stats.total - stats.voted,
    }));

    // Year level breakdown
    const yearLevelMap = new Map<number, { total: number; voted: number }>();

    allVoters.forEach(voter => {
      const year = voter.yearLevel || 0;
      if (!yearLevelMap.has(year)) {
        yearLevelMap.set(year, { total: 0, voted: 0 });
      }
      const stats = yearLevelMap.get(year)!;
      stats.total++;
      if (voter.hasVoted) stats.voted++;
    });

    const byYearLevel = Array.from(yearLevelMap.entries())
      .map(([yearLevel, stats]) => ({
        yearLevel,
        total: stats.total,
        voted: stats.voted,
        notVoted: stats.total - stats.voted,
      }))
      .sort((a, b) => a.yearLevel - b.yearLevel);

    // Program breakdown
    const programMap = new Map<string, { total: number; voted: number }>();

    allVoters.forEach(voter => {
      const program = voter.program || 'Unknown';
      if (!programMap.has(program)) {
        programMap.set(program, { total: 0, voted: 0 });
      }
      const stats = programMap.get(program)!;
      stats.total++;
      if (voter.hasVoted) stats.voted++;
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

  } catch (err: any) {
    console.error('GetTurnout error:', err);

    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'Admin',
        action: 'GET_TURNOUT_FAILED',
        description: err.message || 'Failed to compute turnout statistics',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    res.status(400).json({
      error: err.message || 'GetTurnout failed',
    });
  }
});

app.get('/elections/:id/hourly-participation', async (req, res) => {
  const { id } = req.params;
  const { date } = req.query; // Optional date filter (YYYY-MM-DD format)

  try {
    const votes = await (prisma as any).vote.findMany({
      where: {
        electionId: id,
        ...(date
          ? {
              castAt: {
                gte: new Date(date as string),
                lt: new Date(new Date(date as string).getTime() + 24 * 60 * 60 * 1000),
              },
            }
          : {}),
      },
      select: {
        castAt: true,
      },
      orderBy: {
        castAt: 'asc',
      },
    });

    // Initialize hourly buckets
    const hourlyCounts = new Map<number, number>();
    for (let i = 0; i < 24; i++) {
      hourlyCounts.set(i, 0);
    }

    // Count votes by hour
    votes.forEach(vote => {
      const hour = new Date(vote.castAt).getHours();
      hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
    });

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
      totalVotes: votes.length,
    });

  } catch (err: any) {
    console.error('GetHourlyParticipation error:', err);

    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'Admin',
        action: 'GET_HOURLY_PARTICIPATION_FAILED',
        description: err.message || 'Failed to compute hourly participation',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

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

    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'Admin',
        action: 'INTEGRITY_CHECK_FAILED',
        description: err.message || 'Integrity check failed',
        ipAddress: req.ip,
        status: 'Failed',
      },
    });

    res.status(400).json({
      error: err.message || 'GetIntegrityCheck failed',
    });
  }
}); 

const PORT = process.env.PORT || 4000;
let server: any;

try {
  server = app.listen(PORT, async () => {
    console.log(`eCASVote gateway API listening on http://localhost:${PORT}`);
    console.log('Server is running. Press Ctrl+C to stop.');

    // Log startup (safe async inside callback)
    try {
      await prisma.systemActivity.create({
        data: {
          user: 'system',
          role: 'Admin',
          action: 'SERVER_STARTED',
          description: `Server started on port ${PORT}`,
          ipAddress: 'localhost',
          status: 'Success',
        },
      });
    } catch (logErr) {
      console.error('Failed to log server startup:', logErr);
    }
  });

  // ❗ IMPORTANT: Do NOT use async here
  server.on('error', (error: any) => {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

    let description = '';

    switch (error.code) {
      case 'EACCES':
        description = `${bind} requires elevated privileges`;
        console.error(description);

        prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'SERVER_START_EACCES',
            description,
            ipAddress: 'localhost',
            status: 'Failed',
          },
        }).catch(console.error);

        process.exit(1);

      case 'EADDRINUSE':
        description = `${bind} is already in use`;
        console.error(description);

        prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'SERVER_START_PORT_IN_USE',
            description,
            ipAddress: 'localhost',
            status: 'Failed',
          },
        }).catch(console.error);

        process.exit(1);

      default:
        throw error;
    }
  });

} catch (error: any) {
  console.error('Failed to start server:', error);

  // ❗ No top-level await → wrap in async IIFE
  (async () => {
    try {
      await prisma.systemActivity.create({
        data: {
          user: 'system',
          role: 'Admin',
          action: 'SERVER_START_FAILED',
          description: error.message || 'Unknown server startup error',
          ipAddress: 'localhost',
          status: 'Failed',
        },
      });
    } catch (logErr) {
      console.error('Logging failed:', logErr);
    } finally {
      process.exit(1);
    }
  })();
}

const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} signal received: closing HTTP server`);

  try {
    await prisma.systemActivity.create({
      data: {
        user: 'system',
        role: 'Admin',
        action: 'SERVER_SHUTDOWN_INITIATED',
        description: `Shutdown triggered by ${signal}`,
        ipAddress: 'localhost',
        status: 'Success',
      },
    });
  } catch (logErr) {
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

        prisma.systemActivity.create({
          data: {
            user: 'system',
            role: 'Admin',
            action: 'DATABASE_DISCONNECT_FAILED',
            description: err.message || 'Failed to disconnect database',
            ipAddress: 'localhost',
            status: 'Failed',
          },
        }).catch(console.error);

        process.exit(1);
      });
  });
};

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);

  prisma.systemActivity.create({
    data: {
      user: 'system',
      role: 'Admin',
      action: 'UNHANDLED_REJECTION',
      description: `Reason: ${reason}`,
      ipAddress: 'localhost',
      status: 'Failed',
    },
  }).catch(console.error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);

  prisma.systemActivity.create({
    data: {
      user: 'system',
      role: 'Admin',
      action: 'UNCAUGHT_EXCEPTION',
      description: error.message || 'Unexpected server crash',
      ipAddress: 'localhost',
      status: 'Failed',
    },
  }).catch(console.error);

  gracefulShutdown('uncaughtException');
});