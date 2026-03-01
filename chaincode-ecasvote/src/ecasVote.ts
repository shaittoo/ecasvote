// src/ecasVote.ts
//
// Option B implementation:
// - Client sends ciphertextB64 (encrypted ballot JSON) + selectionsJson (plaintext selections for validation & tallies)
// - Chaincode stores ciphertext envelope in pdcBallots
// - Voter registry + hasVoted stored in pdcVoters
// - Public tallies stored in world state (TALLY_...) for transparent verification by non-PDC orgs
//
// SEB (Org1MSP) can RegisterVoter + submit votes (CastVoteEncrypted) + read private voter/ballot.
// Dept (Org2MSP) will NOT be able to call RegisterVoter / CastVoteEncrypted; Dept still co-endorses
// vote tx via endorsement policy (--peerAddresses includes Org2 peer, chaincode def can require both orgs).
// - PDC membership is configured via collections_config.json.

import { Context, Contract } from 'fabric-contract-api';

export type ElectionStatus = 'DRAFT' | 'OPEN' | 'CLOSED';

export interface Election {
  id: string;
  name: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  status: ElectionStatus;
  createdBy: string;
  createdAt: string; // ISO string
}

export interface Position {
  id: string;
  electionId: string;
  name: string;
  maxVotes: number;
  order: number;
}

export interface Candidate {
  id: string;
  electionId: string;
  positionId: string;
  name: string;
  party?: string;
  program?: string;
  yearLevel?: string;
}

export interface Voter {
  id: string;
  electionId: string;
  hasVoted: boolean;
  votedAt?: string;
}

export interface BallotSelection {
  positionId: string;
  candidateId: string; // can be 'ABSTAIN'
}

// Stored ONLY in PDC as encrypted envelope (ciphertext only)
export interface PrivateBallotEnvelope {
  electionId: string;
  voterId: string;
  castAt: string; // ISO string (tx timestamp)
  ciphertextB64: string; // encrypted ballot JSON (base64)
  enc: 'SEB_PUBKEY_BOX_V1';
}

type CandidateCounts = Record<string, number>;
type PositionResults = Record<string, CandidateCounts>;

export class ECASVoteContract extends Contract {
  // ---------------- PDC CONFIG ----------------
  private readonly PDC_VOTERS = 'pdcVoters';
  private readonly PDC_BALLOTS = 'pdcBallots';

  // SEB only (admin ops + voter registry ops + vote submission)
  private readonly ORG_SEB_MSP = 'Org1MSP';

  // SEB + Dept can endorse at peer-level; endorsement is handled by lifecycle policy.
  // SEB only: register voters + submit votes + read private data
  private requireSEB(ctx: Context): void {
    const mspid = ctx.clientIdentity.getMSPID();
    if (mspid !== this.ORG_SEB_MSP) {
      throw new Error(`Access denied. SEB only. MSP='${mspid}'`);
    }
  }

