import type { BallotQrPayload } from "./printableBallotTypes";

/**
 * Builds the JSON object encoded in the paper ballot QR code.
 * Field order: electionId → ballotToken → templateVersion (stable for docs / tests).
 */
export function buildBallotQrPayload(
  electionId: string,
  ballotToken: string,
  templateVersion: string
): BallotQrPayload {
  const eid = electionId.trim();
  const tok = ballotToken.trim();
  const tv = templateVersion.trim();
  if (!eid || !tok || !tv) {
    throw new Error(
      "Ballot QR payload requires non-empty electionId, ballotToken, and templateVersion"
    );
  }
  return {
    // Keep key order stable for deterministic QR JSON.
    electionId: eid,
    ballotToken: tok,
    templateVersion: tv,
  };
}

/** Same as {@link buildBallotQrPayload} — paper hybrid uses only this shape. */
export const buildPaperBallotQrPayload = buildBallotQrPayload;

/** Compact JSON string for QR (smaller, fewer modules than pretty-printed). */
export function stringifyBallotQrPayload(payload: BallotQrPayload): string {
  return JSON.stringify(payload);
}
