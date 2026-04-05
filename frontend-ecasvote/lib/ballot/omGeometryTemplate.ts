/**
 * Machine-readable bubble geometry for template-driven OMR (no layout inference).
 * Coordinates are CSS pixels relative to `#printable-ballot-scan-frame` (fiducial/timing
 * border), matching the quad the OMR worker rectifies to canonical pixels — not the outer
 * `#printable-ballot-root` (which includes page padding and skews scale).
 */

/** Minimal shape for hashing — avoids importing printableBallotTypes (cycle). */
export type TemplateIdPositionInput = {
  positionId: string;
  maxVotes: number;
  candidates: { candidateId: string }[];
};

/** Top-left and size in CSS px relative to `#printable-ballot-scan-frame` (same units as `page`). */
export type OmGeometryBubble = {
  optionId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OmGeometryContest = {
  positionId: string;
  label: string;
  maxVotes: number;
  bubbles: OmGeometryBubble[];
};

/** Top-level geometry block embedded in the scanner template JSON. */
export type OmGeometryTemplate = {
  templateId: string;
  page: { width: number; height: number };
  contests: OmGeometryContest[];
};

/** Deterministic id from ballot structure (stable before/after DOM measure). */
export function buildDeterministicTemplateId(
  electionId: string,
  templateVersion: string,
  positions: TemplateIdPositionInput[],
  showAbstain: boolean
): string {
  const payload = JSON.stringify({
    electionId,
    templateVersion,
    showAbstain,
    positions: positions.map((p) => ({
      positionId: p.positionId,
      maxVotes: p.maxVotes,
      candidateIds: [...p.candidates.map((c) => c.candidateId)].sort(),
    })),
  });
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `om-${(h >>> 0).toString(16)}`;
}

/** Normalized 0–1 coordinates in QR for OMR worker (bubble centers). */
export type QrLayoutBubble = { optionId: string; x: number; y: number };

export type QrLayoutContest = {
  id: string;
  maxVotes: number;
  bubbles: QrLayoutBubble[];
};

export type QrLayoutPayload = { contests: QrLayoutContest[] };

/** Build QR `layout` from measured pixel geometry (same sheet as print). */
export function buildNormalizedQrLayoutFromGeometry(geom: OmGeometryTemplate): QrLayoutPayload {
  const pw = geom.page.width;
  const ph = geom.page.height;
  if (pw <= 0 || ph <= 0) {
    return { contests: [] };
  }
  return {
    contests: geom.contests.map((c) => ({
      id: c.positionId,
      maxVotes: c.maxVotes,
      bubbles: c.bubbles.map((b) => ({
        optionId: b.optionId,
        x: (b.x + b.w / 2) / pw,
        y: (b.y + b.h / 2) / ph,
      })),
    })),
  };
}
