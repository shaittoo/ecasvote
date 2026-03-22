/**
 * Types for the printable paper ballot (eCASVote).
 * Replace mock data with API responses when backend is ready.
 */

/** Candidate row on the printed ballot */
export type PrintableBallotCandidate = {
  candidateId: string;
  name: string;
};

/** One office / position block */
export type PrintableBallotPosition = {
  positionId: string;
  positionName: string;
  maxVotes: number;
  candidates: PrintableBallotCandidate[];
};

/**
 * JSON encoded in the paper ballot QR (identification only — no vote selections).
 * Field order: electionId → ballotToken → templateVersion (stable for docs / scanners).
 */
export type BallotQrPayload = {
  electionId: string;
  ballotToken: string;
  templateVersion: string;
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
};
