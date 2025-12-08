// frontend-ecasvote/lib/ecasvoteApi.ts

const API_BASE =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:4000";

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
  const res = await fetch(`${API_BASE}/login`, {
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
  const res = await fetch(`${API_BASE}/elections/${electionId}`, {
    cache: "no-store",
  });
  
  // Return null for 404 (no election configured)
  if (res.status === 404) {
    return null;
  }
  
  return handleResponse(res);
}

export async function fetchResults(
  electionId: string
): Promise<ResultsJson | null> {
  const res = await fetch(
    `${API_BASE}/elections/${electionId}/results`,
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
  const res = await fetch(`${API_BASE}/elections/${electionId}/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  await handleResponse(res);
}

export async function closeElection(
  electionId: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/elections/${electionId}/close`, {
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
  const res = await fetch(`${API_BASE}/elections/${electionId}`, {
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
  const res = await fetch(`${API_BASE}/elections/${electionId}/voters`, {
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
  const res = await fetch(`${API_BASE}/elections/${electionId}/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return handleResponse(res);
}

export interface DashboardData {
  election: Election | null;
  statistics: {
    totalVoters: number;
    votedCount: number;
    notVotedCount: number;
  };
  announcements: Array<{
    id: number;
    action: string;
    details: any;
    createdAt: string;
  }>;
}

export async function fetchDashboard(
  electionId: string
): Promise<DashboardData | null> {
  const res = await fetch(`${API_BASE}/elections/${electionId}/dashboard`, {
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
  const res = await fetch(`${API_BASE}/elections/${electionId}/positions`, {
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
  const res = await fetch(`${API_BASE}/elections/${electionId}/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidates }),
  });

  return handleResponse(res);
}

export interface AuditLog {
  id: number;
  electionId: string | null;
  voterId: string | null;
  action: string;
  txId: string | null;
  details: any;
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
  const res = await fetch(`${API_BASE}/elections/${electionId}/audit-logs`, {
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
  const res = await fetch(`${API_BASE}/elections/${electionId}/integrity-check`, {
    cache: "no-store",
  });
  return handleResponse(res);
}
