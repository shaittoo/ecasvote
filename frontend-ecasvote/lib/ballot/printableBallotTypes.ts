/**
 * Types for the printable paper ballot (eCASVote).
 * Replace mock data with API responses when backend is ready.
 */

import type { OmGeometryTemplate } from "./omGeometryTemplate";

/** Candidate row on the printed ballot */
export type PrintableBallotCandidate = {
  candidateId: string;
  name: string;
  /** Shown after name (e.g. party, slate) — OMR reference style */
  affiliation?: string;
};

/** One office / position block */
export type PrintableBallotPosition = {
  positionId: string;
  positionName: string;
  maxVotes: number;
  candidates: PrintableBallotCandidate[];
};

/**
 * JSON encoded in the paper ballot QR (identification only — no vote data, no bubble layout).
 * Printed QR uses only electionId, ballotToken, templateVersion.
 * Optional fields are accepted when parsing legacy QRs or alternate scanner outputs.
 */
export type BallotQrPayload = {
  electionId: string;
  ballotToken: string;
  /** Same as `ballotToken` — some tools emit `ballotId` instead. */
  ballotId?: string;
  templateVersion: string;
  /** @deprecated Legacy QR; layout is loaded from the gateway by ballot token. */
  templateId?: string;
  /** @deprecated Legacy QR; hash is stored server-side with the layout. */
  layoutHash?: string;
};

/** Alias — same shape as {@link BallotQrPayload} */
export type PaperBallotQrPayload = BallotQrPayload;

/**
 * Printable sheet: QR encodes `{ electionId, ballotToken, templateVersion }` (no vote data).
 * `ballotToken` is the value on the sheet (e.g. issued `TKN-…` or a preview string).
 */
export type PrintableBallotSheetProps = {
  electionId: string;
  /** Encoded in QR and shown as “Ballot Token” on the sheet */
  ballotToken: string;
  templateVersion: string;
  electionName: string;
  positions: PrintableBallotPosition[];
  /** Pixel width of the QR image (default 64 for v2 single-page layout) */
  qrWidth?: number;
  /**
   * Optional: lines under OFFICIAL BALLOT (institution). Defaults to UP Visayas CAS template.
   */
  institutionLines?: readonly string[];
  /** e.g. "A.Y. 2025-2026" — shown on the STUDENT COUNCIL ELECTIONS line */
  academicYearLine?: string;
  /** Include ABSTAIN row per position (default true, matches paper ballot) */
  showAbstain?: boolean;
  /**
   * When printing for a specific voter (e.g. from roster), shown under the election title.
   */
  ballotRecipientLine?: string;
  /** Pre-numbered ballot face fields (HES / inventory style) */
  ballotNumber?: string;
  ballotSeries?: string;
  ballotZone?: string;
  /** Extra subtitle under title (e.g. locality) */
  jurisdictionLine?: string;
  /**
   * After layout, emits measured bubble boxes (v2 sheet) for scanner JSON.
   * Coordinates are relative to the scan frame (`#printable-ballot-scan-frame`).
   */
  onGeometryTemplateReady?: (template: OmGeometryTemplate) => void;
};
