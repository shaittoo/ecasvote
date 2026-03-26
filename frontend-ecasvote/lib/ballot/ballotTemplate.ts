/**
 * Template id encoded in the ballot QR (with electionId + ballotToken).
 * Bump when the paper layout / QR schema changes.
 */
export const BALLOT_TEMPLATE_V1 = "ballot-template-v1" as const;
export const BALLOT_TEMPLATE_V2 = "ballot-template-v2" as const;
export const BALLOT_TEMPLATE_V3 = "ballot-template-v3" as const;
export const BALLOT_TEMPLATE_V4 = "ballot-template-v4" as const;

/** Default template used for newly printed sheets (A4-optimized local-rail alignment). */
export const BALLOT_TEMPLATE_VERSION = BALLOT_TEMPLATE_V2;
