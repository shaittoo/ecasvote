"use client";

/**
 * Scan-optimized printable ballot (OpenCV-friendly):
 * - Full-page registration frame with unique corner fiducials
 * - Large square timing marks on all edges
 * - Strict candidate-row grid with uniform bubble geometry
 * - QR metadata block INSIDE the machine-readable frame
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
import { BALLOT_TEMPLATE_V3, BALLOT_TEMPLATE_V4 } from "@/lib/ballot/ballotTemplate";

const SECTION_BAR_BG = [
  "bg-rose-100",
  "bg-amber-100",
  "bg-emerald-100",
  "bg-sky-100",
  "bg-violet-100",
] as const;

const SCAN_GEOMETRY = {
  /** Keep safe edge margin so low-end printers do not clip registration marks. */
  pagePadding: "mx-[7mm] my-[5mm] print:mx-[6mm] print:my-[2mm]",
  /** Thick frame is intentionally darker/thicker than bubble outlines. */
  frameBorder: "border-[2.4px] print:border-[2px]",
  cornerSize: 30,
  timingMarkSize: "h-2.5 w-2.5 print:h-2 print:w-2",
  bubbleSize: "h-[20px] w-[20px] print:h-[18px] print:w-[18px]",
  rowHeight: "min-h-[24px] print:min-h-[20px]",
  contestHeaderHeight: "min-h-[28px] print:min-h-[24px]",
  qrWidth: 140,
} as const;

const SCAN_GEOMETRY_V3 = {
  /** Contest-local anchors drive local OpenCV alignment in v3. */
  contestAnchorSize: "h-[9px] w-[9px] print:h-[8px] print:w-[8px]",
  /** Row markers provide row-level baseline checks and drift correction. */
  rowMarkerSize: "h-[6px] w-[6px] print:h-[5px] print:w-[5px]",
  rowHeight: "min-h-[27px] print:min-h-[23px]",
  bubbleSize: "h-[22px] w-[22px] print:h-[20px] print:w-[20px]",
} as const;

const SCAN_GEOMETRY_V4 = {
  /** v4 local alignment rails: left required, right optional mirror. */
  railMarkerSize: "h-[6px] w-[6px] print:h-[5px] print:w-[5px]",
  useRightRail: true,
  rowHeight: "min-h-[29px] print:min-h-[24px]",
  bubbleSize: "h-[21px] w-[21px] print:h-[19px] print:w-[19px]",
} as const;

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

type CornerFiducialKind = "tl" | "tr" | "bl" | "br";

/**
 * Unique corner fiducials encode orientation directly:
 * the outer square size stays constant while inner white cutouts differ by corner.
 */
function CornerFiducial({ kind, className }: { kind: CornerFiducialKind; className: string }) {
  const cutoutsByKind: Record<CornerFiducialKind, string> = {
    tl: "top-1 left-1",
    tr: "top-1 right-1",
    bl: "bottom-1 left-1",
    br: "bottom-1 right-1",
  };
  return (
    <div
      className={`pointer-events-none absolute z-[3] border-2 border-black bg-black ${className}`}
      style={{ width: SCAN_GEOMETRY.cornerSize, height: SCAN_GEOMETRY.cornerSize }}
      aria-hidden
    >
      <div className={`absolute h-[8px] w-[8px] bg-white ${cutoutsByKind[kind]}`} />
      <div className="absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 bg-white" />
    </div>
  );
}

/**
 * Registration system used by OpenCV:
 * - unique corners: orientation and coarse homography anchors
 * - repeated edge squares: timing / line-fit / warp stability
 */
