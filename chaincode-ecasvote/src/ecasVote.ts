// src/ecasVote.ts

import { Context, Contract } from 'fabric-contract-api';

export type ElectionStatus = 'DRAFT' | 'OPEN' | 'CLOSED';

export interface Election {
  id: string;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  status: ElectionStatus;
  createdBy: string;
  createdAt: string;
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
  candidateId: string;
}

export interface Ballot {
  id: string;
  electionId: string;
  voterId: string;
  selections: BallotSelection[];
  castAt: string;
}

export class ECASVoteContract extends Contract {
  // ----------- INIT LEDGER -----------

  public async InitLedger(ctx: Context): Promise<void> {
    const electionId = 'election-2025';

    // 1. Create election if it doesn't exist
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

      await ctx.stub.putState(
        this.electionKey(electionId),
        new Uint8Array(Buffer.from(JSON.stringify(election))),
      );
    }

    // 2. Create a default position "chairperson" if it doesn't exist
    const positionId = 'chairperson';
    const positionKey = this.positionKey(electionId, positionId);
    const existingPosition = await ctx.stub.getState(positionKey);

    if (!existingPosition || existingPosition.length === 0) {
      const position: Position = {
        id: positionId,
        electionId,
        name: 'Chairperson',
        maxVotes: 1,
        order: 1,
      };

      await ctx.stub.putState(
        positionKey,
        new Uint8Array(Buffer.from(JSON.stringify(position))),
      );
    }

    // 3. Create a default candidate under that position if not existing
    const candidateId = 'cand-chair-1';
    const candidateKey = this.candidateKey(electionId, positionId, candidateId);
    const existingCandidate = await ctx.stub.getState(candidateKey);

