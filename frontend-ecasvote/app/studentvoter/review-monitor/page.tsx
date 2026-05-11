"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchReviewMonitorCurrent,
  confirmScanSession,
  rescanScanSession,
  fetchPositions,
  type Position,
} from "@/lib/ecasvoteApi";

type SessionStatus = "WAITING" | "SCANNED" | "CONFIRMED" | "RESCAN" | "SUBMITTED";

function isAbstainMark(token: string): boolean {
  const t = token.trim().toLowerCase();
  return t === "abstain" || t.startsWith("abstain");
}

/** Mirrors gateway scan session snapshot (GET /review-monitor/current). */
interface ScanSessionReviewDisplayRow {
  id: string;
  name: string;
  maxVotes?: number;
  order?: number;
  candidates: Array<{ id: string; name: string; party?: string | null }>;
}

interface ScanSession {
  id: string;
  electionId: string;
  ballotToken: string;
  selections: Record<string, string>;
  ballotStatus: string;
  status: SessionStatus;
  /** Populated by gateway when the scan session is created — avoids a separate Fabric-backed fetch from this page. */
  reviewDisplay?: ScanSessionReviewDisplayRow[];
}

function reviewDisplayToPositions(
  electionId: string,
  rows: ScanSessionReviewDisplayRow[]
): Position[] {
  return rows.map((p, idx) => ({
    id: p.id,
    electionId,
    name: p.name,
    maxVotes: Math.max(1, p.maxVotes ?? 1),
    order: p.order ?? idx + 1,
    candidates: p.candidates.map((c) => ({
      id: c.id,
      electionId,
      positionId: p.id,
      name: c.name,
      party: c.party ?? undefined,
    })),
  }));
}

