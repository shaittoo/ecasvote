/**
 * Official ballot copy aligned with UP Visayas CAS paper ballot (thesis template v2).
 */

export const BALLOT_V2_INSTRUCTIONS = `Instructions: Completely shade the circle of your chosen candidate. Do not use check marks, X marks, or any other symbols. Vote only for the number of candidates allowed for each position. Shading more than the allowed number will invalidate your vote for that position only. Votes in other correctly marked positions will still be counted. Shade the "Abstain" option if you wish to not vote for a position.`;

/** Default header lines (override via PrintableBallotSheet props if needed) */
export const BALLOT_V2_INSTITUTION_LINES = [
  "OFFICIAL BALLOT",
  "UNIVERSITY OF THE PHILIPPINES – VISAYAS",
  "COLLEGE OF ARTS AND SCIENCES",
] as const;

/** Formats a candidate line like the sample: C01, MONTL (code + abbreviated surname). */
export function formatBallotCandidateLine(indexZeroBased: number, fullName: string): string {
  const code = `C${String(indexZeroBased + 1).padStart(2, "0")}`;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const surname = parts.length ? parts[parts.length - 1] : fullName;
  const abbrev = surname.replace(/[^a-zA-Z]/g, "").slice(0, 5).toUpperCase() || "NAME";
  return `${code}, ${abbrev}`;
}
