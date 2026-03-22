// frontend-ecasvote/lib/ecasvoteApi.ts

/**
 * Gateway base URL for `fetch`.
 * - If `NEXT_PUBLIC_GATEWAY_URL` is set, it wins (trimmed, no trailing slash).
 * - In the **browser**, when unset, uses `/ecasvote-gateway` so requests go through
 *   Next.js rewrites to the real API (default `http://127.0.0.1:4000`). That avoids
 *   accidentally calling port 3000 (this app), which has no `/voters/import` route.
 * - On the **server** (SSR), defaults to `GATEWAY_INTERNAL_URL` or `http://127.0.0.1:4000`.
 */
export function getGatewayBase(): string {
  const env = process.env.NEXT_PUBLIC_GATEWAY_URL?.trim();
  if (env) {
    const cleaned = env.replace(/\/$/, "");
    // Common mistake: pointing at the Next dev server (:3000), which has no /voters/import etc.
    if (
      typeof window !== "undefined" &&
      /:(3000)(\/|$)/.test(cleaned) &&
      (cleaned.includes("localhost") || cleaned.includes("127.0.0.1"))
    ) {
      return "/ecasvote-gateway";
    }
    return cleaned;
  }
  if (typeof window !== "undefined") return "/ecasvote-gateway";
  return process.env.GATEWAY_INTERNAL_URL?.trim() || "http://127.0.0.1:4000";
}

export type ElectionStatus = "DRAFT" | "OPEN" | "CLOSED";

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

export type ResultsJson = Record<string, Record<string, number>>;

export interface BallotSelection {
  positionId: string;
  candidateId: string;
}

export interface CastVotePayload {
  studentNumber: string;
  selections: BallotSelection[];
}

export interface LoginResponse {
  ok: boolean;
  message: string;
  voter: {
    id: number;
    studentNumber: string;
    upEmail: string;
    fullName: string;
    program: string;
    yearLevel: number;
    department: string;
  };
}

export async function login(
  studentNumber: string,
  upEmail?: string
): Promise<LoginResponse> {
  const res = await fetch(`${getGatewayBase()}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentNumber, upEmail }),
  });

  return handleResponse(res);
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  // For some endpoints we don't care about body; just try parse JSON if present
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return null;
}

export async function fetchElection(
  electionId: string
): Promise<Election | null> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}`, {
    cache: "no-store",
  });
  
  // Return null for 404 (no election configured)
  if (res.status === 404) {
    return null;
  }
  
  return handleResponse(res);
}

export async function fetchElections(): Promise<Election[]> {
  const res = await fetch(`${getGatewayBase()}/elections`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface CreateElectionPayload {
  electionId: string;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  createdBy?: string;
}

export async function createElection(
  payload: CreateElectionPayload
): Promise<Election> {
  const res = await fetch(`${getGatewayBase()}/elections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function fetchResults(
  electionId: string
): Promise<ResultsJson | null> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${electionId}/results`,
    { cache: "no-store" }
  );
  
  // Return null for 404 (no election configured)
  if (res.status === 404) {
    return null;
  }
  
  return handleResponse(res);
}

export async function openElection(
  electionId: string
): Promise<void> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  await handleResponse(res);
}

export async function closeElection(
  electionId: string
): Promise<void> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  await handleResponse(res);
}

export interface UpdateElectionPayload {
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
}

export async function updateElection(
  electionId: string,
  payload: UpdateElectionPayload
): Promise<void> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  await handleResponse(res);
}

export async function registerVoter(
  electionId: string,
  voterId: string
): Promise<void> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/voters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voterId }),
  });

  await handleResponse(res);
}

export interface CastVoteResponse {
  ok: boolean;
  message: string;
  transactionId: string;
}

export async function castVote(
  electionId: string,
  payload: CastVotePayload
): Promise<CastVoteResponse> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return handleResponse(res);
}

export interface TurnoutDepartmentRow {
  name: string;
  total: number;
  voted: number;
  notVoted: number;
}

export interface TurnoutYearRow {
  yearLevel: number;
  total: number;
  voted: number;
  notVoted: number;
}

export interface TurnoutProgramRow {
  program: string;
  total: number;
  voted: number;
  notVoted: number;
}

export interface DashboardData {
  election: Election | null;
  statistics: {
    totalVoters: number;
    votedCount: number;
    notVotedCount: number;
    byDepartment: TurnoutDepartmentRow[];
    byYearLevel: TurnoutYearRow[];
    byProgram: TurnoutProgramRow[];
  };
  announcements: Array<{
    id: number;
    action: string;
    txId: string | null;
    details: any;
    createdAt: string;
  }>;
}

