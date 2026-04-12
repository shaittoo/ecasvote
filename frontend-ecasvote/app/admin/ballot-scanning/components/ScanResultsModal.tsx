"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  // Track overrides per contest — only keys that admin has modified
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [hasOverride, setHasOverride] = useState(false);

  // Reset overrides when scan result changes
  useEffect(() => {
    setOverrides({});
    setHasOverride(false);
  }, [scanResult]);

  // Build contest data by merging positions with scan results
  const contestsData = useMemo(() => {
    const contestsRead = scanResult.bubbleRead?.contestsRead ?? [];
    const contestReadMap = new Map<string, ContestReadItem>();
    for (const cr of contestsRead) {
      contestReadMap.set(cr.positionId, cr);
    }

    return positions.map((pos) => {
      const detected = scanResult.selectionsByPosition[pos.id] ?? [];
      const cr = contestReadMap.get(pos.id);
      return {
        position: pos,
        detectedSelections: detected,
        contestRead: cr ?? null,
        overvote: cr?.overvoteDetected ?? false,
      };
    });
  }, [positions, scanResult]);

  // Compute final selections (detected + overrides)
  const finalSelections = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const cd of contestsData) {
      const pid = cd.position.id;
      if (overrides[pid] !== undefined) {
        result[pid] = overrides[pid];
      } else {
        result[pid] = cd.detectedSelections;
      }
    }
    return result;
  }, [contestsData, overrides]);

  // Toggle a candidate in a contest
  const toggleCandidate = useCallback(
    (contestId: string, candidateId: string, maxVotes: number) => {
      setOverrides((prev) => {
        const current =
          prev[contestId] ??
          scanResult.selectionsByPosition[contestId] ??
          [];

        let next: string[];
        if (current.includes(candidateId)) {
          next = current.filter((id) => id !== candidateId);
        } else {
          if (current.length >= maxVotes) {
            return prev; // Don't exceed max votes
          }
          next = [...current, candidateId];
        }

        setHasOverride(true);
        return { ...prev, [contestId]: next };
      });
    },
    [scanResult.selectionsByPosition]
  );

  if (!open) return null;

  const isInvalid = scanResult.ballotStatus === "INVALID";
  const hasAnyOvervote = contestsData.some((cd) => cd.overvote);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12">
      <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-xl border-b bg-white px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Scan Results Review
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

          {/* Invalid reasons */}
          {isInvalid && scanResult.ballotInvalidReasons?.length ? (
            <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {scanResult.ballotInvalidReasons.map((r, i) => (
                <p key={i}>
                  {r.type === "overvote_detected"
                    ? `Overvote in ${r.contestId}: ${r.validVotes ?? "?"} votes detected, max ${r.maxAllowed ?? "?"}`
                    : `${r.type} in ${r.contestId ?? "?"}: ${r.reason ?? ""}`}
                </p>
              ))}
            </div>
          ) : null}

          {hasOverride && (
            <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              ⚠ You have overridden the scanned results. Review carefully before submitting.
            </div>
          )}
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
                currentSelections={
                  finalSelections[cd.position.id] ?? []
                }
                contestRead={cd.contestRead}
                isOverridden={overrides[cd.position.id] !== undefined}
                onToggle={(candidateId) =>
                  toggleCandidate(
                    cd.position.id,
                    candidateId,
                    cd.position.maxVotes
                  )
                }
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 rounded-b-xl border-t bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={onRescan}
              disabled={submitting}
            >
              Rescan Ballot
            </Button>
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