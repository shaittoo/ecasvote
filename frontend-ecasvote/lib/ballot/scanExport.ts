/**
 * Raw export bundle for ballot scanning (admin download / audit).
 * Includes multi-mark selections as string arrays per position.
 */

export const SCAN_EXPORT_SCHEMA = "ecasvote-scan-export/1" as const;

/** One scanned image — full raw fields for downstream tools */
export type ScanExportBallotRow = {
  fileName: string;
  scanOk: boolean;
  source: "omr" | "client";
  message?: string;
  ballotToken?: string;
  tokenValidation?: unknown;
  /** QR payload from worker or client */
  qr?: Record<string, string> | null;
  /**
   * Canonical marks: positionId → list of optionIds (candidate id or abstain:…).
   * Empty array = no mark / overvote / unread. Multiple ids = multi-seat contest.
   */
  selectionsByPosition: Record<string, string[]>;
  /** Per position → optionId → fill score 0..1 (OMR only). May include _overvote. */
  rawBubbleScores?: Record<string, Record<string, number | boolean>>;
  /** Comma-joined option ids for flat tools (same data as selectionsByPosition) */
  selectionsFlat?: Record<string, string>;
  warpApplied?: boolean;
  /** Full worker JSON when source === omr (debug / reprocessing) */
  omrWorkerPayload?: unknown;
};

export type ScanExportBatch = {
  schemaVersion: typeof SCAN_EXPORT_SCHEMA;
  generatedAt: string;
  electionId: string;
  electionName: string;
  ballotTemplateVersion: string;
  /** Contests + maxMarks used for this scan */
  scannerTemplateContests?: Array<{
    positionId: string;
    positionName: string;
    maxMarks: number;
    optionIds: string[];
  }>;
  ballots: ScanExportBallotRow[];
};

export function buildScanExportBatch(params: {
  electionId: string;
  electionName: string;
  ballotTemplateVersion: string;
  scannerTemplate: unknown;
  ballots: ScanExportBallotRow[];
}): ScanExportBatch {
  const tpl = params.scannerTemplate as {
    contests?: Array<{
      positionId: string;
      positionName: string;
      maxMarks: number;
      options?: Array<{ optionId: string }>;
    }>;
  } | null;
  const contests = tpl?.contests;
  return {
    schemaVersion: SCAN_EXPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    electionId: params.electionId,
    electionName: params.electionName,
    ballotTemplateVersion: params.ballotTemplateVersion,
    scannerTemplateContests: contests?.map((c) => ({
      positionId: c.positionId,
      positionName: c.positionName,
      maxMarks: c.maxMarks,
      optionIds: (c.options ?? []).map((o) => o.optionId),
    })),
    ballots: params.ballots,
  };
}

/** Flatten selectionsByPosition for CSV-friendly maps */
export function selectionsToFlat(
  byPos: Record<string, string[]>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [pid, ids] of Object.entries(byPos)) {
    if (ids.length === 0) continue;
    out[pid] = ids.length === 1 ? ids[0] : ids.join(",");
  }
  return out;
}

/** Parse OMR worker `selectionsByPosition` from JSON (arrays or legacy strings). */
export function parseSelectionsByPosition(
  omr: Record<string, unknown>
): Record<string, string[]> {
  const bubbleRead =
    omr["bubbleRead"] && typeof omr["bubbleRead"] === "object" && !Array.isArray(omr["bubbleRead"])
      ? (omr["bubbleRead"] as Record<string, unknown>)
      : null;
  const raw =
    omr["selectionsByPosition"] ??
    omr["selections"] ??
    bubbleRead?.["selectionsByPosition"] ??
    bubbleRead?.["selections"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.map(String).filter(Boolean);
    else if (v == null) out[k] = [];
    else if (typeof v === "string")
      out[k] = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }
  return out;
}

export const SCAN_EXPORT_ALL_SCHEMA = "ecasvote-scan-export-batch-list/1" as const;

export type ScanExportAllBatches = {
  schemaVersion: typeof SCAN_EXPORT_ALL_SCHEMA;
  generatedAt: string;
  batches: ScanExportBatch[];
};