export async function fetchDashboard(
  electionId: string
): Promise<DashboardData | null> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/dashboard`, {
    cache: "no-store",
  });
  
  // Return null for 404 (no election configured)
  if (res.status === 404) {
    return null;
  }
  
  return handleResponse(res);
}

export interface Position {
  id: string;
  electionId: string;
  name: string;
  maxVotes: number;
  order: number;
  candidates: Array<{
    id: string;
    electionId: string;
    positionId: string;
    name: string;
    party?: string;
    program?: string;
    yearLevel?: string;
  }>;
}

export async function fetchPositions(
  electionId: string
): Promise<Position[]> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/positions`, {
    cache: "no-store",
  });
  
  if (!res.ok) {
    throw new Error(`Failed to fetch positions: ${res.statusText}`);
  }
  
  return handleResponse(res);
}

export interface CreateCandidatePayload {
  positionName: string;
  name: string;
  party?: string;
  yearLevel?: string;
  program?: string;
}

export interface CreateCandidatesResponse {
  ok: boolean;
  candidates: Array<{
    id: string;
    electionId: string;
    positionId: string;
    name: string;
    party?: string;
    program?: string;
    yearLevel?: string;
  }>;
  count: number;
}

export async function createCandidates(
  electionId: string,
  candidates: CreateCandidatePayload[]
): Promise<CreateCandidatesResponse> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates }),
  });

  return handleResponse(res);
}

export interface Selection {
  positionId: string;
  candidateId: string;
}

export interface AuditLogDetails {
  blockNumber?: number;
  function?: string;
  endorsers?: string;
  validation?: string;
  selections?: Selection[];
}

export interface AuditLog {
  id: number;
  electionId: string | null;
  voterId: string | null;
  action: string;
  txId: string | null;
  details: AuditLogDetails | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  ok: boolean;
  logs: AuditLog[];
  count: number;
}

export async function fetchAuditLogs(
  electionId: string
): Promise<AuditLogsResponse> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/audit-logs`, {
    cache: "no-store",
  });
  return handleResponse(res);
}

export interface IntegrityCheckData {
  blockchainResults: ResultsJson;
  databaseResults: ResultsJson;
  comparison: Array<{
    position: string;
    candidate: string;
    blockchainCount: number;
    databaseCount: number;
    match: boolean;
  }>;
  totals: {
    blockchain: number;
    database: number;
    match: boolean;
  };
  hasMismatch: boolean;
  timestamp: string;
}

export async function fetchIntegrityCheck(
  electionId: string
): Promise<IntegrityCheckData> {
  const res = await fetch(`${getGatewayBase()}/elections/${electionId}/integrity-check`, {
    cache: "no-store",
  });
  return handleResponse(res);
}

export interface VoterRecord {
  id: number;
  studentNumber: string;
  upEmail: string;
  fullName: string;
  college: string;
  department: string;
  program: string;
  yearLevel: number;
  status: string;
  isEligible: boolean;
  hasVoted: boolean;
  /** Present when loaded via GET /elections/:id/voters — vote or paper used for that election. */
  hasVotedThisElection?: boolean;
  votedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchVoters(): Promise<VoterRecord[]> {
  const res = await fetch(`${getGatewayBase()}/voters`, { cache: "no-store" });
  return handleResponse(res);
}

/**
 * Student voter roster for the selected election (who was added to this election only), not the full global registry.
 * pool=eligible: full roster for this election. pool=active: roster members who have a digital vote or paper issuance.
 */
export async function fetchElectionVoters(
  electionId: string,
  pool: "eligible" | "active" = "eligible"
): Promise<VoterRecord[]> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(electionId)}/voters?pool=${pool}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) throw new Error(j.error);
    } catch (e) {
      if (e instanceof Error && e.message !== "Unexpected token") throw e;
    }
    throw new Error(text || `election voters failed (${res.status})`);
  }
  const data = (await res.json()) as { voters?: VoterRecord[] };
  return Array.isArray(data.voters) ? data.voters : [];
}

/** Add every CAS enrolled eligible student in the registry to this election's roster (idempotent). */
export async function syncCasEligibleToElectionRoster(electionId: string): Promise<{
  ok: boolean;
  added: number;
  totalOnRoster: number;
}> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(electionId)}/voters/roster/sync-cas-eligible`,
    { method: "POST" }
  );
  return handleResponse(res);
}

/** Remove a student from this election's roster only (does not delete the voter from the registry). */
export async function removeVoterFromElectionRoster(
  electionId: string,
  voterId: number
): Promise<void> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(electionId)}/voters/roster/${voterId}`,
    { method: "DELETE" }
  );
  await handleResponse(res);
}

export type VoterImportPayload = {
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

export interface ImportVotersResult {
  ok: boolean;
  created: number;
  updated: number;
  total: number;
  failed: number;
  errors: Array<{ index: number; studentNumber?: string; message: string }>;
}

export async function importVoters(
  voters: VoterImportPayload[]
): Promise<ImportVotersResult> {
  const res = await fetch(`${getGatewayBase()}/voters/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ voters }),
  });
  return handleResponse(res);
}

export type VoterUpdatePayload = Partial<
  Pick<
    VoterRecord,
    | "studentNumber"
    | "upEmail"
    | "fullName"
    | "college"
    | "department"
    | "program"
    | "yearLevel"
    | "status"
    | "isEligible"
  >
>;

