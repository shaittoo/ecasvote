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
        ...(typeof o.templateId === "string" && o.templateId.length > 0
          ? { templateId: o.templateId }
          : {}),
        ...(typeof o.ballotId === "string" && o.ballotId.length > 0
          ? { ballotId: o.ballotId }
          : {}),
        ...(typeof o.layoutHash === "string" && o.layoutHash.length > 0
          ? { layoutHash: o.layoutHash }
          : {}),
      };
    }
  } catch {
    /* not JSON */
  }
  return null;
}