function ScanFrameRegistration() {
  const sq = `mx-auto shrink-0 bg-black ${SCAN_GEOMETRY.timingMarkSize}`;
  const stripX = "absolute left-[36px] right-[36px] flex justify-between";
  const stripY = "absolute top-[36px] bottom-[36px] flex flex-col justify-between";
  return (
    <>
      <CornerFiducial kind="tl" className="left-0 top-0 -translate-x-1/3 -translate-y-1/3" />
      <CornerFiducial kind="tr" className="right-0 top-0 translate-x-1/3 -translate-y-1/3" />
      <CornerFiducial kind="bl" className="bottom-0 left-0 -translate-x-1/3 translate-y-1/3" />
      <CornerFiducial kind="br" className="bottom-0 right-0 translate-x-1/3 translate-y-1/3" />
      {/* Keep top timing marks clear from header text region. */}
      <div className={`${stripX} top-5`} aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={`t-${i}`} className={sq} />
        ))}
      </div>
      <div className={`${stripX} bottom-3`} aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={`b-${i}`} className={sq} />
        ))}
      </div>
      <div className={`${stripY} left-3`} aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={`l-${i}`} className={sq} />
        ))}
      </div>
      <div className={`${stripY} right-3`} aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={`r-${i}`} className={sq} />
        ))}
      </div>
    </>
  );
}

function BallotBubble() {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-[2.6px] border-black bg-white ${SCAN_GEOMETRY.bubbleSize}`}
      aria-hidden
    />
  );
}

function BallotBubbleV3() {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-[2.8px] border-black bg-white ${SCAN_GEOMETRY_V3.bubbleSize}`}
      aria-hidden
    />
  );
}

function RowMarkerV3() {
  return (
    <span
      className={`inline-block shrink-0 bg-black ${SCAN_GEOMETRY_V3.rowMarkerSize}`}
      aria-hidden
    />
  );
}

function RowMarkerV4() {
  return (
    <span
      className={`inline-block shrink-0 bg-black ${SCAN_GEOMETRY_V4.railMarkerSize}`}
      aria-hidden
    />
  );
}

