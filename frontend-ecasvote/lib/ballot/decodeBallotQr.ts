import type { BallotQrPayload } from "./printableBallotTypes";

/**
 * Parse JSON from a decoded QR string (paper ballot encodes compact JSON).
 */
export function parseBallotQrPayload(text: string): BallotQrPayload | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t) as Partial<BallotQrPayload> & {
      e?: string;
      b?: string;
      v?: string;
    };
    const electionId =
      typeof o.electionId === "string" && o.electionId.length > 0
        ? o.electionId
        : typeof o.e === "string" && o.e.length > 0
          ? o.e
          : "";
    const ballotToken =
      typeof o.ballotToken === "string" && o.ballotToken.length > 0
        ? o.ballotToken
        : typeof o.b === "string" && o.b.length > 0
          ? o.b
          : typeof o.ballotId === "string" && o.ballotId.length > 0
            ? o.ballotId
            : "";
    const templateVersion =
      typeof o.templateVersion === "string" && o.templateVersion.length > 0
        ? o.templateVersion
        : typeof o.v === "string" && o.v.length > 0
          ? o.v
          : "";
    if (electionId && ballotToken && templateVersion) {
      return {
        electionId,
        ballotToken,
        templateVersion,
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
