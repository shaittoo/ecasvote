"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Position } from "@/lib/ecasvoteApi";
import type { ScanResult, ContestReadItem } from "./ScanPageContent";
import { ContestResultRow } from "./ContestResultRow";

interface Props {
  open: boolean;
  onClose: () => void;
  scanResult: ScanResult;
  positions: Position[];
  electionName: string;
  submitting: boolean;
  onConfirm: (selections: Record<string, string[]>) => void;
  onRescan: () => void;
}

export function ScanResultsModal({
  open,
  onClose,
  scanResult,
  positions,
  electionName,
  submitting,
  onConfirm,
  onRescan,
}: Props) {
  const [popupBlocked, setPopupBlocked] = useState(false);

  // Filter positions: only show the governor for the voter's department
  const filteredPositions = useMemo(() => {
    const org = scanResult.academicOrg?.toLowerCase().trim();
    if (!org) return positions;
    return positions.filter((pos) => {
      const pid = pos.id.toLowerCase();
      // Keep non-governor contests
      if (!pid.includes("-governor")) return true;
      // Keep only the governor matching the voter's department
      return pid.includes(org.toLowerCase());
    });
  }, [positions, scanResult.academicOrg]);

  const contestsData = useMemo(() => {
    const contestsRead = scanResult.bubbleRead?.contestsRead ?? [];
    const contestReadMap = new Map<string, ContestReadItem>();
    for (const cr of contestsRead) {
      contestReadMap.set(cr.positionId, cr);
    }

    return filteredPositions.map((pos) => {
      const detected = scanResult.selectionsByPosition[pos.id] ?? [];
      const cr = contestReadMap.get(pos.id);
      return {
        position: pos,
        detectedSelections: detected,
        contestRead: cr ?? null,
        overvote: cr?.overvoteDetected ?? false,
      };
    });
  }, [filteredPositions, scanResult]);

  // Build selections from detected results (no override)
  const finalSelections = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const cd of contestsData) {
      result[cd.position.id] = cd.detectedSelections;
    }
    return result;
  }, [contestsData]);

  if (!open) return null;

  const isInvalid = scanResult.ballotStatus === "INVALID";

  const handleOpenVoterSnapshot = () => {
    const snapshotWin = window.open(
      "",
      "ecasvote_voter_snapshot",
      "width=960,height=700,menubar=no,toolbar=no,location=no,status=no"
    );
    if (!snapshotWin) {
      setPopupBlocked(true);
      return;
    }
    setPopupBlocked(false);

    const esc = (s: string) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const rows = contestsData
      .map((cd) => {
        const selected = cd.detectedSelections;
        const abstainId = `abstain:${cd.position.id}`;
        const hasAbstain = selected.includes(abstainId);
        const names = cd.position.candidates
          .filter((cand) => selected.includes(cand.id))
          .map((cand) =>
            cand.party ? `${esc(cand.name)} <span class="meta">(${esc(cand.party)})</span>` : esc(cand.name)
          );
        const status = cd.contestRead?.overvoteDetected ||
          cd.contestRead?.undervoteDetected ||
          cd.contestRead?.abstainConflict
          ? `<span class="badge bad">INVALID</span>`
          : `<span class="badge good">${selected.length}/${cd.position.maxVotes} selected</span>`;

        const picks =
          names.length > 0
            ? names.map((n) => `<li>${n}</li>`).join("")
            : hasAbstain
              ? "<li>Abstain</li>"
              : "<li class=\"none\">No selection</li>";

        return `<section class="card">
  <div class="head">
    <h3>${esc(cd.position.name)} <span class="meta">(max ${cd.position.maxVotes})</span></h3>
    ${status}
  </div>
  <ul>${picks}</ul>
</section>`;
      })
      .join("");

    const maskedToken = scanResult.ballotId
      ? `****${scanResult.ballotId.slice(-4)}`
      : "Unknown";

    snapshotWin.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Voter Review Snapshot</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#111827}
    .wrap{max-width:840px;margin:0 auto}
    h1{margin:0 0 6px;color:#7A0019}
    .sub{color:#6b7280;margin-bottom:14px}
    .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
    .pill{border:1px solid #d1d5db;border-radius:999px;padding:4px 10px;background:#fff;font-size:12px}
    .ok{background:#dcfce7;border-color:#86efac;color:#166534}
    .bad{background:#fee2e2;border-color:#fca5a5;color:#991b1b}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:10px}
    .head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
    h3{margin:0;font-size:16px}
    .meta{font-size:12px;color:#6b7280}
    ul{margin:0;padding-left:18px}
    li{margin:4px 0}
    .none{color:#9ca3af;font-style:italic}
    .badge{font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px}
    .good{background:#ecfeff;color:#155e75}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Review Scanned Votes</h1>
    <div class="sub">${esc(electionName)}</div>
    <div class="top">
      <span class="pill">${esc(maskedToken)}</span>
      <span class="pill ${isInvalid ? "bad" : "ok"}">${isInvalid ? "INVALID" : "VALID"}</span>
    </div>
    ${rows}
  </div>
</body>
</html>`);
    snapshotWin.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12">
      <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-xl border-b bg-white px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Review Scanned Votes
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">{electionName}</p>
            </div>
            <div className="flex items-center gap-2">
              {scanResult.ballotId && (
                <Badge variant="outline" className="font-mono text-xs">
                  {scanResult.ballotId}
                </Badge>
              )}
              <Badge
                className={
                  isInvalid
                    ? "bg-red-100 text-red-800 border-red-200"
                    : "bg-emerald-100 text-emerald-800 border-emerald-200"
                }
              >
                {isInvalid ? "INVALID" : "VALID"}
              </Badge>
              <button
                onClick={onClose}
                className="ml-2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Invalid reasons — commented out per request.
              Note: with this banner removed, an SEB admin reviewing an INVALID
              ballot has to scan each contest row to find the issue. The per-row
              "NO VOTE" / "OVERVOTE" tags still indicate which contest failed,
              but there is no longer a single summary explaining *why* the
              ballot is INVALID. Restore this block if admins struggle to
              identify the problem during scanning. */}
          {/*
          {isInvalid && scanResult.ballotInvalidReasons?.length ? (
            <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5">
              {scanResult.ballotInvalidReasons.map((r, i) => (
                <p key={i}>
                  {r.type === "overvote_detected"
                    ? `Overvote in ${r.contestId}: ${r.validVotes ?? "?"} marks detected, max ${r.maxAllowed ?? "?"}`
                    : r.type === "no_vote_detected"
                    ? `No vote detected in ${r.contestId}`
                    : r.type === "abstain_conflict"
                    ? `Candidate + Abstain conflict in ${r.contestId}`
                    : `${r.type} in ${r.contestId ?? "?"}`}
                </p>
              ))}
            </div>
          ) : null}
          */}
        </div>

        {/* Body — contest rows */}
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto px-6 py-4 space-y-3">
          {contestsData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No contests found. The ballot may not have been recognized.
            </p>
          ) : (
            contestsData.map((cd) => (
              <ContestResultRow
                key={cd.position.id}
                position={cd.position}
                detectedSelections={cd.detectedSelections}
                contestRead={cd.contestRead}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 rounded-b-xl border-t bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onRescan}
                  disabled={submitting}
                >
                  Rescan Ballot
                </Button>
                <Button
                  variant="outline"
                  onClick={handleOpenVoterSnapshot}
                  disabled={submitting}
                >
                  Open Voter Snapshot
                </Button>
              </div>
              {popupBlocked ? (
                <p className="mt-1 text-xs text-red-600">
                  Pop-up blocked. Please allow pop-ups for this site.
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Close
              </Button>
              <Button
                className="bg-[#7A0019] hover:bg-[#5c0013] text-white"
                disabled={submitting || !scanResult.ballotId}
                onClick={() => onConfirm(finalSelections)}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Submitting…
                  </span>
                ) : (
                  "Confirm & Submit Vote"
                )}
              </Button>
            </div>
          </div>
          {!scanResult.ballotId && (
            <p className="mt-2 text-xs text-red-600">
              No ballot token detected — QR code could not be read. Cannot submit without a valid token.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}