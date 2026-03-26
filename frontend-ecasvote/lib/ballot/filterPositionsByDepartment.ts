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
    elektrons: "elektrons",
    elecktrons: "elektrons",
  };
  return aliases[raw] ?? raw;
}

/**
 * CAS-wide races (USC, CAS SC, etc.) appear for every voter.
 * `*-governor` positions are org-specific — only the voter's department governor race is included.
 */
export function filterPositionsByVoterDepartment(
  positions: Position[],
  voterDepartment: string
): Position[] {
  const slug = departmentSlug(voterDepartment);
  if (!slug) {
    return positions;
  }

  return positions.filter((p) => {
    const id = p.id.toLowerCase();
    if (!id.endsWith("-governor")) {
      return true;
    }
    return id === `${slug}-governor`;
  });
}