  // ---------------- INIT LEDGER ----------------
  public async InitLedger(ctx: Context): Promise<void> {
    this.requireSEB(ctx);
    const electionId = 'election-2025';

    // 1) Create election (public) if not exists
    const exists = await this.electionExists(ctx, electionId);
    if (!exists) {
      const election: Election = {
        id: electionId,
        name: 'UPV CAS SC Elections 2025',
        description: 'Default initialized election created by InitLedger',
        startTime: '2025-01-01T00:00:00Z',
        endTime: '2025-01-02T00:00:00Z',
        status: 'DRAFT',
        createdBy: 'system',
        createdAt: '2025-01-01T00:00:00Z',
      };

      await ctx.stub.putState(this.electionKey(electionId), new Uint8Array(Buffer.from(JSON.stringify(election))));
    }

    // 2) Create positions + candidates (public)
    const positions = [
      { id: 'usc-councilor', name: 'USC Councilor', maxVotes: 3, order: 1 },
      { id: 'cas-rep-usc', name: 'CAS Rep. to the USC', maxVotes: 1, order: 2 },
      { id: 'cas-chairperson', name: 'CAS Chairperson', maxVotes: 1, order: 3 },
      { id: 'cas-vice-chairperson', name: 'CAS Vice Chairperson', maxVotes: 1, order: 4 },
      { id: 'cas-councilor', name: 'CAS Councilor', maxVotes: 5, order: 5 },
      { id: 'clovers-governor', name: 'Clovers Governor', maxVotes: 1, order: 6 },
      { id: 'elektrons-governor', name: 'Elektrons Governor', maxVotes: 1, order: 7 },
      { id: 'redbolts-governor', name: 'Redbolts Governor', maxVotes: 1, order: 8 },
      { id: 'skimmers-governor', name: 'Skimmers Governor', maxVotes: 1, order: 9 },
    ];

    for (const pos of positions) {
      const pKey = this.positionKey(electionId, pos.id);
      const existingPosition = await ctx.stub.getState(pKey);

      if (!existingPosition || existingPosition.length === 0) {
        const position: Position = {
          id: pos.id,
          electionId,
          name: pos.name,
          maxVotes: pos.maxVotes,
          order: pos.order,
        };

        await ctx.stub.putState(pKey, new Uint8Array(Buffer.from(JSON.stringify(position))));

        const candidatesData = this.getCandidatesForPosition(pos.id);
        for (let i = 0; i < candidatesData.length; i++) {
          const candidateId = `cand-${pos.id}-${i + 1}`;
          const cKey = this.candidateKey(electionId, pos.id, candidateId);
          const existingCandidate = await ctx.stub.getState(cKey);

          if (!existingCandidate || existingCandidate.length === 0) {
            const candidate: Candidate = {
              id: candidateId,
              electionId,
              positionId: pos.id,
              name: candidatesData[i].name,
              party: candidatesData[i].party,
              program: candidatesData[i].program,
              yearLevel: candidatesData[i].yearLevel,
            };

            await ctx.stub.putState(cKey, new Uint8Array(Buffer.from(JSON.stringify(candidate))));
          }
        }
      }
    }
  }

  private getCandidatesForPosition(
    positionId: string,
  ): Array<{ name: string; party: string; program: string; yearLevel: string }> {
    const candidatesMap: Record<string, Array<{ name: string; party: string; program: string; yearLevel: string }>> = {
      'usc-councilor': [
        { name: 'Maria Santos', party: 'PMB', program: 'BS Computer Science', yearLevel: '3rd Year' },
        { name: 'Juan Dela Cruz', party: 'SAMASA', program: 'BS Mathematics', yearLevel: '2nd Year' },
        { name: 'Ana Garcia', party: 'Independent', program: 'BS Biology', yearLevel: '4th Year' },
        { name: 'Carlos Reyes', party: 'PMB', program: 'BS Chemistry', yearLevel: '3rd Year' },
      ],
      'cas-rep-usc': [
        { name: 'Patricia Lopez', party: 'SAMASA', program: 'BS Computer Science', yearLevel: '4th Year' },
        { name: 'Roberto Tan', party: 'PMB', program: 'BS Mathematics', yearLevel: '3rd Year' },
      ],
      'cas-chairperson': [
        { name: 'Sofia Martinez', party: 'PMB', program: 'BS Biology', yearLevel: '4th Year' },
        { name: 'Miguel Fernandez', party: 'SAMASA', program: 'BS Computer Science', yearLevel: '4th Year' },
        { name: 'Isabella Cruz', party: 'Independent', program: 'BS Chemistry', yearLevel: '3rd Year' },
      ],
      'cas-vice-chairperson': [
        { name: 'Diego Ramos', party: 'PMB', program: 'BS Mathematics', yearLevel: '3rd Year' },
        { name: 'Elena Torres', party: 'SAMASA', program: 'BS Biology', yearLevel: '3rd Year' },
      ],
      'cas-councilor': [
        { name: 'Gabriel Villanueva', party: 'PMB', program: 'BS Computer Science', yearLevel: '2nd Year' },
        { name: 'Lucia Mendoza', party: 'SAMASA', program: 'BS Mathematics', yearLevel: '3rd Year' },
        { name: 'Fernando Castro', party: 'Independent', program: 'BS Biology', yearLevel: '2nd Year' },
        { name: 'Valentina Ortega', party: 'PMB', program: 'BS Chemistry', yearLevel: '4th Year' },
        { name: 'Ricardo Navarro', party: 'SAMASA', program: 'BS Computer Science', yearLevel: '3rd Year' },
        { name: 'Camila Silva', party: 'Independent', program: 'BS Mathematics', yearLevel: '2nd Year' },
      ],
      'clovers-governor': [
        { name: 'Alejandro Morales', party: 'PMB', program: 'BS Computer Science', yearLevel: '3rd Year' },
        { name: 'Daniela Herrera', party: 'SAMASA', program: 'BS Biology', yearLevel: '2nd Year' },
      ],
      'elektrons-governor': [
        { name: 'Nicolas Jimenez', party: 'SAMASA', program: 'BS Mathematics', yearLevel: '3rd Year' },
        { name: 'Adriana Vega', party: 'PMB', program: 'BS Computer Science', yearLevel: '4th Year' },
        { name: 'Sebastian Ruiz', party: 'Independent', program: 'BS Chemistry', yearLevel: '2nd Year' },
      ],
      'redbolts-governor': [
        { name: 'Victoria Paredes', party: 'PMB', program: 'BS Biology', yearLevel: '3rd Year' },
        { name: 'Andres Moreno', party: 'SAMASA', program: 'BS Computer Science', yearLevel: '2nd Year' },
      ],
      'skimmers-governor': [
        { name: 'Olivia Cordero', party: 'SAMASA', program: 'BS Mathematics', yearLevel: '4th Year' },
        { name: 'Mateo Salazar', party: 'PMB', program: 'BS Chemistry', yearLevel: '3rd Year' },
        { name: 'Emma Gutierrez', party: 'Independent', program: 'BS Biology', yearLevel: '2nd Year' },
      ],
    };

    return (
      candidatesMap[positionId] || [
        { name: `Candidate 1 - ${positionId}`, party: 'TBD', program: 'TBD', yearLevel: 'TBD' },
      ]
    );
  }

