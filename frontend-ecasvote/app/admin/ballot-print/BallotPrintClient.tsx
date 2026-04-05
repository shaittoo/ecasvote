"use client";

/**
 * Loads election + positions from the gateway (same API as the rest of admin).
 * ?electionId= defaults to election-2025 if omitted.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PrintableBallotSheet } from "@/components/ballot/PrintableBallotSheet";
import { PrintBallotActions } from "@/components/ballot/PrintBallotActions";
import {
  fetchElection,
  fetchPaperCheckIn,
  fetchPaperTokens,
  fetchPositions,
  type PaperCheckInVoter,
} from "@/lib/ecasvoteApi";
import { mapPositionsToPrintableBallot } from "@/lib/ballot/mapPositionsToPrintable";
import { filterPositionsByVoterDepartment } from "@/lib/ballot/filterPositionsByDepartment";
import type { PrintableBallotPosition } from "@/lib/ballot/printableBallotTypes";
import { BALLOT_TEMPLATE_VERSION } from "@/lib/ballot/ballotTemplate";
import { Button } from "@/components/ui/button";
import { buildPreviewBallotToken } from "@/lib/ballot/previewBallotId";
import { buildVoterPreviewBallotToken } from "@/lib/ballot/buildVoterPaperBallotId";
import { saveOmrLayout } from "@/lib/ecasvoteApi";

/** Matches other admin pages until a global config exists */
export const DEFAULT_BALLOT_PRINT_ELECTION_ID = "election-2025";