function ContestAnchorCornersV3() {
  const c = `absolute bg-black ${SCAN_GEOMETRY_V3.contestAnchorSize}`;
  return (
    <>
      <span className={`${c} -left-1 -top-1`} aria-hidden />
      <span className={`${c} -right-1 -top-1`} aria-hidden />
      <span className={`${c} -bottom-1 -left-1`} aria-hidden />
      <span className={`${c} -bottom-1 -right-1`} aria-hidden />
    </>
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
      <div
        className={`grid grid-cols-[1.75rem_1.25rem_1fr] items-center gap-x-1.5 py-0.5 ${SCAN_GEOMETRY.rowHeight}`}
      />
    );
  }
  const { name } = candidate;
  return (
    <div
      className={`grid grid-cols-[1.75rem_1.25rem_1fr] items-center gap-x-1.5 border-b border-neutral-300 py-0.5 print:py-px ${SCAN_GEOMETRY.rowHeight}`}
    >
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
  qrWidth = SCAN_GEOMETRY.qrWidth,
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

  const isV3 = templateVersion === BALLOT_TEMPLATE_V3 || templateVersion.startsWith("ballot-template-v3");
  const isV4 = templateVersion === BALLOT_TEMPLATE_V4 || templateVersion.startsWith("ballot-template-v4");

  return (
    <div
      id="printable-ballot-root"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      className="print-ballot-omr-root mx-auto box-border max-w-[210mm] bg-white text-black print:max-w-none"
    >
      <div className={`${SCAN_GEOMETRY.pagePadding}`}>
        <div
          className={`relative box-border border-black bg-white px-6 pb-3 pt-4 print:px-5 print:pb-2.5 print:pt-3 ${SCAN_GEOMETRY.frameBorder}`}
          aria-label="Ballot scanning area"
        >
          <ScanFrameRegistration />

          {/* Keep-out margin so timing marks never overlap machine/human content. */}
          <div className="relative z-[1] flex h-full flex-col px-2 pb-4 pt-4 print:px-1.5 print:pb-3 print:pt-3">
            {/* Header */}
            <header className="mb-2 flex flex-col gap-2 border-b-2 border-black pb-2 print:mb-1 print:pb-1.5 sm:flex-row sm:items-start sm:justify-between">
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
              <aside className="w-full shrink-0 border-2 border-black bg-white p-1.5 text-[7.5px] leading-tight text-black sm:max-w-[240px] print:max-w-[220px] print:p-1 print:text-[7px]">
                <p className="font-bold uppercase">Instructions</p>
                <p className="mt-0.5 text-justify">{BALLOT_V2_INSTRUCTIONS}</p>
              </aside>
            </header>

            {/* Contest geometry intentionally uniform for repeatable bubble cropping/scoring. */}
            <section className="flex-1 space-y-2" aria-label="Ballot contests">
              {positions.map((pos, posIdx) => {
                const barBg = SECTION_BAR_BG[posIdx % SECTION_BAR_BG.length];
                let running = 0;
                const rows = chunkRows(pos.candidates, 3);
                return (
                  <article
                    key={pos.positionId}
                    className="break-inside-avoid border-2 border-black bg-white"
                  >
                    <div
                      className={`flex items-center justify-center border-b-2 border-black px-1 py-1.5 text-center ${barBg} ${SCAN_GEOMETRY.contestHeaderHeight} print:py-1`}
                    >
                      <h2 className="text-[10px] font-bold uppercase leading-tight text-black print:text-[9px]">
                        {pos.positionName}
                      </h2>
                      <p className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wide text-neutral-900 print:text-[8px]">
                        {chooseInstructionLine(pos.maxVotes)}
                      </p>
                    </div>
                    {isV4 ? (
                      <div className="px-1 pb-1 pt-0.5 print:px-0.5 print:pb-0.5 print:pt-0.5">
                        {/* v4: compact contest core with local alignment rails, no large inner anchor box. */}
                        <div className="space-y-0.5">
                          {pos.candidates.map((candidate) => {
                            const label = String(++running).padStart(2, "0");
                            return (
                              <div
                                key={candidate.candidateId}
                                className={`grid items-center gap-x-2 border-b border-neutral-300 ${
                                  SCAN_GEOMETRY_V4.useRightRail
                                    ? "grid-cols-[0.75rem_1.8rem_1fr_1.8rem_0.75rem]"
                                    : "grid-cols-[0.75rem_1.8rem_1fr_1.8rem]"
                                } ${SCAN_GEOMETRY_V4.rowHeight}`}
                              >
                                {/* Left alignment rail marker: one per row, aligned with bubble center. */}
                                <RowMarkerV4 />
                                <span className="text-right text-[8.5px] font-bold tabular-nums text-orange-600 print:text-[8px]">
                                  {label}
                                </span>
                                <span className="min-w-0 text-[8.5px] font-semibold uppercase leading-snug text-black print:text-[7.5px]">
                                  {candidate.name.trim()}
                                </span>
                                <span
                                  className={`inline-block shrink-0 rounded-full border-[2.7px] border-black bg-white ${SCAN_GEOMETRY_V4.bubbleSize}`}
                                  aria-hidden
                                />
                                {SCAN_GEOMETRY_V4.useRightRail ? <RowMarkerV4 /> : null}
                              </div>
                            );
                          })}
                          {showAbstain ? (
                            <div
                              className={`grid items-center gap-x-2 border-t-2 border-black pt-1 ${
                                SCAN_GEOMETRY_V4.useRightRail
                                  ? "grid-cols-[0.75rem_1.8rem_1fr_1.8rem_0.75rem]"
                                  : "grid-cols-[0.75rem_1.8rem_1fr_1.8rem]"
                              } ${SCAN_GEOMETRY_V4.rowHeight}`}
                            >
                              <RowMarkerV4 />
                              <span className="text-right text-[8.5px] font-bold tabular-nums text-orange-600 print:text-[8px]">
                                —
                              </span>
                              <span className="text-[8.5px] font-bold uppercase text-black print:text-[8px]">
                                Abstain
                              </span>
                              <span
                                className={`inline-block shrink-0 rounded-full border-[2.7px] border-black bg-white ${SCAN_GEOMETRY_V4.bubbleSize}`}
                                aria-hidden
                              />
                              {SCAN_GEOMETRY_V4.useRightRail ? <RowMarkerV4 /> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : isV3 ? (
                      <div className="px-1 pb-1.5 pt-1 print:px-0.5 print:pb-1 print:pt-0.5">
                        {/* Contest-local anchor box enables local homography per contest. */}
                        <div className="relative border-2 border-black px-2 py-1.5 print:px-1.5 print:py-1">
                          <ContestAnchorCornersV3 />
                          <div className="space-y-0.5">
                            {pos.candidates.map((candidate) => {
                              const label = String(++running).padStart(2, "0");
                              return (
                                <div
                                  key={candidate.candidateId}
                                  className={`grid grid-cols-[0.75rem_1.8rem_1fr_1.8rem_0.75rem] items-center gap-x-2 border-b border-neutral-300 ${SCAN_GEOMETRY_V3.rowHeight}`}
                                >
                                  {/* Row markers align with bubble center for row-level correction. */}
                                  <RowMarkerV3 />
                                  <span className="text-right text-[8.5px] font-bold tabular-nums text-orange-600 print:text-[8px]">
                                    {label}
                                  </span>
                                  <span className="min-w-0 text-[8.5px] font-semibold uppercase leading-snug text-black print:text-[7.5px]">
                                    {candidate.name.trim()}
                                  </span>
                                  <BallotBubbleV3 />
                                  <RowMarkerV3 />
                                </div>
                              );
                            })}
                            {showAbstain ? (
                              <div
                                className={`grid grid-cols-[0.75rem_1.8rem_1fr_1.8rem_0.75rem] items-center gap-x-2 border-t-2 border-black pt-1 ${SCAN_GEOMETRY_V3.rowHeight}`}
                              >
                                <RowMarkerV3 />
                                <span className="text-right text-[8.5px] font-bold tabular-nums text-orange-600 print:text-[8px]">
                                  —
                                </span>
                                <span className="text-[8.5px] font-bold uppercase text-black print:text-[8px]">
                                  Abstain
                                </span>
                                <BallotBubbleV3 />
                                <RowMarkerV3 />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="px-1 pb-1 pt-1 print:px-0.5 print:pb-0.5 print:pt-0.5">
                        {rows.map((row, ri) => (
                          <div
                            key={ri}
                            className="grid grid-cols-3 gap-x-1.5 print:gap-x-1.5"
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
                          <div className="mt-1 border-t-2 border-black pt-1 print:mt-0.5">
                            <div
                              className={`grid grid-cols-[1.75rem_1.25rem_1fr] items-center gap-x-1.5 py-0.5 print:py-px ${SCAN_GEOMETRY.rowHeight}`}
                            >
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
                    )}
                  </article>
                );
              })}
            </section>

            {/* Reserved machine-readable metadata zone inside frame. */}
            <footer className="mt-2 flex items-end justify-between gap-4 border-t-2 border-black pt-1.5 print:pt-1">
              <div className="min-w-0 flex-1">
                <p className="text-[7.5px] font-bold uppercase text-neutral-800 print:text-[7px]">
                  Identifier / sequence
                </p>
                <p className="mt-0.5 break-all font-mono text-[8px] leading-snug text-black print:text-[7.5px]">
                  {footerIdentifier}
                </p>
                <p className="mt-1 font-mono text-[6px] text-neutral-700 print:text-[5.5px]">
                  Template: {templateVersion}
                  {ballotNumber?.trim() ? ` · No. ${ballotNumber.trim()}` : ""}
                  {ballotSeries?.trim() ? ` · Series ${ballotSeries.trim()}` : ""}
                  {ballotZone?.trim() ? ` · Zone ${ballotZone.trim()}` : ""}
                </p>
                <p className="mt-1 text-[7px] text-neutral-600 print:text-[6px]">
                  eCASVote metadata QR (token + sequence + election id). Keep this zone clean.
                </p>
              </div>
              <div className="shrink-0 border-2 border-black bg-white p-1">
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
                <span className="mt-0.5 block text-center font-mono text-[7px] text-neutral-700">
                  Ballot QR
                </span>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

export function printBallotPage(): void {
  if (typeof window !== "undefined") {
    window.print();
  }
}
