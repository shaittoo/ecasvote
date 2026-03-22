/**
 * Deterministic preview ballot token for a voter-specific print (before issuance).
 * Distinct from generic preview ids; still not a real `TKN-…` until issued in DB.
 */
export function buildVoterPreviewBallotToken(electionId: string, studentNumber: string): string {
  const e = electionId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sn = studentNumber.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const raw = `${e}-BV-${sn}`.toUpperCase();
  return raw.length > 96 ? raw.slice(0, 96) : raw;
}

/** @deprecated Use {@link buildVoterPreviewBallotToken} */
export const buildVoterPaperBallotId = buildVoterPreviewBallotToken;
