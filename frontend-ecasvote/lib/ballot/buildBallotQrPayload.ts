import type { BallotQrPayload } from "./printableBallotTypes";

/**
 * Builds the compact QR payload for a paper ballot.
 * Layout is NOT embedded in the QR — the OMR worker fetches it from the backend
 * using ballotId after scanning.  layoutHash is stored for integrity verification.
 *
 * Payload is deterministically ordered and stays well under 500 bytes.
 * Shape: { ballotId, electionId, templateVersion, templateId?, layoutHash? }
 */
export function buildBallotQrPayload(
  electionId: string,
  ballotToken: string,
  templateVersion: string,
  templateId?: string,
  layoutHash?: string
): BallotQrPayload {
  const eid = electionId.trim();
  const tok = ballotToken.trim();
  const tv = templateVersion.trim();
  if (!eid || !tok || !tv) {
    throw new Error(
      "Ballot QR payload requires non-empty electionId, ballotToken, and templateVersion"
    );
  }
  const tid = templateId?.trim();
  const lh = layoutHash?.trim();
  return {
    // Stable key order for deterministic QR JSON.
    electionId: eid,
    ballotToken: tok,
    ballotId: tok,
    templateVersion: tv,
    ...(tid ? { templateId: tid } : {}),
    ...(lh ? { layoutHash: lh } : {}),
  };
}

/** Same as {@link buildBallotQrPayload} — paper hybrid uses only this shape. */
export const buildPaperBallotQrPayload = buildBallotQrPayload;

/** Compact JSON string for QR (smaller, fewer modules than pretty-printed). */
export function stringifyBallotQrPayload(payload: BallotQrPayload): string {
  return JSON.stringify(payload);
}
