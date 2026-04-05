import type { BallotQrPayload } from "./printableBallotTypes";

/**
 * Builds the logical QR payload for a paper ballot.
 * Layout is NOT in the QR — the OMR worker fetches it from GET /api/omr-layout/:ballotId
 * using ballotToken after decode.
 *
 * Encoded on paper as compact JSON `{ e, b, v }` (see {@link stringifyBallotQrPayload}).
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
    electionId: eid,
    ballotToken: tok,
    templateVersion: tv,
  };
}

/** Same as {@link buildBallotQrPayload} — paper hybrid uses only this shape. */
export const buildPaperBallotQrPayload = buildBallotQrPayload;

/** Encodes as `{ e, b, v }` — shorter keys + fewer QR modules than long property names. */
export function stringifyBallotQrPayload(payload: BallotQrPayload): string {
  return JSON.stringify({
    e: payload.electionId,
    b: payload.ballotToken,
    v: payload.templateVersion,
  });
}
