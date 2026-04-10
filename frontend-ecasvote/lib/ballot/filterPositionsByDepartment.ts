import type { Position } from "@/lib/ecasvoteApi";

/**
 * Normalize voter department to match chaincode position ids (e.g. `elektrons-governor`).
 */
function departmentSlug(department: string): string {
  const raw = department
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // Normalize known org naming variants to chaincode position ids.
  const aliases: Record<string, string> = {
    "red-bolts": "redbolts",
    redbolts: "redbolts",
    skimmers: "skimmers",
    clovers: "clovers",
    clo: "clovers",
    elektrons: "elektrons",
    elecktrons: "elektrons",
  };
  return aliases[raw] ?? raw;
}

/**
 * Longer prefixes first so `clo` does not match `clovers-*`.
 * Maps position-id prefix → canonical org slug (same as departmentSlug values).
 */
const ACADEMIC_ORG_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["clovers", "clovers"],
  ["elektrons", "elektrons"],
  ["redbolts", "redbolts"],
  ["skimmers", "skimmers"],
  ["clo", "clovers"],
];

function orgSlugOwningAcademicOrgPosition(positionId: string): string | null {
  const id = positionId.trim().toLowerCase();
  for (const [prefix, org] of ACADEMIC_ORG_PREFIXES) {
    const gov = `${prefix}-governor`;
    if (id === gov || id.startsWith(`${prefix}-`)) {
      return org;
    }
  }
  return null;
}

function isVoterOrgGovernorPositionId(id: string, voterSlug: string): boolean {
  if (id === `${voterSlug}-governor`) return true;
  if (voterSlug === "clovers" && id === "clo-governor") return true;
  return false;
}

/**
 * Same rules as GET /api/omr-layout contest filtering (gateway-api).
 * - `usc-*` / `cas-*` → every voter
 * - Known org prefixes (`elektrons-`, `clovers-`, `clo-`, …) → only that org’s **governor** row for matching voters; other orgs’ rows dropped; same-org non-governor rows dropped
 */
export function isContestAllowedForVoterDepartment(
  positionId: string,
  voterDepartmentSlug: string
): boolean {
  if (!voterDepartmentSlug) return true;
  const id = positionId.trim().toLowerCase();
  const head = id.split("-")[0] ?? "";
  if (head === "usc" || head === "cas") return true;

  const owner = orgSlugOwningAcademicOrgPosition(id);
  if (owner == null) return true;
  if (owner !== voterDepartmentSlug) return false;
  return isVoterOrgGovernorPositionId(id, voterDepartmentSlug);
}

/**
 * CAS-wide races (USC, CAS SC, etc.) appear for every voter.
 * Per-org academic org races on the paper ballot are only that org’s governor contest.
 */
export function filterPositionsByVoterDepartment(
  positions: Position[],
  voterDepartment: string
): Position[] {
  const slug = departmentSlug(voterDepartment);
  if (!slug) {
    return positions;
  }

  return positions.filter((p) => isContestAllowedForVoterDepartment(p.id, slug));
}
