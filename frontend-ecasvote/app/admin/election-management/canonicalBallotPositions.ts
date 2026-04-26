/**
 * Canonical ballot options (id + display name).
 * Keep in sync with `STANDARD_CAS_SC_POSITIONS` in `gateway-api/src/canonicalPositions.ts`.
 * Dropdown values use **id** so saves send stable `positionId` (e.g. usc-councilor).
 */
export const CANONICAL_BALLOT_POSITIONS = [
  { id: "usc-councilor", name: "USC Councilor" },
  { id: "cas-rep-usc", name: "CAS Rep. to the USC" },
  { id: "cas-chairperson", name: "CAS Chairperson" },
  { id: "cas-vice-chairperson", name: "CAS Vice Chairperson" },
  { id: "cas-councilor", name: "CAS Councilor" },
  { id: "clovers-governor", name: "Clovers Governor" },
  { id: "elektrons-governor", name: "Elektrons Governor" },
  { id: "redbolts-governor", name: "Redbolts Governor" },
  { id: "skimmers-governor", name: "Skimmers Governor" },
] as const;