  // ---------------- ELECTION LIFECYCLE ----------------
  public async CreateElection(
    ctx: Context,
    electionId: string,
    name: string,
    description: string,
    startTime: string,
    endTime: string,
    createdBy: string,
  ): Promise<void> {
    this.requireSEB(ctx);
    const exists = await this.electionExists(ctx, electionId);
    if (exists) throw new Error(`Election ${electionId} already exists`);

    const election: Election = {
      id: electionId,
      name,
      description,
      startTime,
      endTime,
      status: 'DRAFT',
      createdBy,
      createdAt: new Date().toISOString(),
    };

    await ctx.stub.putState(this.electionKey(electionId), new Uint8Array(Buffer.from(JSON.stringify(election))));
  }


  public async OpenElection(ctx: Context, electionId: string): Promise<void> {
    this.requireSEB(ctx);
  
    const election = await this.getElection(ctx, electionId);
    if (election.status === 'OPEN') return;
    if (election.status === 'CLOSED') throw new Error(`Election ${electionId} is CLOSED and cannot be reopened`);
    if (election.status !== 'DRAFT') throw new Error(`Election ${electionId} is not in DRAFT status`);
  
    election.status = 'OPEN';
    await ctx.stub.putState(this.electionKey(electionId), new Uint8Array(Buffer.from(JSON.stringify(election))));
  }

  public async CloseElection(ctx: Context, electionId: string): Promise<void> {
    this.requireSEB(ctx);
  
    const election = await this.getElection(ctx, electionId);
    if (election.status !== 'OPEN') throw new Error(`Election ${electionId} is not OPEN`);
  
    election.status = 'CLOSED';
    await ctx.stub.putState(this.electionKey(electionId), new Uint8Array(Buffer.from(JSON.stringify(election))));
  }

  public async GetElection(ctx: Context, electionId: string): Promise<string> {
    return JSON.stringify(await this.getElection(ctx, electionId));
  }

  public async UpdateElection(
    ctx: Context,
    electionId: string,
    name: string,
    description: string,
    startTime: string,
    endTime: string,
  ): Promise<void> {
    this.requireSEB(ctx);
  
    const election = await this.getElection(ctx, electionId);
    election.name = name;
    election.description = description;
    election.startTime = startTime;
    election.endTime = endTime;
  
    await ctx.stub.putState(this.electionKey(electionId), new Uint8Array(Buffer.from(JSON.stringify(election))));
  }

  // ---------------- POSITIONS & CANDIDATES (PUBLIC) ----------------
  public async AddPosition(
    ctx: Context,
    electionId: string,
    positionId: string,
    name: string,
    maxVotes: number,
    order: number,
  ): Promise<void> {
    this.requireSEB(ctx);
    const election = await this.getElection(ctx, electionId);
    if (election.status !== 'DRAFT') throw new Error(`Cannot modify positions; election ${electionId} is not DRAFT`);

    const key = this.positionKey(electionId, positionId);
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) throw new Error(`Position ${positionId} already exists for election ${electionId}`);