    if (!existingCandidate || existingCandidate.length === 0) {
      const candidate: Candidate = {
        id: candidateId,
        electionId,
        positionId,
        name: 'Juan Dela Cruz',
        party: 'Party A',
        program: 'BSCS',
        yearLevel: '4',
      };

      await ctx.stub.putState(
        candidateKey,
        new Uint8Array(Buffer.from(JSON.stringify(candidate))),
      );
    }
  }
  

  // ----------- ELECTION LIFECYCLE -----------

  public async CreateElection(
    ctx: Context,
    electionId: string,
    name: string,
    description: string,
    startTime: string,
    endTime: string,
    createdBy: string,
  ): Promise<void> {
    const exists = await this.electionExists(ctx, electionId);
    if (exists) {
      throw new Error(`Election ${electionId} already exists`);
    }

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

    await ctx.stub.putState(
      this.electionKey(electionId),
      new Uint8Array(Buffer.from(JSON.stringify(election))),
    );
  }

  public async OpenElection(ctx: Context, electionId: string): Promise<void> {
    const election = await this.getElection(ctx, electionId);
    if (election.status === 'OPEN') {
      // Already open, idempotent - just return
      return;
    }
    if (election.status === 'CLOSED') {
      throw new Error(`Election ${electionId} is CLOSED and cannot be reopened`);
    }
    if (election.status !== 'DRAFT') {
      throw new Error(`Election ${electionId} is not in DRAFT status`);
    }
    election.status = 'OPEN';
    await ctx.stub.putState(
      this.electionKey(electionId),
      new Uint8Array(Buffer.from(JSON.stringify(election))),
    );
  }

  public async CloseElection(ctx: Context, electionId: string): Promise<void> {
    const election = await this.getElection(ctx, electionId);
    if (election.status !== 'OPEN') {
      throw new Error(`Election ${electionId} is not OPEN`);
    }
    election.status = 'CLOSED';
    await ctx.stub.putState(
      this.electionKey(electionId),
      new Uint8Array(Buffer.from(JSON.stringify(election))),
    );
  }

  public async GetElection(ctx: Context, electionId: string): Promise<string> {
    const election = await this.getElection(ctx, electionId);
    return JSON.stringify(election);
  }

  // ----------- POSITIONS & CANDIDATES -----------

  public async AddPosition(
    ctx: Context,
    electionId: string,
    positionId: string,
    name: string,
    maxVotes: number,
    order: number,
  ): Promise<void> {
    const election = await this.getElection(ctx, electionId);
    if (election.status !== 'DRAFT') {
      throw new Error(`Cannot modify positions; election ${electionId} is not DRAFT`);
    }

    const key = this.positionKey(electionId, positionId);
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      throw new Error(`Position ${positionId} already exists for election ${electionId}`);
    }

    const pos: Position = {
      id: positionId,
      electionId,
      name,
      maxVotes,
      order,
    };

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
    const election = await this.getElection(ctx, electionId);
    if (election.status !== 'DRAFT') {
      throw new Error(`Cannot register candidates; election ${electionId} is not DRAFT`);
    }

    // Ensure position exists
    const position = await this.getPosition(ctx, electionId, positionId);
    if (!position) {
      throw new Error(`Position ${positionId} does not exist for election ${electionId}`);
    }

    const key = this.candidateKey(electionId, positionId, candidateId);
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      throw new Error(`Candidate ${candidateId} already exists for position ${positionId}`);
    }

    const candidate: Candidate = {
      id: candidateId,
      electionId,
      positionId,
      name,
      party,
      program,
      yearLevel,
    };

    await ctx.stub.putState(key, new Uint8Array(Buffer.from(JSON.stringify(candidate))));
  }

  public async GetCandidatesByElection(ctx: Context, electionId: string): Promise<string> {
    const prefix = `CANDIDATE_${electionId}_`;
    const iterator = await ctx.stub.getStateByRange(prefix, prefix + '~');
    const results: Candidate[] = [];

    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value && res.value.value.toString()) {
        results.push(JSON.parse(res.value.value.toString()) as Candidate);
      }
      res = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  public async GetCandidatesByPosition(
    ctx: Context,
    electionId: string,
    positionId: string,
  ): Promise<string> {
    const prefix = this.candidateKey(electionId, positionId, '');
    const iterator = await ctx.stub.getStateByRange(prefix, prefix + '~');
    const results: Candidate[] = [];

    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value && res.value.value.toString()) {
        results.push(JSON.parse(res.value.value.toString()) as Candidate);
      }
      res = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  // ----------- VOTERS & BALLOTS -----------

  public async RegisterVoter(
    ctx: Context,
    electionId: string,
    voterId: string,
  ): Promise<void> {
    const election = await this.getElection(ctx, electionId);
    if (election.status === 'CLOSED') {
      throw new Error(`Cannot register voters; election ${electionId} is CLOSED`);
    }

    const key = this.voterKey(electionId, voterId);
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      // Voter already registered, idempotent - just return
      return;
    }

    const voter: Voter = {
      id: voterId,
      electionId,
      hasVoted: false,
    };

    await ctx.stub.putState(key, new Uint8Array(Buffer.from(JSON.stringify(voter))));
  }

  /**
   * selectionsJson: JSON string of [{ positionId, candidateId }, ...]
   */
  public async CastVote(
    ctx: Context,
    electionId: string,
    voterId: string,
    selectionsJson: string,
  ): Promise<void> {
    const election = await this.getElection(ctx, electionId);
    if (election.status !== 'OPEN') {
      throw new Error(`Election ${electionId} is not OPEN for voting`);
    }

    const voter = await this.getVoter(ctx, electionId, voterId);
    if (!voter) {
      throw new Error(`Voter ${voterId} is not registered for election ${electionId}`);
    }
    
    // Check if voter has already voted - if so, verify it's the same vote (idempotent)
    if (voter.hasVoted) {
      const existingBallotKey = this.ballotKey(electionId, voterId);
      const existingBallotBytes = await ctx.stub.getState(existingBallotKey);
      if (existingBallotBytes && existingBallotBytes.length > 0) {
        const existingBallot = JSON.parse(existingBallotBytes.toString()) as Ballot;
        const newSelections: BallotSelection[] = JSON.parse(selectionsJson);
        // Compare selections (simple string comparison for idempotency)
        if (JSON.stringify(existingBallot.selections) === JSON.stringify(newSelections)) {
          // Same vote, idempotent - just return
          return;
        }
      }
      throw new Error(`Voter ${voterId} has already cast a ballot for election ${electionId}`);
    }

    const selections: BallotSelection[] = JSON.parse(selectionsJson);

    // Validate selections against positions/candidates and maxVotes
    const positionsById: Record<string, Position> = {};
    const countsByPosition: Record<string, number> = {};

    for (const sel of selections) {
      const posId = sel.positionId;

      if (!positionsById[posId]) {
        positionsById[posId] = await this.getPosition(ctx, electionId, posId);
      }
      const pos = positionsById[posId];

      if (!pos) {
        throw new Error(`Invalid position ${posId} in ballot`);
      }

      // ensure candidate exists for that position
      const candidateBytes = await ctx.stub.getState(
        this.candidateKey(electionId, posId, sel.candidateId),
      );
      if (!candidateBytes || candidateBytes.length === 0) {
        throw new Error(
          `Invalid candidate ${sel.candidateId} for position ${posId} in election ${electionId}`,
        );
      }

      countsByPosition[posId] = (countsByPosition[posId] ?? 0) + 1;
      if (countsByPosition[posId] > pos.maxVotes) {
        throw new Error(
          `Too many selections for position ${posId}. Max allowed is ${pos.maxVotes}`,
        );
      }
    }

    // Use transaction timestamp for determinism across all peers
    const txTimestamp = ctx.stub.getTxTimestamp();
    const castAt = new Date(txTimestamp.seconds.toNumber() * 1000).toISOString();

    const ballotId = `ballot-${electionId}-${voterId}`;
    const ballot: Ballot = {
      id: ballotId,
      electionId,
      voterId,
      selections,
      castAt,
    };

    await ctx.stub.putState(
      this.ballotKey(electionId, voterId),
      new Uint8Array(Buffer.from(JSON.stringify(ballot))),
    );

    voter.hasVoted = true;
    voter.votedAt = ballot.castAt;
    await ctx.stub.putState(
      this.voterKey(electionId, voterId),
      new Uint8Array(Buffer.from(JSON.stringify(voter))),
    );
  }

  public async GetBallot(
    ctx: Context,
    electionId: string,
    voterId: string,
  ): Promise<string> {
    const key = this.ballotKey(electionId, voterId);
    const bytes = await ctx.stub.getState(key);
    if (!bytes || bytes.length === 0) {
      throw new Error(`No ballot found for voter ${voterId} in election ${electionId}`);
    }
    return bytes.toString();
  }

  // ----------- RESULTS -----------

  public async GetElectionResults(ctx: Context, electionId: string): Promise<string> {
    // Iterate over all ballots for this election and count per candidate
    const prefix = `BALLOT_${electionId}_`;
    const iterator = await ctx.stub.getStateByRange(prefix, prefix + '~');

    type CandidateCounts = Record<string, number>;
    type PositionResults = Record<string, CandidateCounts>;

    const results: PositionResults = {};

    let res = await iterator.next();
    while (!res.done) {
      if (res.value && res.value.value && res.value.value.toString()) {
        const ballot = JSON.parse(res.value.value.toString()) as Ballot;

        for (const sel of ballot.selections) {
          if (!results[sel.positionId]) {
            results[sel.positionId] = {};
          }
          const posMap = results[sel.positionId];
          posMap[sel.candidateId] = (posMap[sel.candidateId] ?? 0) + 1;
        }
      }
      res = await iterator.next();
    }
    await iterator.close();

    return JSON.stringify(results);
  }

  // ----------- INTERNAL HELPERS -----------

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

  private async electionExists(ctx: Context, electionId: string): Promise<boolean> {
    const data = await ctx.stub.getState(this.electionKey(electionId));
    return !!data && data.length > 0;
  }

  private async getElection(ctx: Context, electionId: string): Promise<Election> {
    const bytes = await ctx.stub.getState(this.electionKey(electionId));
    if (!bytes || bytes.length === 0) {
      throw new Error(`Election ${electionId} does not exist`);
    }
    return JSON.parse(bytes.toString()) as Election;
  }

  private async getPosition(
    ctx: Context,
    electionId: string,
    positionId: string,
  ): Promise<Position> {
    const bytes = await ctx.stub.getState(this.positionKey(electionId, positionId));
    if (!bytes || bytes.length === 0) {
      throw new Error(`Position ${positionId} does not exist for election ${electionId}`);
    }
    return JSON.parse(bytes.toString()) as Position;
  }

  private async getVoter(
    ctx: Context,
    electionId: string,
    voterId: string,
  ): Promise<Voter | undefined> {
    const bytes = await ctx.stub.getState(this.voterKey(electionId, voterId));
    if (!bytes || bytes.length === 0) {
      return undefined;
    }
    return JSON.parse(bytes.toString()) as Voter;
  }
}

export default ECASVoteContract;