export async function updateVoter(
  id: number,
  data: VoterUpdatePayload
): Promise<VoterRecord> {
  const res = await fetch(`${getGatewayBase()}/voters/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteVoter(id: number): Promise<{ ok: boolean }> {
  const res = await fetch(`${getGatewayBase()}/voters/${id}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

/** Paper ballot tokens issued for an election (private mapping voter ↔ token; this list is admin-only). */
export interface PaperTokenRow {
  studentNumber: string;
  ballotToken: string;
  timeCreated: string;
  status: "Used" | "Unused";
  timeUsed?: string;
}

export interface PaperTokensResponse {
  electionId: string;
  stats: {
    totalIssued: number;
    used: number;
    unused: number;
  };
  tokens: PaperTokenRow[];
}

export async function fetchPaperTokens(
  electionId: string
): Promise<PaperTokensResponse> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(electionId)}/paper-tokens`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) throw new Error(j.error);
    } catch (e) {
      if (e instanceof Error && e.message !== "Unexpected token") throw e;
    }
    throw new Error(text || `Failed to load paper tokens (${res.status})`);
  }
  return res.json();
}

/** Eligible voters + paper ballot status (for admin issue / token page). */
export interface PaperCheckInVoter {
  voterId: number;
  studentNumber: string;
  name: string;
  paperStatus: "Not Issued" | "Issued" | "Voted";
  ballotToken: string | null;
  /** Digital vote recorded for this election (off-chain Vote row). */
  votedDigital?: boolean;
  /** Digital vote or any paper row for this election (for filtering “in this election”). */
  hasElectionActivity?: boolean;
}

export async function fetchPaperCheckIn(
  electionId: string
): Promise<{ electionId: string; voters: PaperCheckInVoter[] }> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(electionId)}/paper-check-in`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) throw new Error(j.error);
    } catch (e) {
      if (e instanceof Error && !text.startsWith("{")) throw new Error(text);
      throw e;
    }
    throw new Error(text || `paper-check-in failed (${res.status})`);
  }
  return res.json();
}

export interface IssuePaperBallotResult {
  electionId: string;
  ballotToken: string;
  templateVersion: string;
  voterId: number;
  studentNumber: string;
  reprint?: boolean;
}

export async function issuePaperBallot(
  electionId: string,
  voterId: number
): Promise<IssuePaperBallotResult> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(electionId)}/paper-ballots/issue`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) throw new Error(j.error);
    } catch (e) {
      if (e instanceof Error && e.message !== "Unexpected token") throw e;
    }
    throw new Error(text || `issue ballot failed (${res.status})`);
  }
  return res.json();
}

export interface GenerateAllPaperTokensResult {
  ok: boolean;
  electionId: string;
  created: number;
  eligibleVoters: number;
  errors: string[];
  errorCount: number;
}

export async function generateAllPaperTokens(
  electionId: string
): Promise<GenerateAllPaperTokensResult> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(electionId)}/paper-tokens/generate-all`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) throw new Error(j.error);
    } catch (e) {
      if (e instanceof Error && e.message !== "Unexpected token") throw e;
    }
    throw new Error(text || `generate-all failed (${res.status})`);
  }
  return res.json();
}

/** GET /elections/:id/turnout — eligible CAS pool + votes cast in this election (digital + paper). */
export interface ElectionTurnoutStats {
  electionId: string;
  totalVoters: number;
  votedCount: number;
  notVotedCount: number;
  byDepartment: Array<{
    name: string;
    total: number;
    voted: number;
    notVoted: number;
  }>;
  byYearLevel: Array<{
    yearLevel: number;
    total: number;
    voted: number;
    notVoted: number;
  }>;
  byProgram: Array<{
    program: string;
    total: number;
    voted: number;
    notVoted: number;
  }>;
}

export async function fetchElectionTurnout(
  electionId: string
): Promise<ElectionTurnoutStats> {
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(electionId)}/turnout`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) throw new Error(j.error);
    } catch (e) {
      if (e instanceof Error && !text.startsWith("{")) throw new Error(text);
      throw e;
    }
    throw new Error(text || `turnout failed (${res.status})`);
  }
  return res.json();
}

export interface HourlyParticipationResponse {
  hourlyData: Array<{ hour: string; count: number }>;
  peakHour: { time: string; count: number };
  slowestHour: { time: string; count: number };
  totalVotes: number;
}

export async function fetchHourlyParticipation(
  electionId: string,
  dateYyyyMmDd: string
): Promise<HourlyParticipationResponse> {
  const q = new URLSearchParams({ date: dateYyyyMmDd });
  const res = await fetch(
    `${getGatewayBase()}/elections/${encodeURIComponent(
      electionId
    )}/hourly-participation?${q.toString()}`,
    { cache: "no-store" }
  );
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) throw new Error(j.error);
    } catch (e) {
      if (e instanceof Error && !text.startsWith("{")) throw new Error(text);
      throw e;
    }
    throw new Error(text || `hourly participation failed (${res.status})`);
  }
  return res.json();
}
