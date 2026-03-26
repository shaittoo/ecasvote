/**
 * Machine-readable description of the **printed** paper ballot for OMR pipelines
 * (Open MCR, ExamGrader-style tools, or a custom OpenCV worker).
 *
 * Aligns with {@link PrintableBallotSheet}: full-page registration frame
 * (unique corner fiducials + edge timing squares), stacked contests with
 * 3-column row-major bubbles, and an in-frame QR metadata zone.
 * **Multiple shading** = up to `maxMarks` filled bubbles per contest (same as `maxVotes`).
 */

import type { PrintableBallotPosition } from "@/lib/ballot/printableBallotTypes";
import type { Position } from "@/lib/ecasvoteApi";

export const SCANNER_TEMPLATE_SCHEMA = "ecasvote-scanner-template/1" as const;

/** How the physical sheet is laid out (for alignment / CV tuning). */
export type ScannerSheetLayout = {
  fiducials: {
    count: 8 | 12;
    style: "filled-square" | "unique-corner-square";
    placement:
      | "corners-and-vertical-mid-edges"
      | "scan-frame-corners-and-edge-centers";
    /** Orientation can be inferred from corner patterns alone. */
    cornerPatterns?: "unique-per-corner";
  };
  qr: {
    role: "ballot-identity-only";
    payloadShape: "{ electionId, ballotToken, templateVersion }";
    /** Optional: human note for export / worker docs */
    placementNote?: string;
    quietZoneModules?: number;
  };
  bubbles: {
    shape: "horizontal-oval" | "round";
    implementationNote: string;
    rowGrid?: "uniform-fixed-height";
    columnModel?: "single-column-per-contest" | "multi-column";
  };
  localAnchors?: {
    contestLevel: boolean;
    rowLevel: boolean;
    note?: string;
  };
};

export type ScannerContestOption = {
  optionId: string;
  label: string;
  kind: "candidate" | "abstain";
};

/** One office / race on the sheet — OMR should read up to `maxMarks` darkened ovals. */
export type ScannerContestSpec = {
  positionId: string;
  positionName: string;
  /** Same as ballot `maxVotes`: allows multiple shaded bubbles (multi-seat). */
  maxMarks: number;
  options: ScannerContestOption[];
};

export type EcasvoteScannerTemplateV1 = {
  schemaVersion: typeof SCANNER_TEMPLATE_SCHEMA;
  /** Must match paper `templateVersion` (e.g. ballot-template-v1) */
  templateVersion: string;
  electionId: string;
  electionName: string;
  generatedAt: string;
  sheet: ScannerSheetLayout;
  contests: ScannerContestSpec[];
  /**
   * OMR tuning hints: consider a bubble "filled" if darkness exceeds threshold;
   * for multi-mark contests, take the top `maxMarks` by confidence / darkness.
   */
  omrHints: {
    multiMarkContests: boolean;
    interpretation:
      | "single-best-per-contest"
      | "top-k-by-fill-darkness"
      | "reject-if-too-many-marks";
  };
};

function positionsFromApi(
  positions: Position[],
  includeAbstain: boolean
): ScannerContestSpec[] {
  const sorted = [...positions].sort((a, b) => a.order - b.order);
  return sorted.map((p) => {
    const options: ScannerContestOption[] = p.candidates.map((c) => ({
      optionId: c.id,
      label: c.name,
      kind: "candidate" as const,
    }));
    if (includeAbstain) {
      options.push({
        optionId: `abstain:${p.id}`,
        label: "ABSTAIN",
        kind: "abstain",
      });
    }
    return {
      positionId: p.id,
      positionName: p.name,
      maxMarks: Math.max(1, p.maxVotes),
      options,
    };
  });
}

function positionsFromPrintable(
  positions: PrintableBallotPosition[],
  includeAbstain: boolean
): ScannerContestSpec[] {
  return positions.map((p) => {
    const options: ScannerContestOption[] = p.candidates.map((c) => ({
      optionId: c.candidateId,
      label: c.name,
      kind: "candidate" as const,
    }));
    if (includeAbstain) {
      options.push({
        optionId: `abstain:${p.positionId}`,
        label: "ABSTAIN",
        kind: "abstain",
      });
    }
    return {
      positionId: p.positionId,
      positionName: p.positionName,
      maxMarks: Math.max(1, p.maxVotes),
      options,
    };
  });
}

const DEFAULT_SHEET: ScannerSheetLayout = {
  fiducials: {
    count: 12,
    style: "unique-corner-square",
    placement: "scan-frame-corners-and-edge-centers",
    cornerPatterns: "unique-per-corner",
  },
  qr: {
    role: "ballot-identity-only",
    payloadShape: "{ electionId, ballotToken, templateVersion }",
    placementNote: "Bottom-right metadata zone inside the registration frame",
    quietZoneModules: 4,
  },
  bubbles: {
    shape: "round",
    implementationNote: "PrintableBallotSheet BallotBubble; v4 uses single-column bubbles with row alignment rails",
    rowGrid: "uniform-fixed-height",
    columnModel: "single-column-per-contest",
  },
  localAnchors: {
    contestLevel: true,
    rowLevel: true,
    note: "v4 favors rail-based local anchors (row markers) over large inner contest boxes",
  },
};

/**
 * Build a JSON template for OMR from gateway {@link Position} rows.
 * Use this from Ballot Scanning (or a worker) so sheet layout stays in sync with print.
 */
export function buildScannerTemplateFromPositions(
  electionId: string,
  electionName: string,
  templateVersion: string,
  positions: Position[],
  options?: { includeAbstain?: boolean }
): EcasvoteScannerTemplateV1 {
  const includeAbstain = options?.includeAbstain ?? true;
  const contests = positionsFromApi(positions, includeAbstain);
  const multi = contests.some((c) => c.maxMarks > 1);
  return {
    schemaVersion: SCANNER_TEMPLATE_SCHEMA,
    templateVersion,
    electionId,
    electionName,
    generatedAt: new Date().toISOString(),
    sheet: DEFAULT_SHEET,
    contests,
    omrHints: {
      multiMarkContests: multi,
      interpretation: multi
        ? "top-k-by-fill-darkness"
        : "reject-if-too-many-marks",
    },
  };
}

/** Same as {@link buildScannerTemplateFromPositions} but from printable props shape. */
export function buildScannerTemplateFromPrintableBallot(
  electionId: string,
  electionName: string,
  templateVersion: string,
  positions: PrintableBallotPosition[],
  options?: { includeAbstain?: boolean }
): EcasvoteScannerTemplateV1 {
  const includeAbstain = options?.includeAbstain ?? true;
  const contests = positionsFromPrintable(positions, includeAbstain);
  const multi = contests.some((c) => c.maxMarks > 1);
  return {
    schemaVersion: SCANNER_TEMPLATE_SCHEMA,
    templateVersion,
    electionId,
    electionName,
    generatedAt: new Date().toISOString(),
    sheet: DEFAULT_SHEET,
    contests,
    omrHints: {
      multiMarkContests: multi,
      interpretation: multi
        ? "top-k-by-fill-darkness"
        : "reject-if-too-many-marks",
    },
  };
}
