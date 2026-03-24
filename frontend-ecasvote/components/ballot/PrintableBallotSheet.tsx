"use client";

/**
 * OMR-style printable ballot: edge fiducials, timing strips, 3-column candidate grid,
 * numbered rows + bubbles, section header bars; QR in footer outside fiducial frame.
 */

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { PrintableBallotCandidate, PrintableBallotSheetProps } from "@/lib/ballot/printableBallotTypes";
import {
  buildBallotQrPayload,
  stringifyBallotQrPayload,
} from "@/lib/ballot/buildBallotQrPayload";
import {
  BALLOT_V2_INSTRUCTIONS,
  BALLOT_V2_INSTITUTION_LINES,
} from "@/lib/ballot/ballotTemplateV2";

const SECTION_BAR_BG = [
  "bg-rose-100",
  "bg-amber-100",
  "bg-emerald-100",
  "bg-sky-100",
  "bg-violet-100",
] as const;

function chooseInstructionLine(maxVotes: number): string {
  if (maxVotes <= 1) return "Choose — 1";
  return `Choose — up to ${maxVotes}`;
}

function chunkRows<T>(items: T[], cols: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += cols) {
    const row = items.slice(i, i + cols) as (T | null)[];
    while (row.length < cols) row.push(null);
    rows.push(row);
  }
  return rows;
}

/** Solid squares on the scan-frame border for alignment (inside printable safe area). */
function ScanFrameFiducials() {
  const sq =
    "pointer-events-none absolute z-[2] h-2.5 w-2.5 bg-black print:h-2 print:w-2";
  return (
    <>
      <div className={`${sq} left-0 top-0`} aria-hidden />
      <div className={`${sq} left-1/2 top-0 -translate-x-1/2`} aria-hidden />
      <div className={`${sq} right-0 top-0`} aria-hidden />
      <div className={`${sq} left-0 top-1/2 -translate-y-1/2`} aria-hidden />
      <div className={`${sq} right-0 top-1/2 -translate-y-1/2`} aria-hidden />
      <div className={`${sq} bottom-0 left-0`} aria-hidden />
      <div className={`${sq} bottom-0 left-1/2 -translate-x-1/2`} aria-hidden />
      <div className={`${sq} bottom-0 right-0`} aria-hidden />
    </>
  );
}

/** Vertical timing marks (narrow column) for row registration. */
function TimingMarkStrip({ count = 32 }: { count?: number }) {
  return (
    <div
      className="flex w-2 flex-none flex-col justify-between gap-0 py-1 print:w-1.5 print:py-0.5"
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="mx-auto h-1 w-1 shrink-0 bg-black print:h-[2.5px] print:w-[2.5px]"
        />
      ))}
    </div>
  );
}

function BallotBubble() {
  return (
    <span
      className="inline-block h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-black bg-white print:h-4 print:w-4"
      aria-hidden
    />
  );
}

function CandidateOmrRow({
  numLabel,
  candidate,
}: {
  numLabel: string;
  candidate: PrintableBallotCandidate | null;
}) {
  if (!candidate) {
    return (
      <div className="grid min-h-[22px] grid-cols-[1.75rem_1.125rem_1fr] items-center gap-x-1 py-0.5 print:min-h-[18px]" />
    );
  }
  const { name } = candidate;
  return (
    <div className="grid grid-cols-[1.75rem_1.125rem_1fr] items-center gap-x-1 border-b border-neutral-200/80 py-0.5 print:border-neutral-300 print:py-px">
      <span className="text-right text-[8.5px] font-bold tabular-nums text-orange-600 print:text-[8px]">
        {numLabel}
      </span>
      <BallotBubble />
      <span className="min-w-0 text-[8.5px] font-semibold uppercase leading-snug text-black print:text-[7.5px]">
        {name.trim()}
      </span>
    </div>
  );
}