    const pos: Position = { id: positionId, electionId, name, maxVotes, order };
    await ctx.stub.putState(key, new Uint8Array(Buffer.from(JSON.stringify(pos))));
  }

  public async RegisterCandidate(
    ctx: Context,
    electionId: string,
    positionId: string,
    candidateId: string,
    name: string,
    party: string,
    program: string,
    yearLevel: string,
  ): Promise<void> {
    this.requireSEB(ctx);
    const election = await this.getElection(ctx, electionId);
    if (election.status !== 'DRAFT') throw new Error(`Cannot register candidates; election ${electionId} is not DRAFT`);

    await this.getPosition(ctx, electionId, positionId);

    const key = this.candidateKey(electionId, positionId, candidateId);
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) throw new Error(`Candidate ${candidateId} already exists for position ${positionId}`);

    const candidate: Candidate = { id: candidateId, electionId, positionId, name, party, program, yearLevel };
    await ctx.stub.putState(key, new Uint8Array(Buffer.from(JSON.stringify(candidate))));
  }

  public async GetCandidatesByElection(ctx: Context, electionId: string): Promise<string> {
    const prefix = `CANDIDATE_${electionId}_`;
    const iterator = await ctx.stub.getStateByRange(prefix, prefix + '~');
    const results: Candidate[] = [];

    for (let res = await iterator.next(); !res.done; res = await iterator.next()) {
      if (res.value?.value?.length) {
        results.push(JSON.parse(Buffer.from(res.value.value).toString('utf8')) as Candidate);
      }
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  public async GetCandidatesByPosition(ctx: Context, electionId: string, positionId: string): Promise<string> {
    const startKey = `CANDIDATE_${electionId}_${positionId}_`;
    const endKey = `CANDIDATE_${electionId}_${positionId}_\uffff`;

    const iterator = await ctx.stub.getStateByRange(startKey, endKey);
    const results: Candidate[] = [];

    for (let res = await iterator.next(); !res.done; res = await iterator.next()) {
      if (res.value?.value?.length) {
        results.push(JSON.parse(Buffer.from(res.value.value).toString('utf8')) as Candidate);
      }
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  // ---------------- VOTERS & BALLOTS (PRIVATE via PDC) ----------------
  public async RegisterVoter(ctx: Context, electionId: string, voterId: string): Promise<void> {
    this.requireSEB(ctx);

    const election = await this.getElection(ctx, electionId);
    if (election.status === 'CLOSED') throw new Error(`Cannot register voters; election ${electionId} is CLOSED`);

    const key = this.voterKey(electionId, voterId);
    const existing = await ctx.stub.getPrivateData(this.PDC_VOTERS, key);
    if (existing && existing.length > 0) return; // idempotent

    const voter: Voter = { id: voterId, electionId, hasVoted: false };
    await ctx.stub.putPrivateData(this.PDC_VOTERS, key, new Uint8Array(Buffer.from(JSON.stringify(voter))));
  }

  /** Reads the voter record from pdcVoters (SEB only). */
  public async GetVoter(ctx: Context, electionId: string, voterId: string): Promise<string> {
    this.requireSEB(ctx);

    const key = this.voterKey(electionId, voterId);
    const bytes = await ctx.stub.getPrivateData(this.PDC_VOTERS, key);
    if (!bytes || bytes.length === 0) {
      throw new Error(`Voter ${voterId} not found for election ${electionId}`);
    }
    return Buffer.from(bytes).toString('utf8');
  }

  /**
   * Publicly-verifiable hash for the private voter record.
   * Useful for auditors/debugging without revealing voter details.
   */
  public async GetVoterHash(ctx: Context, electionId: string, voterId: string): Promise<string> {
    const key = this.voterKey(electionId, voterId);
    const hashBytes = await ctx.stub.getPrivateDataHash(this.PDC_VOTERS, key);
    if (!hashBytes || hashBytes.length === 0) return '';
    return Buffer.from(hashBytes).toString('base64');
  }

  /**
   * Option B:
   * - ciphertextB64: encrypted ballot payload (done by SEB client using SEB public key)
   * - selectionsJson: plaintext selections for validation + public tallies
   *
   * Stores:
   * - Encrypted envelope in pdcBallots
   * - Voter status (hasVoted) in pdcVoters
   * - Public tallies in world state (TALLY_...) for verification by PMB/SAMASA/Adviser
   */
  public async CastVoteEncrypted(
    ctx: Context,
    electionId: string,
    voterId: string,
    ciphertextB64: string,
    selectionsJson: string,
  ): Promise<void> {
    this.requireSEB(ctx);

    if (!ciphertextB64 || ciphertextB64.trim().length === 0) {
      throw new Error('ciphertextB64 is required');
    }

    const election = await this.getElection(ctx, electionId);

    // Auto-close election if end time has passed
    const nowIso = new Date().toISOString();
    if (election.status === 'OPEN' && nowIso > election.endTime) {
      election.status = 'CLOSED';
      await ctx.stub.putState(
        this.electionKey(electionId),
        new Uint8Array(Buffer.from(JSON.stringify(election))),
      );
    }

    if (election.status !== 'OPEN') {
      throw new Error(`Election ${electionId} is not OPEN for voting`);
    }

    // voter must exist in private registry
    const voter = await this.getVoterPrivate(ctx, electionId, voterId);
    if (!voter) {
      throw new Error(`Voter ${voterId} is not registered for election ${electionId}`);
    }

    // Idempotency / double-vote check
    if (voter.hasVoted) {
      const existingBytes = await ctx.stub.getPrivateData(this.PDC_BALLOTS, this.ballotKey(electionId, voterId));
      if (existingBytes && existingBytes.length > 0) {
        const existing = JSON.parse(Buffer.from(existingBytes).toString('utf8')) as PrivateBallotEnvelope;
        // If ciphertext matches exactly, treat as idempotent
        if (existing.ciphertextB64 === ciphertextB64) return;
      }
      throw new Error(`Voter ${voterId} has already cast a ballot for election ${electionId}`);
    }

    const selections = this.parseSelections(selectionsJson);

    // Validate selections against positions/candidates and maxVotes
    const positionsById: Record<string, Position> = {};
    const countsByPosition: Record<string, number> = {};

    for (const sel of selections) {
      const posId = sel.positionId;

      if (!positionsById[posId]) {
        positionsById[posId] = await this.getPosition(ctx, electionId, posId);
      }
      const pos = positionsById[posId];

      if (sel.candidateId === 'ABSTAIN') continue;

      const candidateBytes = await ctx.stub.getState(this.candidateKey(electionId, posId, sel.candidateId));
      if (!candidateBytes || candidateBytes.length === 0) {
        throw new Error(`Invalid candidate ${sel.candidateId} for position ${posId} in election ${electionId}`);
      }

      countsByPosition[posId] = (countsByPosition[posId] ?? 0) + 1;
      if (countsByPosition[posId] > pos.maxVotes) {
        throw new Error(`Too many selections for position ${posId}. Max allowed is ${pos.maxVotes}`);
      }
    }

    // Deterministic timestamp (same on all endorsers)
    const txTimestamp = ctx.stub.getTxTimestamp();
    const castAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

    // Store private encrypted envelope
    const envelope: PrivateBallotEnvelope = {
      electionId,
      voterId,
      castAt,
      ciphertextB64: ciphertextB64.trim(),
      enc: 'SEB_PUBKEY_BOX_V1',
    };

    await ctx.stub.putPrivateData(
      this.PDC_BALLOTS,
      this.ballotKey(electionId, voterId),
      new Uint8Array(Buffer.from(JSON.stringify(envelope))),
    );

    // Update private voter status
    voter.hasVoted = true;
    voter.votedAt = castAt;
    await ctx.stub.putPrivateData(this.PDC_VOTERS, this.voterKey(electionId, voterId), new Uint8Array(Buffer.from(JSON.stringify(voter))));

    // Update PUBLIC tallies (do not count ABSTAIN)
    for (const sel of selections) {
      if (sel.candidateId === 'ABSTAIN') continue;

      const tKey = this.tallyKey(electionId, sel.positionId, sel.candidateId);
      const curBytes = await ctx.stub.getState(tKey);

      let cur = 0;
      if (curBytes && curBytes.length > 0) {
        const parsed = parseInt(Buffer.from(curBytes).toString('utf8'), 10);
        cur = Number.isFinite(parsed) ? parsed : 0;
      }
      cur += 1;

      await ctx.stub.putState(tKey, new Uint8Array(Buffer.from(cur.toString())));
    }
  }

  /**
   * SEB-only: fetches the encrypted envelope from pdcBallots.
   * Decryption happens off-chain using SEB private key.
   */
  public async GetEncryptedBallot(ctx: Context, electionId: string, voterId: string): Promise<string> {
    this.requireSEB(ctx);

    const key = this.ballotKey(electionId, voterId);
    const bytes = await ctx.stub.getPrivateData(this.PDC_BALLOTS, key);
    if (!bytes || bytes.length === 0) {
      throw new Error(`No encrypted ballot found for voter ${voterId} in election ${electionId}`);
    }
    return Buffer.from(bytes).toString('utf8');
  }

  /**
   * Publicly verifiable hash for audit (no guard).
   * Private data hash is visible even to non-members; good for auditors/validators.
   */
  public async GetBallotHash(
    ctx: Context,
    electionId: string,
    voterId: string,
  ): Promise<string> {
    const key = this.ballotKey(electionId, voterId);
    const hashBytes = await ctx.stub.getPrivateDataHash(this.PDC_BALLOTS, key);
  
    if (!hashBytes || hashBytes.length === 0) {
      return '';
    }
  
    return Buffer.from(hashBytes).toString('base64');
  }

  // ---------------- RESULTS (PUBLIC) ----------------
  public async GetElectionResults(ctx: Context, electionId: string): Promise<string> {
    const prefix = `TALLY_${electionId}_`;
    const iterator = await ctx.stub.getStateByRange(prefix, prefix + '~');

    const results: PositionResults = {};

    for (let res = await iterator.next(); !res.done; res = await iterator.next()) {
      if (!res.value?.key || !res.value?.value) continue;

      const key = res.value.key; // TALLY_electionId_positionId_candidateId...
      const parts = key.split('_');
      if (parts.length < 4) continue;

      const posId = parts[2];
      const candId = parts.slice(3).join('_');

      const count = parseInt(Buffer.from(res.value.value).toString('utf8'), 10);
      const safeCount = Number.isFinite(count) ? count : 0;
      if (!results[posId]) results[posId] = {};
      results[posId][candId] = safeCount;
    }

    await iterator.close();
    return JSON.stringify(results);
  }

  // ---------------- INTERNAL HELPERS ----------------
  private parseSelections(selectionsJson: string): BallotSelection[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(selectionsJson);
    } catch {
      throw new Error('selectionsJson must be valid JSON');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('selectionsJson must be a JSON array of { positionId, candidateId }');
    }

    const out: BallotSelection[] = [];
    for (const item of parsed) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as any).positionId !== 'string' ||
        typeof (item as any).candidateId !== 'string'
      ) {
        throw new Error('Each selection must contain string fields: positionId, candidateId');
      }
      out.push({ positionId: (item as any).positionId, candidateId: (item as any).candidateId });
    }
    return out;
  }

  private electionKey(electionId: string): string {
    return `ELECTION_${electionId}`;
  }

  private positionKey(electionId: string, positionId: string): string {
    return `POSITION_${electionId}_${positionId}`;
  }

  private candidateKey(electionId: string, positionId: string, candidateId: string): string {
    return `CANDIDATE_${electionId}_${positionId}_${candidateId}`;
  }

  private voterKey(electionId: string, voterId: string): string {
    return `VOTER_${electionId}_${voterId}`;
  }

  private ballotKey(electionId: string, voterId: string): string {
    return `BALLOT_${electionId}_${voterId}`;
  }

  private tallyKey(electionId: string, positionId: string, candidateId: string): string {
    return `TALLY_${electionId}_${positionId}_${candidateId}`;
  }

  private async electionExists(ctx: Context, electionId: string): Promise<boolean> {
    const data = await ctx.stub.getState(this.electionKey(electionId));
    return !!data && data.length > 0;
  }

  private async getElection(ctx: Context, electionId: string): Promise<Election> {
    const bytes = await ctx.stub.getState(this.electionKey(electionId));
    if (!bytes || bytes.length === 0) throw new Error(`Election ${electionId} does not exist`);
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as Election;
  }

  private async getPosition(ctx: Context, electionId: string, positionId: string): Promise<Position> {
    const bytes = await ctx.stub.getState(this.positionKey(electionId, positionId));
    if (!bytes || bytes.length === 0) throw new Error(`Position ${positionId} does not exist for election ${electionId}`);
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as Position;
  }

  private async getVoterPrivate(ctx: Context, electionId: string, voterId: string): Promise<Voter | undefined> {
    const bytes = await ctx.stub.getPrivateData(this.PDC_VOTERS, this.voterKey(electionId, voterId));
    if (!bytes || bytes.length === 0) return undefined;
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as Voter;
  }
}

export default ECASVoteContract;
