"use client";

/**
 * Scan-optimized printable ballot (OpenCV-friendly):
 * - Full-page registration frame with unique corner fiducials
 * - Large square timing marks on all edges
 * - Strict candidate-row grid with uniform bubble geometry
 * - QR metadata block INSIDE the machine-readable frame
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
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
import { sortCandidatesByLastName } from "@/lib/ballot/mapPositionsToPrintable";
import {
  buildDeterministicTemplateId,
  type OmGeometryContest,
  type OmGeometryBubble,
  type OmGeometryTemplate,
} from "@/lib/ballot/omGeometryTemplate";

/** Contest headers: print-safe black & white only (no tinted section colors). */
const SECTION_HEADER_BW = "bg-white";

const SCAN_GEOMETRY = {
  /**
   * Horizontal + light vertical gutter; print relies on @page ballot-sheet (no extra print my).
   */
  pagePadding: "mx-[5mm] my-[2mm] print:mx-[4mm] print:my-0",
  /** Outer frame around fiducials; `border-0` removes the line so only timing marks outline the sheet. */
  frameBorder: "border-0",
  /** Corner + edge timing marks (~20% smaller than original 30px; still OMR-ratio safe). */
  cornerSize: 24,
  /**
   * Corner squares flush to the scan-frame padding edges (no translate) so TL/TR align with BL/BR
   * and match the frame corners; `@page` margin avoids print clip.
   */
  cornerAnchorTL: "left-0 top-0",
  cornerAnchorTR: "right-0 top-0",
  cornerAnchorBL: "bottom-0 left-0",
  cornerAnchorBR: "bottom-0 right-0",
  /** Top timing row shares y with TL/TR (24px band); bottom row shares y with BL/BR. */
  ballotTopStripTopClass: "top-0",
  ballotBottomStripBottomClass: "bottom-0",
  /** Side strips sit between top and bottom 24px bands; x aligns with strip inset (corner width). */
  ballotSideStripInsetClass: "top-[24px] bottom-[24px]",
  /**
   * Top/bottom: vertical bars. w/h ≥ ~0.55 for OMR contour filter.
   */
  timingTrackBarVertical: "h-[24px] w-[14px] shrink-0 bg-black",
  /** Left/right: horizontal bars (90° from vertical strip). */
  timingTrackBarHorizontal: "h-[14px] w-[24px] shrink-0 bg-black",
  /** Index 0..11 of the 12 top/bottom marks for the centered ∪ landmark. */
  timingTrackCenterIndexTB: 5,
  /** Index 0..17 of the 18 left/right marks for the centered landmark (nearest strip midline). */
  timingTrackCenterIndexLR: 8,
  /** v2: spreadsheet-style fixed layout (px — not responsive). */
  v2RowHeightPx: 40,
  v2NumWidthPx: 32,
  v2BubbleSizePx: 15,
  v2InnerCellPadPx: 5,
  v2TableRowHeightClass: "h-[40px] min-h-[40px] max-h-[40px]",
  contestHeaderHeight: "min-h-[24px] print:min-h-[20px]",
  /**
   * Rendered QR bitmap (screen px before print zoom). Larger modules decode more reliably
   * on paper scans; EC level H adds margin for damaged print/photo.
   */
  qrWidth: 200,
  /** White padding around the QR image inside the footer (quiet zone; no border). */
  qrQuietZonePaddingPx: 14,
  /** Inset the QR block from bottom-right toward page center, away from timing tracks. */
  qrFooterInsetBottomPx: 14,
  qrFooterInsetRightPx: 14,
  /** Below the single 24px top registration band + gap — z-[2] bg must not cover fiducials. */
  contentInsetTop: "pt-[32px]",
  contentInsetBottom: "pb-10 print:pb-4",
  contentInsetX: "px-8",
  /** Tighter print insets so contests + QR share one A4; zoom-fit further compresses if needed. */
  contentInsetPrint: "print:pt-7 print:pb-3 print:px-6",
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

/** Shown in contest header — CAS-style wording (display only; logic unchanged). */
function contestRuleParen(maxVotes: number): string {
  if (maxVotes <= 1) return "(CHOOSE 1 ONLY)";
  return `(CHOOSE UP TO ${maxVotes})`;
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

/**
 * Party label for parentheses only — strips legacy " · program" and embedded "- BS …" department tails.
 */
function printablePartyOnly(affiliation: string | undefined): string | undefined {
  if (!affiliation?.trim()) return undefined;
  let s = affiliation.trim().split(" · ")[0]!.trim();
  s = s.replace(/\s+-\s*(BS|BA|MS|B\.S\.|M\.S\.|AB)\b[\s\S]*$/i, "").trim();
  return s || undefined;
}

/** `LAST, FIRST (PARTY)` — last word = surname; party only in parentheses. */
function formatBallotCandidateDisplay(c: PrintableBallotCandidate): string {
  const raw = c.name.trim();
  const party = printablePartyOnly(c.affiliation);
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return raw;
  const last = parts[parts.length - 1] ?? raw;
  const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";
  const core = first ? `${last}, ${first}` : last;
  const line = party ? `${core} (${party})` : core;
  return line.toUpperCase();
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
      className={`pointer-events-none absolute z-0 box-border border-2 border-black bg-black ${className}`}
      style={{ width: SCAN_GEOMETRY.cornerSize, height: SCAN_GEOMETRY.cornerSize }}
      aria-hidden
    >
      <div className={`absolute h-[6px] w-[6px] bg-white ${cutoutsByKind[kind]}`} />
      <div className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 bg-white" />
    </div>
  );
}

type TimingTrackCenterVariant = "top" | "bottom" | "left" | "right";

/** CAS-style center landmark: same outer size as corner fiducials; ∪ opens toward the page interior on each edge. */
function TimingTrackCenterMark({ variant }: { variant: TimingTrackCenterVariant }) {
  const s = SCAN_GEOMETRY.cornerSize;
  const transform =
    variant === "bottom"
      ? "scale-y-[-1]"
      : variant === "left"
        ? "rotate-90"
        : variant === "right"
          ? "-rotate-90"
          : "";
  return (
    <div
      className={`pointer-events-none shrink-0 ${transform}`}
      style={{ width: s, height: s }}
      aria-hidden
    >
      <div className="relative h-full w-full bg-black">
        <div className="absolute left-[5px] top-[5px] h-[15px] w-[4px] bg-white" />
        <div className="absolute right-[5px] top-[5px] h-[15px] w-[4px] bg-white" />
        <div className="absolute bottom-[5px] left-[5px] h-[4px] w-[14px] bg-white" />
      </div>
    </div>
  );
}

/**
 * Registration system used by OpenCV:
 * - unique corners: orientation and coarse homography anchors
 * - repeated edge squares: timing / line-fit / warp stability
 */
function ScanFrameRegistration() {
  const stripX = "absolute left-[24px] right-[24px] flex";
  const topStrip = SCAN_GEOMETRY.ballotTopStripTopClass;
  const bottomStrip = SCAN_GEOMETRY.ballotBottomStripBottomClass;
  const stripY = `absolute ${SCAN_GEOMETRY.ballotSideStripInsetClass} flex flex-col`;
  const centerTB = SCAN_GEOMETRY.timingTrackCenterIndexTB;
  const centerLR = SCAN_GEOMETRY.timingTrackCenterIndexLR;
  const barV = SCAN_GEOMETRY.timingTrackBarVertical;
  const barH = SCAN_GEOMETRY.timingTrackBarHorizontal;
  const slotMin = SCAN_GEOMETRY.cornerSize;
  return (
    <>
      <CornerFiducial kind="tl" className={SCAN_GEOMETRY.cornerAnchorTL} />
      <CornerFiducial kind="tr" className={SCAN_GEOMETRY.cornerAnchorTR} />
      <CornerFiducial kind="bl" className={SCAN_GEOMETRY.cornerAnchorBL} />
      <CornerFiducial kind="br" className={SCAN_GEOMETRY.cornerAnchorBR} />
      {/* Equal-width / equal-height slots preserve mark centers for OMR (12 / 18 counts unchanged). */}
      <div className={`${stripX} ${topStrip}`} aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={`t-${i}`}
            className="flex min-h-0 flex-1 items-center justify-center"
            style={{ minHeight: slotMin }}
          >
            {i === centerTB ? (
              <TimingTrackCenterMark variant="top" />
            ) : (
              <div className={barV} />
            )}
          </div>
        ))}
      </div>
      <div className={`${stripX} ${bottomStrip}`} aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={`b-${i}`}
            className="flex min-h-0 flex-1 items-center justify-center"
            style={{ minHeight: slotMin }}
          >
            {i === centerTB ? (
              <TimingTrackCenterMark variant="bottom" />
            ) : (
              <div className={barV} />
            )}
          </div>
        ))}
      </div>
      <div className={`${stripY} left-[0px] w-[24px]`} aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={`l-${i}`} className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
            {i === centerLR ? (
              <TimingTrackCenterMark variant="left" />
            ) : (
              <div className={barH} />
            )}
          </div>
        ))}
      </div>
      <div className={`${stripY} right-[0px] w-[24px]`} aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={`r-${i}`} className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
            {i === centerLR ? (
              <TimingTrackCenterMark variant="right" />
            ) : (
              <div className={barH} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** v2 only: fixed 14px OMR circle (locked size; see SCAN_GEOMETRY.v2BubbleSizePx). */
function V2FixedBubble({ bubbleRef }: { bubbleRef?: Ref<HTMLSpanElement> }) {
  const s = SCAN_GEOMETRY.v2BubbleSizePx;
  return (
    <span
      ref={bubbleRef}
      className="inline-block shrink-0 rounded-full border-[2px] border-black bg-white"
      style={{ width: s, height: s, boxSizing: "border-box", verticalAlign: "middle" }}
      aria-hidden
    />
  );
}

function v2InnerTableBaseStyle(): CSSProperties {
  return {
    tableLayout: "fixed",
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    height: SCAN_GEOMETRY.v2RowHeightPx,
  };
}

/**
 * One macro-cell: nested 3-column table [number | circle | name], all px-locked.
 * No flex/grid — `table-layout: fixed` only.
 */
function V2FixedCandidateCell({
  numLabel,
  candidate,
  bubbleRef,
}: {
  numLabel: string;
  candidate: PrintableBallotCandidate | null;
  bubbleRef?: Ref<HTMLSpanElement>;
}) {
  const h = SCAN_GEOMETRY.v2RowHeightPx;
  const pw = SCAN_GEOMETRY.v2NumWidthPx;
  const bw = SCAN_GEOMETRY.v2BubbleSizePx;
  const pad = SCAN_GEOMETRY.v2InnerCellPadPx;
  const innerStyle = v2InnerTableBaseStyle();
  const tdBase: CSSProperties = {
    padding: 0,
    verticalAlign: "middle",
    height: h,
    overflow: "hidden",
    border: "none",
  };

  if (!candidate) {
    return (
      <table style={innerStyle} aria-hidden>
        <colgroup>
          <col style={{ width: pw }} />
          <col style={{ width: bw }} />
          <col style={{ width: "auto" }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={tdBase} colSpan={3} />
          </tr>
        </tbody>
      </table>
    );
  }

  const name = formatBallotCandidateDisplay(candidate);
  return (
    <table style={innerStyle}>
      <colgroup>
        <col style={{ width: pw }} />
        <col style={{ width: bw }} />
        <col style={{ width: "auto" }} />
      </colgroup>
      <tbody>
        <tr>
          <td style={{ ...tdBase, paddingRight: pad, textAlign: "right" }}>
            <span className="text-[9px] font-bold tabular-nums leading-none text-black print:text-[8px]">
              {numLabel}
            </span>
          </td>
          <td style={{ ...tdBase, textAlign: "center" }}>
            <V2FixedBubble bubbleRef={bubbleRef} />
          </td>
          <td style={{ ...tdBase, paddingLeft: pad, textAlign: "left" }}>
            <span className="text-[9px] font-semibold uppercase leading-tight text-black print:text-[8px]">
              {name}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function V2FixedAbstainCell({ bubbleRef }: { bubbleRef?: Ref<HTMLSpanElement> }) {
  const h = SCAN_GEOMETRY.v2RowHeightPx;
  const pw = SCAN_GEOMETRY.v2NumWidthPx;
  const bw = SCAN_GEOMETRY.v2BubbleSizePx;
  const pad = SCAN_GEOMETRY.v2InnerCellPadPx;
  const innerStyle = v2InnerTableBaseStyle();
  const tdBase: CSSProperties = {
    padding: 0,
    verticalAlign: "middle",
    height: h,
    overflow: "hidden",
    border: "none",
  };
  return (
    <table style={innerStyle}>
      <colgroup>
        <col style={{ width: pw }} />
        <col style={{ width: bw }} />
        <col style={{ width: "auto" }} />
      </colgroup>
      <tbody>
        <tr>
          <td style={{ ...tdBase, paddingRight: pad, textAlign: "right" }}>
            <span className="text-[9px] font-bold tabular-nums leading-none text-black print:text-[8px]">
              —
            </span>
          </td>
          <td style={{ ...tdBase, textAlign: "center" }}>
            <V2FixedBubble bubbleRef={bubbleRef} />
          </td>
          <td style={{ ...tdBase, paddingLeft: pad, textAlign: "left" }}>
            <span className="text-[9px] font-bold uppercase leading-tight text-black print:text-[8px]">
              Abstain
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** v3: row rail squares (aligned with bubble column). */
function RowMarkerV3() {
  return (
    <span
      className={`inline-block shrink-0 rounded-sm bg-black ${SCAN_GEOMETRY_V3.rowMarkerSize}`}
      aria-hidden
    />
  );
}

/** v3: single-column OMR bubble per row. */
function BallotBubbleV3() {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-[2px] border-black bg-white ${SCAN_GEOMETRY_V3.bubbleSize}`}
      aria-hidden
    />
  );
}

/** v3: four contest-local corner anchors for local homography. */
function ContestAnchorCornersV3() {
  const s = SCAN_GEOMETRY_V3.contestAnchorSize;
  return (
    <>
      <span className={`pointer-events-none absolute left-0 top-0 z-0 ${s} rounded-sm bg-black`} aria-hidden />
      <span className={`pointer-events-none absolute right-0 top-0 z-0 ${s} rounded-sm bg-black`} aria-hidden />
      <span className={`pointer-events-none absolute bottom-0 left-0 z-0 ${s} rounded-sm bg-black`} aria-hidden />
      <span className={`pointer-events-none absolute bottom-0 right-0 z-0 ${s} rounded-sm bg-black`} aria-hidden />
    </>
  );
}

/** v4: per-row alignment rail marker. */
function RowMarkerV4() {
  return (
    <span
      className={`inline-block shrink-0 rounded-sm bg-black ${SCAN_GEOMETRY_V4.railMarkerSize}`}
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
  qrWidth = SCAN_GEOMETRY.qrWidth,
  institutionLines = BALLOT_V2_INSTITUTION_LINES,
  academicYearLine = "A.Y. 2025-2026",
  showAbstain = true,
  ballotRecipientLine,
  jurisdictionLine,
  layoutHash,
  onGeometryTemplateReady,
}: PrintableBallotSheetProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const isV3 = templateVersion === BALLOT_TEMPLATE_V3 || templateVersion.startsWith("ballot-template-v3");
  const isV4 = templateVersion === BALLOT_TEMPLATE_V4 || templateVersion.startsWith("ballot-template-v4");

  const positionsSorted = useMemo(
    () =>
      positions.map((pos) => ({
        ...pos,
        candidates: sortCandidatesByLastName(pos.candidates),
      })),
    [positions]
  );

  const templateId = useMemo(
    () => buildDeterministicTemplateId(electionId, templateVersion, positionsSorted, showAbstain),
    [electionId, templateVersion, positionsSorted, showAbstain]
  );

  const bubbleElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const setBubbleElement = useCallback((optionId: string) => (el: HTMLElement | null) => {
    const m = bubbleElementsRef.current;
    if (el) m.set(optionId, el);
    else m.delete(optionId);
  }, []);

  const onGeometryReadyRef = useRef(onGeometryTemplateReady);
  onGeometryReadyRef.current = onGeometryTemplateReady;
  const lastGeometryJsonRef = useRef<string | null>(null);

  useEffect(() => {
    const json =
      ballotToken != null && ballotToken.length > 0
        ? stringifyBallotQrPayload(
            buildBallotQrPayload(
              electionId,
              ballotToken,
              templateVersion,
              templateId,
              layoutHash ?? undefined
            )
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
      margin: 3,
      errorCorrectionLevel: "H",
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
  }, [electionId, ballotToken, templateVersion, templateId, layoutHash, qrWidth]);

  /** Shrink the whole ballot to one A4 sheet when content is tall (Chromium print + zoom).
   *  Must register before the geometry `beforeprint` handler so bubble rects match the scaled print.
   */
  useLayoutEffect(() => {
    const rootId = "printable-ballot-root";
    const MM_TO_PX = 96 / 25.4;
    /** Keep in sync with @page ballot-sheet in globals.css */
    const printableHeightMm = 297 - 8 - 5;
    const printableWidthMm = 210 - 5 - 5;
    const MIN_ZOOM = 0.64;

    const applyPrintFit = () => {
      const root = document.getElementById(rootId) as HTMLElement | null;
      if (!root) return;
      root.style.removeProperty("zoom");
      const targetH = printableHeightMm * MM_TO_PX;
      const targetW = printableWidthMm * MM_TO_PX;
      const h = root.scrollHeight;
      const w = root.scrollWidth;
      if (h <= 0 || w <= 0) return;
      let scale = Math.min(1, (targetH / h) * 0.99, (targetW / w) * 0.99);
      if (scale >= 0.998) return;
      scale = Math.max(MIN_ZOOM, scale);
      root.style.setProperty("zoom", String(scale));
    };

    const clearPrintFit = () => {
      document.getElementById(rootId)?.style.removeProperty("zoom");
    };

    window.addEventListener("beforeprint", applyPrintFit);
    window.addEventListener("afterprint", clearPrintFit);
    return () => {
      window.removeEventListener("beforeprint", applyPrintFit);
      window.removeEventListener("afterprint", clearPrintFit);
    };
  }, []);

  useLayoutEffect(() => {
    if (isV3 || isV4 || !onGeometryReadyRef.current) return;

    const emit = () => {
      const cb = onGeometryReadyRef.current;
      if (!cb) return;
      const root = document.getElementById("printable-ballot-root");
      if (!root) return;
      const rr = root.getBoundingClientRect();

      let expected = 0;
      for (const p of positionsSorted) {
        expected += p.candidates.length;
        if (showAbstain) expected += 1;
      }
      if (bubbleElementsRef.current.size !== expected) {
        return;
      }

      const contests: OmGeometryContest[] = [];
      for (const pos of positionsSorted) {
        const bubbles: OmGeometryBubble[] = [];
        for (const c of pos.candidates) {
          const el = bubbleElementsRef.current.get(c.candidateId);
          if (!el) return;
          const br = el.getBoundingClientRect();
          bubbles.push({
            optionId: c.candidateId,
            label: formatBallotCandidateDisplay(c),
            x: br.left - rr.left,
            y: br.top - rr.top,
            w: br.width,
            h: br.height,
          });
        }
        if (showAbstain) {
          const aid = `abstain:${pos.positionId}`;
          const el = bubbleElementsRef.current.get(aid);
          if (!el) return;
          const br = el.getBoundingClientRect();
          bubbles.push({
            optionId: aid,
            label: "ABSTAIN",
            x: br.left - rr.left,
            y: br.top - rr.top,
            w: br.width,
            h: br.height,
          });
        }
        contests.push({
          positionId: pos.positionId,
          label: pos.positionName,
          maxVotes: Math.max(1, pos.maxVotes),
          bubbles,
        });
      }

      const payload: OmGeometryTemplate = {
        templateId,
        page: { width: rr.width, height: rr.height },
        contests,
      };
      const serialized = JSON.stringify(payload);
      if (lastGeometryJsonRef.current === serialized) return;
      lastGeometryJsonRef.current = serialized;
      cb(payload);
    };

    const run = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(emit);
      });
    };

    run();
    const root = document.getElementById("printable-ballot-root");
    const ro = root ? new ResizeObserver(() => run()) : null;
    if (root && ro) ro.observe(root);
    window.addEventListener("beforeprint", run);
    return () => {
      if (ro && root) ro.disconnect();
      window.removeEventListener("beforeprint", run);
    };
  }, [positionsSorted, showAbstain, templateId, isV3, isV4]);

  return (
    <div
      id="printable-ballot-root"
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      className="print-ballot-omr-root mx-auto box-border max-w-[210mm] bg-white text-black print:max-w-none"
    >
      <div className={`${SCAN_GEOMETRY.pagePadding}`}>
        <div
          className={`relative box-border overflow-visible bg-white px-5 pb-2.5 pt-2 print:px-4 print:pb-2 print:pt-2 ${SCAN_GEOMETRY.frameBorder}`}
          aria-label="Ballot scanning area"
        >
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
            <ScanFrameRegistration />
          </div>

          {/*
            bg-clip-content: white must NOT paint into padding insets, or it covers z-0 top/bottom/side
            timing strips (fiducial tracks). Padding stays visually transparent so marks remain visible.
          */}
          <div
            className={`relative z-[2] flex h-full min-h-0 flex-col bg-white bg-clip-content ${SCAN_GEOMETRY.contentInsetTop} ${SCAN_GEOMETRY.contentInsetBottom} ${SCAN_GEOMETRY.contentInsetX} ${SCAN_GEOMETRY.contentInsetPrint}`}
          >
            {/* Header */}
            <header className="mb-1 flex flex-col gap-1 border-b-2 border-black pb-1 print:mb-0 print:gap-0.5 print:pb-0.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 text-center sm:pr-2 sm:text-left">
                {institutionLines.map((line, i) => (
                  <p
                    key={i}
                    className={`font-bold uppercase tracking-wide text-black ${
                      i === 0
                        ? "text-[14px] leading-tight print:text-[13px]"
                        : "mt-0.5 text-[10px] leading-tight print:text-[9px]"
                    }`}
                  >
                    {line}
                  </p>
                ))}
                <p className="mt-0.5 text-[12px] font-bold uppercase leading-tight text-black print:text-[11px]">
                  {electionName || "ELECTION"} · {academicYearLine}
                </p>
                {jurisdictionLine?.trim() ? (
                  <p className="mt-0.5 text-[9px] font-semibold normal-case leading-snug text-black print:text-[8px]">
                    {jurisdictionLine.trim()}
                  </p>
                ) : null}
                {/* Recipient identity line intentionally omitted from printed ballot. */}
              </div>
              <aside className="w-full shrink-0 border-2 border-black bg-white p-1 text-[8px] leading-snug text-black sm:max-w-[240px] print:max-w-[200px] print:p-0.5 print:text-[6.5px] print:leading-tight">
                <p className="text-justify">{BALLOT_V2_INSTRUCTIONS}</p>
              </aside>
            </header>

            {/* Contest geometry intentionally uniform for repeatable bubble cropping/scoring. */}
            <section className="flex-1 space-y-2 print:space-y-1" aria-label="Ballot contests">
              {positionsSorted.map((pos, posIdx) => {
                const barBg = SECTION_HEADER_BW;
                let running = 0;
                const rows = chunkRows(pos.candidates, 3);
                const rowH = SCAN_GEOMETRY.v2TableRowHeightClass;
                const outerTableStyle: CSSProperties = {
                  tableLayout: "fixed",
                  width: "100%",
                  borderCollapse: "separate",
                  borderSpacing: 0,
                };
                return (
                  <article
                    key={pos.positionId}
                    className={
                      isV3 || isV4
                        ? "break-inside-avoid border-2 border-black bg-white"
                        : "break-inside-avoid"
                    }
                  >
                    {(isV3 || isV4) && (
                      <div
                        className={`flex flex-row flex-nowrap items-center justify-center gap-x-2 border-b-2 border-black px-2 py-1.5 text-center ${barBg} ${SCAN_GEOMETRY.contestHeaderHeight} print:px-2 print:py-1`}
                      >
                        <h2 className="min-w-0 truncate text-[12px] font-bold uppercase leading-none text-black print:text-[11px]">
                          {pos.positionName}
                        </h2>
                        <p className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase leading-none text-black print:text-[9px]">
                          {contestRuleParen(pos.maxVotes)}
                        </p>
                      </div>
                    )}
                    {isV4 ? (
                      <div className="px-1 pb-1 pt-0.5 print:px-0.5 print:pb-0.5 print:pt-0.5">
                        {/* v4: compact contest core with local alignment rails, no large inner anchor box. */}
                        <div className="space-y-0.5">
                          {pos.candidates.map((candidate) => {
                            const label = String(++running).padStart(2, "0");
                            return (
                              <div
                                key={candidate.candidateId}
                                className={`grid items-center gap-x-2 border-b border-black ${
                                  SCAN_GEOMETRY_V4.useRightRail
                                    ? "grid-cols-[0.75rem_1.8rem_1fr_1.8rem_0.75rem]"
                                    : "grid-cols-[0.75rem_1.8rem_1fr_1.8rem]"
                                } ${SCAN_GEOMETRY_V4.rowHeight}`}
                              >
                                {/* Left alignment rail marker: one per row, aligned with bubble center. */}
                                <RowMarkerV4 />
                                <span className="text-right text-[9px] font-bold tabular-nums text-black print:text-[8px]">
                                  {label}
                                </span>
                                <span className="min-w-0 text-[9px] font-semibold uppercase leading-snug text-black print:text-[8px]">
                                  {formatBallotCandidateDisplay(candidate)}
                                </span>
                                <span
                                  className={`inline-block shrink-0 rounded-full border-[2.7px] border-black bg-black ${SCAN_GEOMETRY_V4.bubbleSize}`}
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
                              <span className="text-right text-[9px] font-bold tabular-nums text-black print:text-[8px]">
                                —
                              </span>
                              <span className="text-[9px] font-bold uppercase text-black print:text-[8px]">
                                Abstain
                              </span>
                              <span
                                className={`inline-block shrink-0 rounded-full border-[2.7px] border-black bg-black ${SCAN_GEOMETRY_V4.bubbleSize}`}
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
                                  className={`grid grid-cols-[0.75rem_1.8rem_1fr_1.8rem_0.75rem] items-center gap-x-2 border-b border-black ${SCAN_GEOMETRY_V3.rowHeight}`}
                                >
                                  {/* Row markers align with bubble center for row-level correction. */}
                                  <RowMarkerV3 />
                                  <span className="text-right text-[9px] font-bold tabular-nums text-black print:text-[8px]">
                                    {label}
                                  </span>
                                  <span className="min-w-0 text-[9px] font-semibold uppercase leading-snug text-black print:text-[8px]">
                                    {formatBallotCandidateDisplay(candidate)}
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
                                <span className="text-right text-[9px] font-bold tabular-nums text-black print:text-[8px]">
                                  —
                                </span>
                                <span className="text-[9px] font-bold uppercase text-black print:text-[8px]">
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
                      <table
                        className="ballot-v2-table w-full bg-white"
                        style={outerTableStyle}
                      >
                        <colgroup>
                          <col style={{ width: "33.333333%" }} />
                          <col style={{ width: "33.333333%" }} />
                          <col style={{ width: "33.333334%" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th
                              colSpan={3}
                              className="bg-white px-1.5 py-0.5 text-center print:px-1 print:py-0.5"
                            >
                              <div className="flex flex-row flex-nowrap items-center justify-center gap-x-1.5 overflow-hidden text-black">
                                <span className="min-w-0 truncate text-[12px] font-bold uppercase leading-none print:text-[11px]">
                                  {pos.positionName}
                                </span>
                                <span className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase leading-none print:text-[9px]">
                                  {contestRuleParen(pos.maxVotes)}
                                </span>
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, ri) => {
                            const isLastCandidateRow = showAbstain && ri === rows.length - 1;
                            const isLastDataRowNoAbstain = !showAbstain && ri === rows.length - 1;
                            return (
                              <tr
                                key={`${pos.positionId}-r-${ri}`}
                                className={`${rowH} ${isLastCandidateRow ? "ballot-v2-last-candidate" : ""} ${isLastDataRowNoAbstain ? "ballot-v2-last-data-row" : ""}`}
                              >
                                {row.map((cell, ci) => {
                                  const label = cell ? String(++running).padStart(2, "0") : "";
                                  return (
                                    <td
                                      key={`${pos.positionId}-${ri}-${ci}`}
                                      className={`p-0 align-middle ${rowH}`}
                                      style={{ height: SCAN_GEOMETRY.v2RowHeightPx }}
                                    >
                                      <V2FixedCandidateCell
                                        numLabel={label}
                                        candidate={cell}
                                        bubbleRef={
                                          cell ? setBubbleElement(cell.candidateId) : undefined
                                        }
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {showAbstain ? (
                            <tr className={`ballot-v2-abstain ${rowH}`}>
                              <td
                                className={`p-0 align-middle ${rowH}`}
                                style={{ height: SCAN_GEOMETRY.v2RowHeightPx }}
                              >
                                <V2FixedAbstainCell
                                  bubbleRef={setBubbleElement(`abstain:${pos.positionId}`)}
                                />
                              </td>
                              <td
                                className={`p-0 align-middle ${rowH}`}
                                style={{ height: SCAN_GEOMETRY.v2RowHeightPx }}
                                aria-hidden
                              >
                                <V2FixedCandidateCell numLabel="" candidate={null} />
                              </td>
                              <td
                                className={`p-0 align-middle ${rowH}`}
                                style={{ height: SCAN_GEOMETRY.v2RowHeightPx }}
                                aria-hidden
                              >
                                <V2FixedCandidateCell numLabel="" candidate={null} />
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    )}
                  </article>
                );
              })}
            </section>

            <footer className="mt-1 flex items-end justify-end border-t-2 border-black pt-3 print:mt-0 print:pt-1.5">
              <div
                className="shrink-0 bg-white"
                style={{
                  marginBottom: SCAN_GEOMETRY.qrFooterInsetBottomPx,
                  marginRight: SCAN_GEOMETRY.qrFooterInsetRightPx,
                  padding: SCAN_GEOMETRY.qrQuietZonePaddingPx,
                }}
                aria-hidden={!!qrDataUrl}
              >
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt=""
                    width={qrWidth}
                    height={qrWidth}
                    className="block shrink-0 bg-white"
                  />
                ) : (
                  <div
                    className="flex shrink-0 items-center justify-center bg-white text-[8px] text-black"
                    style={{ width: qrWidth, height: qrWidth }}
                  >
                    {qrError ?? "…"}
                  </div>
                )}
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