export function PrintableBallotSheet({
  electionId,
  ballotToken,
  templateVersion,
  electionName,
  positions,
  qrWidth = 124,
  institutionLines = BALLOT_V2_INSTITUTION_LINES,
  academicYearLine = "A.Y. 2025-2026",
  showAbstain = true,
  ballotRecipientLine,
  ballotNumber,
  ballotSeries,
  ballotZone,
  jurisdictionLine,
}: PrintableBallotSheetProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const footerIdentifier = useMemo(() => {
    const parts = [
      ballotNumber?.trim(),
      ballotSeries?.trim(),
      ballotZone?.trim(),
      electionId,
      ballotToken?.trim(),
    ].filter(Boolean);
    return parts.join(" · ") || "—";
  }, [ballotNumber, ballotSeries, ballotZone, electionId, ballotToken]);

  useEffect(() => {
    const json =
      ballotToken != null && ballotToken.length > 0
        ? stringifyBallotQrPayload(
            buildBallotQrPayload(electionId, ballotToken, templateVersion)
          )
        : "";

    let cancelled = false;
    if (!json) {
      setQrDataUrl(null);
      setQrError("Missing ballotToken for QR");
      return () => {
        cancelled = true;
      };
    }

    QRCode.toDataURL(json, {
      width: qrWidth,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
          setQrError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrError(err instanceof Error ? err.message : "QR generation failed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [electionId, ballotToken, templateVersion, qrWidth]);

  return (
    <div
      id="printable-ballot-root"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      className="print-ballot-omr-root mx-auto box-border max-w-[210mm] bg-white text-black print:max-w-none"
    >
      {/* --- Scanning frame: fiducials bound the contest area; QR is below, not inside --- */}
      <div
        className="relative mx-3 mt-3 box-border pl-7 pr-7 pt-6 pb-4 print:mx-4 print:mt-2 print:pl-6 print:pr-6 print:pb-3 print:pt-5"
        aria-label="Ballot scanning area"
      >
        <ScanFrameFiducials />

        <div className="relative z-[1] flex gap-1.5 print:gap-1">
          <TimingMarkStrip count={36} />
          <div className="min-w-0 flex-1 border-x border-neutral-300 px-2 print:border-neutral-400 print:px-1.5">
            {/* Header */}
            <header className="mb-3 flex flex-col gap-2 print:mb-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 text-center sm:pr-2 sm:text-left">
                {institutionLines.map((line, i) => (
                  <p
                    key={i}
                    className={`font-bold uppercase tracking-wide text-black ${
                      i === 0
                        ? "text-[13px] print:text-[12px]"
                        : "mt-0.5 text-[10px] leading-tight print:text-[9px]"
                    }`}
                  >
                    {line}
                  </p>
                ))}
                <p className="mt-1 text-[11px] font-bold uppercase leading-tight print:text-[10px]">
                  {electionName || "ELECTION"} · {academicYearLine}
                </p>
                {jurisdictionLine?.trim() ? (
                  <p className="mt-0.5 text-[8.5px] font-semibold normal-case leading-snug text-neutral-800 print:text-[7.5px]">
                    {jurisdictionLine.trim()}
                  </p>
                ) : null}
                {/* Recipient identity line intentionally omitted from printed ballot. */}
              </div>
              <aside className="w-full shrink-0 border border-black bg-white p-1.5 text-[7.5px] leading-tight text-black sm:max-w-[230px] print:max-w-[220px] print:p-1 print:text-[7px]">
                <p className="font-bold uppercase">Instructions</p>
                <p className="mt-0.5 text-justify">{BALLOT_V2_INSTRUCTIONS}</p>
              </aside>
            </header>

            {/* Positions: section bars + 3-column OMR grid */}
            <section className="space-y-3 print:space-y-2" aria-label="Ballot contests">
              {positions.map((pos, posIdx) => {
                const barBg = SECTION_BAR_BG[posIdx % SECTION_BAR_BG.length];
                const rows = chunkRows(pos.candidates, 3);
                let running = 0;
                return (
                  <article
                    key={pos.positionId}
                    className="break-inside-avoid border border-neutral-400 bg-white print:border-black"
                  >
                    <div
                      className={`border-b border-black px-1 py-1 text-center ${barBg} print:py-0.5`}
                    >
                      <h2 className="text-[10px] font-bold uppercase leading-tight text-black print:text-[9px]">
                        {pos.positionName}
                      </h2>
                      <p className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wide text-neutral-900 print:text-[8px]">
                        {chooseInstructionLine(pos.maxVotes)}
                      </p>
                    </div>
                    <div className="px-1 pb-1 pt-1 print:px-0.5 print:pb-0.5 print:pt-0.5">
                      {rows.map((row, ri) => (
                        <div
                          key={ri}
                          className="grid grid-cols-1 gap-x-2 sm:grid-cols-3 print:grid-cols-3 print:gap-x-1.5"
                        >
                          {row.map((cell, ci) => {
                            const label = cell ? String(++running).padStart(2, "0") : "";
                            return (
                              <CandidateOmrRow
                                key={cell?.candidateId ?? `empty-${ri}-${ci}`}
                                numLabel={label}
                                candidate={cell}
                              />
                            );
                          })}
                        </div>
                      ))}
                      {showAbstain ? (
                        <div className="mt-1 border-t-2 border-dotted border-neutral-500 pt-1 print:mt-0.5">
                          <div className="grid grid-cols-[1.75rem_1.125rem_1fr] items-center gap-x-1 py-0.5 print:py-px">
                            <span className="text-right text-[8.5px] font-bold tabular-nums text-orange-600 print:text-[8px]">
                              —
                            </span>
                            <BallotBubble />
                            <span className="text-[8.5px] font-bold uppercase text-black print:text-[8px]">
                              Abstain
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </section>

            {/* System line inside frame (for audit; does not replace QR payload) */}
            <p className="mt-3 text-center font-mono text-[6px] text-neutral-600 print:mt-2 print:text-[5.5px]">
              Template: {templateVersion}
              {ballotNumber?.trim() ? ` · No. ${ballotNumber.trim()}` : ""}
              {ballotSeries?.trim() ? ` · Series ${ballotSeries.trim()}` : ""}
              {ballotZone?.trim() ? ` · Zone ${ballotZone.trim()}` : ""}
            </p>
          </div>
          <TimingMarkStrip count={36} />
        </div>
      </div>

      {/* Footer outside fiducial frame: identifier + QR (non-overlapping scan marks) */}
      <footer className="mx-3 mb-4 flex flex-col gap-2 border-t-4 border-neutral-500 bg-white px-2 py-2 print:mx-4 print:mb-3 print:flex-row print:items-end print:justify-between print:gap-4 print:px-1 print:py-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-[7.5px] font-bold uppercase text-neutral-800 print:text-[7px]">
            Identifier / sequence
          </p>
          <p className="mt-0.5 break-all font-mono text-[8px] leading-snug text-black print:text-[7.5px]">
            {footerIdentifier}
          </p>
          <p className="mt-1 text-[7px] text-neutral-600 print:text-[6px]">
            eCASVote · Scan QR for ballot token validation · Do not mark this area
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center print:items-end">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt=""
              width={qrWidth}
              height={qrWidth}
              className="block border-2 border-black bg-white"
            />
          ) : (
            <div
              className="flex items-center justify-center border-2 border-black bg-white text-[7px] text-red-800"
              style={{ width: qrWidth, height: qrWidth }}
            >
              {qrError ?? "…"}
            </div>
          )}
          <span className="mt-0.5 text-center font-mono text-[7px] text-neutral-700 print:text-right">
            Ballot QR
          </span>
        </div>
      </footer>
    </div>
  );
}

export function printBallotPage(): void {
  if (typeof window !== "undefined") {
    window.print();
  }
}
