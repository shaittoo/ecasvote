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

// Initialize ledger with default election data (calls InitLedger)
app.post('/init', async (_req, res) => {
  try {
    const contract = await getContract();
    console.log('Calling InitLedger...');
    await contract.submitTransaction('InitLedger');
    console.log('InitLedger completed successfully');
    res.json({ ok: true, message: 'Ledger initialized successfully' });
  } catch (err: any) {
    console.error('InitLedger error:', err);
    const errorMessage = err.message || String(err);
    
    // Check if it's an endorsement error
    if (errorMessage.includes('endorsement') || errorMessage.includes('ABORTED')) {
      res.status(400).json({ 
        error: errorMessage,
        hint: 'This error indicates the chaincode endorsement policy requires multiple organizations. You need to either: 1) Re-instantiate the chaincode with policy "OR(\'Org1MSP.peer\')" for single-org testing, or 2) Ensure your network has the required organizations configured.',
        solution: 'Run: peer lifecycle chaincode commit with --signature-policy "OR(\'Org1MSP.peer\')"'
      });
    } else {
      res.status(400).json({ error: errorMessage });
    }
  }
});

// 1) Get election details
app.get('/elections/:id', async (req, res) => {
  try {
    const contract = await getContract();
    const bytes = await contract.evaluateTransaction('GetElection', req.params.id);
    const responseText = Buffer.from(bytes).toString('utf8').trim();
    if (!responseText) {
      throw new Error('Empty response from chaincode');
    }
    res.json(JSON.parse(responseText));
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

// 2) Get candidates for a position
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

// 3) Open election (change status from DRAFT to OPEN)
app.post('/elections/:id/open', async (req, res) => {
  const { id } = req.params;
  try {
    const contract = await getContract();
    await contract.submitTransaction('OpenElection', id);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('OpenElection error:', err);
    res.status(400).json({ error: err.message || 'OpenElection failed' });
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
    const contract = await getContract();
    await contract.submitTransaction('RegisterVoter', id, voterId);
    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'RegisterVoter failed' });
  }
});

// 5) Cast vote
app.post('/elections/:id/votes', async (req, res) => {
  const { id } = req.params;
  const { voterId, selections } = req.body;
  // selections = [{ positionId, candidateId }, ...]

  if (!voterId || !Array.isArray(selections)) {
    return res.status(400).json({ error: 'voterId and selections[] are required' });
  }

  try {
    // --- 1) OFF-CHAIN: upsert voter in SQLite ---
    // For now we fake UP Mail + studentId from voterId
    const upMail = `${voterId}@up.edu.ph`;
    const studentId = `2025-${voterId}`;

    console.log(`[Vote] Saving voter ${voterId} to SQLite...`);
    await prisma.voter.upsert({
      where: { id: voterId },
      update: {
        upMail,
        studentId,
        electionId: id,
        hasVoted: true,
        votedAt: new Date(),
      },
      create: {
        id: voterId,
        electionId: id,
        upMail,
        studentId,
        hasVoted: true,
        votedAt: new Date(),
      },
    });
    console.log(`[Vote] ✅ Voter ${voterId} saved to SQLite`);

    // --- 2) ON-CHAIN: call ECASVote chaincode (CastVote) ---
    console.log(`[Vote] Submitting vote to blockchain...`);
    const contract = await getContract();
    const selectionsJson = JSON.stringify(selections);
    
    // Create proposal to get transaction ID, then endorse and submit
    const proposal = contract.newProposal('CastVote', {
      arguments: [id, voterId, selectionsJson],
    });
    const transactionId = proposal.getTransactionId();
    
    // Endorse the proposal to get a transaction
    const transaction = await proposal.endorse();
    
    // Submit the transaction
    await transaction.submit();
    console.log(`[Vote] ✅ Vote submitted to blockchain with transaction ID: ${transactionId}`);

    // --- 3) Store transaction ID in audit log ---
    await prisma.auditLog.create({
      data: {
        electionId: id,
        voterId: voterId,
        action: 'CAST_VOTE',
        txId: transactionId,
        details: {
          selections: selections,
        },
      },
    });

    return res.json({
      ok: true,
      message: 'Vote recorded on-chain and voter stored off-chain.',
      transactionId: transactionId,
    });
  } catch (err: any) {
    console.error('[Vote] Error:', err);
    const errorMessage = err.message ?? 'Internal server error';
    
    // Check if it's a blockchain error but SQLite might have succeeded
    if (errorMessage.includes('endorsement') || errorMessage.includes('ABORTED')) {
      return res.status(500).json({ 
        error: 'Blockchain transaction failed',
        details: errorMessage,
        note: 'Voter may have been saved to SQLite. Check database.',
      });
    }
    
    return res.status(500).json({ error: errorMessage });
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
    res.status(400).json({ error: err.message || 'GetElectionResults failed' });
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
      return res.status(404).json({ error: 'Transaction ID not found for this voter' });
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

// 8) Get dashboard statistics for an election
app.get('/elections/:id/dashboard', async (req, res) => {
  const { id } = req.params;
  try {
    // Get total voters for this election
    const totalVoters = await prisma.voter.count({
      where: { electionId: id },
    });

    // Get voters who have voted
    const votedCount = await prisma.voter.count({
      where: {
        electionId: id,
        hasVoted: true,
      },
    });

    // Get election info from blockchain
    let election = null;
    try {
      const contract = await getContract();
      const bytes = await contract.evaluateTransaction('GetElection', id);
      const responseText = Buffer.from(bytes).toString('utf8').trim();
      if (responseText) {
        election = JSON.parse(responseText);
      }
    } catch (err) {
      console.warn('Could not fetch election from blockchain:', err);
    }

    // Get recent announcements (from audit logs)
    const announcements = await prisma.auditLog.findMany({
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
  } catch (err: any) {
    console.error('GetDashboard error:', err);
    res.status(400).json({ error: err.message || 'GetDashboard failed' });
  }
});

const PORT = process.env.PORT || 4000;

async function main() {
  app.listen(PORT, () => {
    console.log(`eCASVote gateway API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
