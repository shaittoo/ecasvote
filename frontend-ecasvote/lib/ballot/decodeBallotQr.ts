import type { BallotQrPayload } from "./printableBallotTypes";

/**
 * Parse JSON from a decoded QR string (paper ballot encodes compact JSON).
 */
export function parseBallotQrPayload(text: string): BallotQrPayload | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t) as Partial<BallotQrPayload>;
    if (
      typeof o.electionId === "string" &&
      o.electionId.length > 0 &&
      typeof o.ballotToken === "string" &&
      o.ballotToken.length > 0 &&
      typeof o.templateVersion === "string" &&
      o.templateVersion.length > 0
    ) {
      return {
        electionId: o.electionId,
        ballotToken: o.ballotToken,
        templateVersion: o.templateVersion,
      };
    }
  } catch {
    /* not JSON */
  }
  return null;
}
