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
  voterId: string;
  selections: BallotSelection[];
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
