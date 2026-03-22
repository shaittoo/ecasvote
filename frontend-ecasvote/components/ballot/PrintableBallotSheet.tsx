"use client";

/**
 * Printable ballot — matches UP Visayas CAS official layout (B&W, 6 square fiducials,
 * centered header + QR, instructions + TAMA/MALI, 3-column contests, horizontal ovals).
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { PrintableBallotSheetProps } from "@/lib/ballot/printableBallotTypes";
import {
  buildBallotQrPayload,
  stringifyBallotQrPayload,
} from "@/lib/ballot/buildBallotQrPayload";
import {
  BALLOT_V2_INSTRUCTIONS,
  BALLOT_V2_INSTITUTION_LINES,
  formatBallotCandidateLine,
} from "@/lib/ballot/ballotTemplateV2";
import { BallotMarkingGuide } from "./BallotMarkingGuide";

function voteLimitLine(maxVotes: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
  ];
  const w = maxVotes >= 0 && maxVotes <= 10 ? words[maxVotes] : String(maxVotes);
  const noun = maxVotes === 1 ? "candidate" : "candidates";
  return `Vote up to ${w} (${maxVotes}) ${noun} only.`;
}

/** Six solid black squares — optical / OpenCV registration (template spec). */
function SquareFiducials() {
  const sq =
    "pointer-events-none absolute z-0 h-3 w-3 bg-black print:h-2.5 print:w-2.5";
  return (
    <>
      <div className={`${sq} left-2 top-2`} aria-hidden />
      <div className={`${sq} right-2 top-2`} aria-hidden />
      <div className={`${sq} left-2 top-1/2 -translate-y-1/2`} aria-hidden />
      <div className={`${sq} right-2 top-1/2 -translate-y-1/2`} aria-hidden />
      <div className={`${sq} bottom-2 left-2`} aria-hidden />
      <div className={`${sq} bottom-2 right-2`} aria-hidden />
    </>
  );
}

/** Empty horizontal oval (bubble) for shading — matches scanner ballots */
function BallotOval() {
  return (
    <span
      className="inline-block h-2.5 w-7 shrink-0 rounded-full border-[1.5px] border-black bg-white print:h-2 print:w-6"
      aria-hidden
    />
  );
}

export function PrintableBallotSheet({
  electionId,
  ballotToken,
  templateVersion,
  electionName,
  positions,
  qrWidth = 100,
  institutionLines = BALLOT_V2_INSTITUTION_LINES,
  academicYearLine = "A.Y. 2025-2026",
  showAbstain = true,
  ballotRecipientLine,
}: PrintableBallotSheetProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

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
      margin: 0,
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
      className="print-ballot-v2-root relative mx-auto box-border min-h-0 max-w-[210mm] bg-white px-10 py-3 text-black print:mx-0 print:max-w-none print:px-8 print:py-2"
    >
      <SquareFiducials />

      {/* Header: centered block + QR top-right */}
      <header className="relative z-[1] mb-2 print:mb-1.5">
        <div className="absolute right-0 top-0 z-[2] w-[76px] print:w-[70px]">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt=""
              width={qrWidth}
              height={qrWidth}
              className="ml-auto block h-auto max-w-full border border-black"
            />
          ) : (
            <div
              className="ml-auto flex items-center justify-center border border-black text-[7px]"
              style={{ width: qrWidth, height: qrWidth }}
            >
              {qrError ?? "…"}
            </div>
          )}
        </div>

        <div className="px-2 text-center print:px-12">
          {institutionLines.map((line, i) => (
            <p
              key={i}
              className={`font-bold uppercase tracking-wide text-black ${
                i === 0 ? "text-sm print:text-[12px]" : "mt-0.5 text-[10px] leading-tight print:text-[9px]"
              }`}
            >
              {line}
            </p>
          ))}
          <p className="mt-1 text-[10px] font-bold uppercase leading-tight print:text-[9px]">
            STUDENT COUNCIL ELECTIONS {academicYearLine}
          </p>
          {electionName ? (
            <p className="mt-1.5 text-[9px] font-normal normal-case leading-snug text-black print:text-[8px]">
              {electionName}
            </p>
          ) : null}
          {ballotRecipientLine ? (
            <p className="mt-1.5 border border-black px-2 py-1 text-[9px] font-semibold normal-case leading-snug text-black print:text-[8px]">
              {ballotRecipientLine}
            </p>
          ) : null}
        </div>
      </header>

      {/* Thick rule under header (separates title block from instructions) */}
      <div className="relative z-[1] mb-2 h-1 bg-neutral-500 print:mb-1.5 print:h-0.5" />

      {/* Instructions: left text + right TAMA/MALI */}
      <section className="relative z-[1] mb-2 flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3 print:mb-1.5 print:gap-2">
        <p className="min-w-0 flex-1 text-justify text-[8px] italic leading-snug text-black print:text-[7.5px]">
          {BALLOT_V2_INSTRUCTIONS}
        </p>
        <BallotMarkingGuide />
      </section>

      {/* Thick rule before contests */}
      <div className="relative z-[1] mb-2 h-1.5 bg-neutral-400 print:mb-1.5 print:h-1" />

      {/* System ids */}
      <div className="relative z-[1] mb-2 flex flex-wrap justify-center gap-x-4 gap-y-0.5 font-mono text-[6.5px] text-black print:mb-1.5 print:text-[6px]">
        <span>Election ID: {electionId}</span>
        <span>Ballot Token: {ballotToken || "—"}</span>
        <span>Template: {templateVersion}</span>
      </div>

      {/* 3×N grid — flows left-to-right, row-major (like official 3-col sheet) */}
      <section
        className="relative z-[1] grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-x-2 print:gap-y-1.5"
        aria-label="Ballot contests"
      >
        {positions.map((pos) => (
          <article
            key={pos.positionId}
            className="break-inside-avoid border-t-4 border-neutral-400 bg-white pt-1.5 print:border-neutral-500 print:pt-1"
          >
            <h2 className="text-center text-[9px] font-bold uppercase leading-tight text-black print:text-[8.5px]">
              {pos.positionName}
            </h2>
            <p className="mt-0.5 text-center text-[7.5px] italic leading-tight text-black print:text-[7px]">
              {voteLimitLine(pos.maxVotes)}
            </p>
            <ul className="mt-1.5 space-y-1 print:mt-1 print:space-y-0.5">
              {pos.candidates.map((c, idx) => (
                <li key={c.candidateId} className="flex items-center gap-2">
                  <BallotOval />
                  <span className="text-[8px] font-bold uppercase leading-none tracking-wide print:text-[7.5px]">
                    {formatBallotCandidateLine(idx, c.name)}
                  </span>
                </li>
              ))}
              {showAbstain && (
                <li className="flex items-center gap-2 border-t border-dotted border-neutral-400 pt-1">
                  <BallotOval />
                  <span className="text-[8px] font-bold uppercase print:text-[7.5px]">Abstain</span>
                </li>
              )}
            </ul>
          </article>
        ))}
      </section>

      <footer className="relative z-[1] mt-3 border-t border-neutral-400 pt-1.5 text-center text-[6.5px] text-neutral-700 print:mt-2 print:text-[6px] print:text-black">
        <p>eCASVote · hybrid election system</p>
      </footer>
    </div>
  );
}

export function printBallotPage(): void {
  if (typeof window !== "undefined") {
    window.print();
  }
}