export function BallotPrintClient() {
  const searchParams = useSearchParams();
  const electionId =
    searchParams.get("electionId")?.trim() || DEFAULT_BALLOT_PRINT_ELECTION_ID;

  /** From voter roster: department-specific governor race + voter-scoped ballot id */
  const voterDepartment = searchParams.get("department")?.trim() ?? "";
  const studentNumber = searchParams.get("studentNumber")?.trim() ?? "";
  const voterFullName = searchParams.get("fullName")?.trim() ?? "";
  const isVoterSpecific = Boolean(voterDepartment && studentNumber);

  /** Real issued token from query (e.g. after issue from Token Status); overrides preview ids. */
  const ballotTokenFromQuery = searchParams.get("ballotToken")?.trim() ?? "";
  /** Optional OMR / inventory fields (query string) */
  const ballotNumber = searchParams.get("ballotNumber")?.trim() ?? "";
  const ballotSeries = searchParams.get("ballotSeries")?.trim() ?? "";
  const ballotZone = searchParams.get("ballotZone")?.trim() ?? "";
  const jurisdictionLine = searchParams.get("jurisdictionLine")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [electionName, setElectionName] = useState("");
  /** Used for STUDENT COUNCIL ELECTIONS A.Y. line (matches PDF template) */
  const [electionStartTime, setElectionStartTime] = useState<string | null>(null);
  const [positions, setPositions] = useState<PrintableBallotPosition[]>([]);
  /** Issued paper token (TKN-…) from gateway when this voter already has a ballot for this election */
  const [issuedBallotToken, setIssuedBallotToken] = useState<string | null>(null);
  /** After lookup: used only to show “no issuance yet” vs preview — not when tokens exist */
  const [voterIssuanceRow, setVoterIssuanceRow] = useState<PaperCheckInVoter | null | undefined>(
    undefined
  );
  const [scannerTemplateJson, setScannerTemplateJson] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setIssuedBallotToken(null);
      setVoterIssuanceRow(undefined);
      setScannerTemplateJson(null);
      try {
        const [election, posRows] = await Promise.all([
          fetchElection(electionId),
          fetchPositions(electionId),
        ]);

        if (cancelled) return;
        if (!election) {
          setError(`No election found for id "${electionId}". Check the gateway and chaincode.`);
          setElectionName("");
          setElectionStartTime(null);
          setPositions([]);
          return;
        }
        setElectionName(election.name);
        setElectionStartTime(election.startTime);
        const forDept = isVoterSpecific
          ? filterPositionsByVoterDepartment(posRows, voterDepartment)
          : posRows;
        setPositions(mapPositionsToPrintableBallot(forDept));

        const needIssuanceLookup =
          isVoterSpecific && Boolean(studentNumber) && !ballotTokenFromQuery;

        if (needIssuanceLookup) {
          let row: PaperCheckInVoter | undefined;
          try {
            const checkIn = await fetchPaperCheckIn(electionId);
            if (cancelled) return;
            row = checkIn.voters.find((v) => v.studentNumber === studentNumber);
          } catch {
            /* check-in failed — try paper-tokens list only */
          }

          let token = row?.ballotToken?.trim();
          if (!token) {
            try {
              const paper = await fetchPaperTokens(electionId);
              if (cancelled) return;
              token = paper.tokens.find((t) => t.studentNumber === studentNumber)?.ballotToken?.trim();
            } catch {
              /* ignore */
            }
          }

          if (!cancelled) {
            if (token) setIssuedBallotToken(token);
            setVoterIssuanceRow(row ?? null);
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load election data");
          setElectionName("");
          setElectionStartTime(null);
          setPositions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [
    electionId,
    isVoterSpecific,
    voterDepartment,
    studentNumber,
    ballotTokenFromQuery,
  ]);

  /**
   * Prefer URL → paper ballot issued `TKN-…` from gateway (check-in / paper-tokens).
   * If not yet issued, use a deterministic preview token so QR generation never disappears.
   */
  const ballotToken =
    ballotTokenFromQuery ||
    issuedBallotToken ||
    (isVoterSpecific
      ? buildVoterPreviewBallotToken(electionId, studentNumber)
      : buildPreviewBallotToken(electionId));

  /** Only warn when the API explicitly says this voter has no issuance for this election */
  const showNoIssuanceYet =
    isVoterSpecific &&
    !ballotTokenFromQuery &&
    !issuedBallotToken &&
    voterIssuanceRow !== undefined &&
    voterIssuanceRow !== null &&
    voterIssuanceRow.paperStatus === "Not Issued";

  const hasRealIssuedToken = Boolean(ballotTokenFromQuery || issuedBallotToken);

  const ballotRecipientLine =
    isVoterSpecific && voterFullName
      ? `Ballot for: ${voterFullName} · Student No. ${studentNumber} · ${voterDepartment}`
      : isVoterSpecific
        ? `Ballot for: ${studentNumber} · ${voterDepartment}`
        : undefined;

  const academicYearLine =
    electionStartTime != null
      ? (() => {
          const y = new Date(electionStartTime).getFullYear();
          return `A.Y. ${y}-${y + 1}`;
        })()
      : undefined;

  return (
    <div className="min-h-screen bg-gray-100 pb-8 pt-2 print:bg-white print:py-0">
      <div className="mx-auto max-w-4xl px-4 print:max-w-none print:px-0">
        <div className="mb-4 flex flex-wrap gap-4 print:hidden">
          <Link href="/admin/election-management" className="text-sm text-[#7A0019] underline">
            ← Back to election management
          </Link>
          {isVoterSpecific ? (
            <Link
              href="/admin/voter-management/voter-roster"
              className="text-sm text-[#7A0019] underline"
            >
              ← Back to voter roster
            </Link>
          ) : null}
        </div>

        <div className="mb-4 rounded border border-gray-200 bg-white p-4 text-sm text-gray-700 print:hidden">
          <p>
            <span className="font-medium">Election ID:</span>{" "}
            <code className="rounded bg-gray-100 px-1">{electionId}</code>
          </p>
          {isVoterSpecific ? (
            <>
              <p className="mt-1 text-xs text-gray-600">
                This ballot lists CAS-wide races and only the <strong>{voterDepartment}</strong>{" "}
                governor contest. Student:{" "}
                <code className="rounded bg-gray-100 px-1">{studentNumber}</code>
              </p>
              {showNoIssuanceYet ? (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                  No paper ballot is on file for this student in this election yet. The line below is a{" "}
                  <strong>preview</strong> id. Use the same <strong>election</strong> in the roster as in
                  Token Status, then issue or use <strong>Generate tokens for all</strong>.
                </p>
              ) : hasRealIssuedToken ? (
                <p className="mt-2 text-xs text-green-800">
                  QR uses your issued ballot token and election id (no vote data in the code).
                </p>
              ) : voterIssuanceRow === null && !loading ? (
                <p className="mt-2 text-xs text-gray-500">
                  Could not match this student in the issuance list for this election — check{" "}
                  <code className="rounded bg-gray-100 px-0.5">electionId</code> matches where tokens
                  were generated.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Change via <code className="rounded bg-gray-100 px-1">?electionId=…</code>
              {ballotTokenFromQuery ? (
                <> · Using <code className="rounded bg-gray-100 px-1">ballotToken</code> from URL.</>
              ) : (
                <>
                  . Ballot token below is a preview label until you issue a real token; add{" "}
                  <code className="rounded bg-gray-100 px-1">?ballotToken=TKN-…</code> to print an issued
                  token.
                </>
              )}
            </p>
          )}
        </div>

        {loading && (
          <p className="text-gray-600 print:hidden" role="status">
            Loading ballot from API…
          </p>
        )}

        {error && !loading && (
          <div className="rounded border border-red-200 bg-red-50 p-4 text-red-800 print:hidden" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && electionName && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
              <PrintBallotActions />
              {scannerTemplateJson ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#7A0019] text-[#7A0019] hover:bg-[#7A0019]/10"
                  onClick={() => {
                    const blob = new Blob([scannerTemplateJson], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `scanner-template-${electionId}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download scanner template JSON
                </Button>
              ) : null}
            </div>
            <PrintableBallotSheet
              electionId={electionId}
              ballotToken={ballotToken}
              templateVersion={BALLOT_TEMPLATE_VERSION}
              electionName={electionName}
              positions={positions}
              academicYearLine={academicYearLine}
              ballotRecipientLine={ballotRecipientLine}
              ballotNumber={ballotNumber || undefined}
              ballotSeries={ballotSeries || undefined}
              ballotZone={ballotZone || undefined}
              jurisdictionLine={jurisdictionLine || undefined}
              onGeometryTemplateReady={(geom) => {
                setScannerTemplateJson(JSON.stringify(geom, null, 2));
                void saveOmrLayout({
                  ballotId: ballotToken,
                  electionId,
                  templateVersion: BALLOT_TEMPLATE_VERSION,
                  layout: geom,
                }).catch((err) => {
                  console.error("Failed to save OMR layout:", err);
                });
              }}
            />
          </>
        )}

        {!loading && !error && !electionName && (
          <p className="text-gray-600 print:hidden">No data to display.</p>
        )}
      </div>
    </div>
  );
}
