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
  return {
    electionId,
    ballotToken,
    templateVersion,
  };
}

/** Same as {@link buildBallotQrPayload} — paper hybrid uses only this shape. */
export const buildPaperBallotQrPayload = buildBallotQrPayload;

/** Compact JSON string for QR (smaller, fewer modules than pretty-printed). */
export function stringifyBallotQrPayload(payload: BallotQrPayload): string {
  return JSON.stringify(payload);
}