export default function ReviewMonitorPage() {
  const [session, setSession] = useState<ScanSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("WAITING");
  const [positions, setPositions] = useState<Position[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const lastElectionId = useRef("");

  // Poll for active session
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await fetchReviewMonitorCurrent();
        if (!active) return;
        if (data.status === "WAITING" || !data.id) {
          if (status !== "WAITING" && !flash) {
            setSession(null);
            setStatus("WAITING");
            // Clear positions and ref so next session re-fetches
            setPositions([]);
            lastElectionId.current = "";
          }
        } else {
          setSession(data);
          setStatus(data.status);
          const eid = data.electionId as string | undefined;
          const embedded =
            Array.isArray(data.reviewDisplay) && data.reviewDisplay.length > 0;
          if (eid && data.id) {
            if (embedded) {
              lastElectionId.current = eid;
              if (active) setPositions([]);
            } else if (lastElectionId.current !== eid) {
              lastElectionId.current = eid;
              try {
                const pos = await fetchPositions(eid);
                if (active) setPositions(pos);
              } catch {
                lastElectionId.current = "";
                if (active) setPositions([]);
              }
            }
          }
        }
      } catch {
        // ignore poll errors
      }
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [status, flash]);

  const handleConfirm = useCallback(async () => {
    if (!session?.id) return;
    setSubmitting(true);
    try {
      await confirmScanSession(session.id);
      setFlash("SUBMITTED");
      setSession(null);
      setStatus("WAITING");
      setTimeout(() => setFlash(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Confirm failed";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  }, [session]);

  const handleRescan = useCallback(async () => {
    if (!session?.id) return;
    try {
      await rescanScanSession(session.id);
      setSession(null);
      setStatus("WAITING");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Rescan failed";
      alert(msg);
    }
  }, [session]);

  const effectivePositions = useMemo((): Position[] => {
    const eid = session?.electionId?.trim() ?? "";
    const rd = session?.reviewDisplay;
    if (rd && rd.length > 0 && eid) {
      return reviewDisplayToPositions(eid, rd);
    }
    return positions;
  }, [session?.reviewDisplay, session?.electionId, positions]);

  const positionMap = useMemo(
    () => new Map(effectivePositions.map((p) => [p.id, p])),
    [effectivePositions]
  );

  /**
   * OMR optionIds often use `{printPrefix}__{shortSlug}` where chain id is `cand-{shortSlug}` or the full slug.
   */
  const resolveCandidateDisplay = useMemo(() => {
    const electionId = session?.electionId?.trim() ?? "";
    const posById = new Map(effectivePositions.map((p) => [p.id, p]));
    const byKey = new Map<string, { name: string; party?: string | null }>();
    for (const pos of effectivePositions) {
      for (const c of pos.candidates) {
        const meta = { name: c.name, party: c.party };
        byKey.set(c.id, meta);
        if (electionId) {
          byKey.set(`${electionId}__${c.id}`, meta);
        }
      }
    }

    return (
      positionId: string,
      candidateToken: string
    ):
      | { kind: "candidate"; name: string; party?: string | null }
      | { kind: "abstain" }
      | null => {
      const raw = candidateToken.trim();
      if (!raw) return null;
      if (isAbstainMark(raw)) return { kind: "abstain" };

      let meta = byKey.get(raw);
      if (meta) return { kind: "candidate", ...meta };

      if (electionId && raw.startsWith(`${electionId}__`)) {
        meta = byKey.get(raw.slice(`${electionId}__`.length));
        if (meta) return { kind: "candidate", ...meta };
      }

      const sep = raw.lastIndexOf("__");
      if (sep !== -1) {
        const tail = raw.slice(sep + 2);
        meta = byKey.get(tail);
        if (meta) return { kind: "candidate", ...meta };
        if (tail && !tail.startsWith("cand-")) {
          meta = byKey.get(`cand-${tail}`);
          if (meta) return { kind: "candidate", ...meta };
        }
      }

      const pos = posById.get(positionId);
      if (pos) {
        const tail =
          sep !== -1 ? raw.slice(sep + 2) : "";
        const hit = pos.candidates.find((c) => {
          if (c.id === raw || raw === `${electionId}__${c.id}` || raw.endsWith(`__${c.id}`)) {
            return true;
          }
          if (tail) {
            return c.id === tail || c.id === `cand-${tail}`;
          }
          return false;
        });
        if (hit) return { kind: "candidate", name: hit.name, party: hit.party };
      }

      return null;
    };
  }, [effectivePositions, session?.electionId]);

  // Flash screen after submission
  if (flash === "SUBMITTED") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-600">
        <div className="text-center text-white space-y-4">
          <div className="text-8xl">&#10003;</div>
          <h1 className="text-5xl font-bold">Vote Submitted!</h1>
          <p className="text-2xl opacity-80">Thank you. Returning to waiting...</p>
        </div>
      </div>
    );
  }

  // Waiting state
  if (status === "WAITING" || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center space-y-6">
          <div className="animate-pulse text-7xl text-gray-400">&#9673;</div>
          <h1 className="text-4xl font-bold text-gray-600">
            Waiting for ballot scan...
          </h1>
          <p className="text-xl text-gray-400">
            This monitor will display your ballot for review once scanned.
          </p>
        </div>
      </div>
    );
  }

  // Scanned — show selections for voter review
  const entries = Object.entries(session.selections);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#7b1113] text-white py-6 px-8 shadow-lg">
        <h1 className="text-3xl font-bold text-center">
          Review Your Ballot
        </h1>
        <p className="text-center text-lg opacity-80 mt-1">
          Please verify your selections below, then confirm or request a rescan.
        </p>
      </header>

      {/* Selections */}
      <main className="flex-1 max-w-3xl mx-auto w-full py-8 px-6 space-y-4">
        {session.ballotStatus === "INVALID" && (
          <div className="bg-red-100 border-2 border-red-400 rounded-xl p-6 text-center">
            <p className="text-2xl font-bold text-red-700">
              Ballot Marked as INVALID
            </p>
            <p className="text-lg text-red-600 mt-2">
              This ballot has issues (overvote, missing marks, or improper markings).
              The token will be used but votes will not be counted.
            </p>
          </div>
        )}

        {entries.length === 0 && session.ballotStatus !== "INVALID" && (
          <div className="text-center text-gray-400 text-2xl py-12">
            No selections detected on this ballot.
          </div>
        )}

        {entries.map(([positionId, candidateValue]) => {
          const positionTitle =
            positionMap.get(positionId)?.name ?? positionId;
          const candidateIds =
            typeof candidateValue === "string"
              ? candidateValue
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];

          return (
            <div
              key={positionId}
              className="bg-white rounded-xl shadow-md p-6 border border-gray-200"
            >
              <h2 className="text-xl font-bold text-gray-800 mb-3">
                {positionTitle}
              </h2>
              <div className="space-y-2">
                {candidateIds.length === 0 && (
                  <div className="text-lg text-gray-400 italic pl-2">
                    No selection
                  </div>
                )}
                {candidateIds.map((cid, idx) => {
                  const resolved = resolveCandidateDisplay(positionId, cid);
                  if (resolved?.kind === "abstain") {
                    return (
                      <div
                        key={`${positionId}-abstain-${idx}`}
                        className="text-lg text-gray-500 italic pl-2"
                      >
                        ABSTAIN
                      </div>
                    );
                  }
                  if (resolved?.kind === "candidate") {
                    return (
                      <div
                        key={`${positionId}-cand-${idx}-${cid}`}
                        className="flex items-center gap-3 text-lg pl-2"
                      >
                        <span className="w-3 h-3 rounded-full bg-[#7b1113] flex-shrink-0" />
                        <span className="font-semibold text-gray-800">
                          {resolved.name}
                        </span>
                        {resolved.party ? (
                          <span className="text-gray-400 text-base">
                            ({resolved.party})
                          </span>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`${positionId}-raw-${idx}-${cid}`}
                      className="flex items-center gap-3 text-lg pl-2"
                    >
                      <span className="w-3 h-3 rounded-full bg-[#7b1113] flex-shrink-0" />
                      <span className="font-semibold text-gray-800">{cid}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </main>

      {/* Action buttons */}
      <footer className="sticky bottom-0 bg-white border-t-2 border-gray-200 py-6 px-8 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
        <div className="max-w-3xl mx-auto flex gap-6">
          <button
            onClick={handleRescan}
            disabled={submitting}
            className="flex-1 py-5 text-2xl font-bold rounded-xl border-2 border-red-600 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            &#10007; Rescan Ballot
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 py-5 text-2xl font-bold rounded-xl bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "\u2713 Confirm My Vote"}
          </button>
        </div>
      </footer>
    </div>
  );
}
