import type { Position } from "@/lib/ecasvoteApi";
import type { PrintableBallotPosition } from "./printableBallotTypes";

function sortKeyByLastName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1]! : name;
  return last.toLowerCase();
}

/** Alphabetical by last token of `name` (used when positions are not passed through {@link mapPositionsToPrintableBallot}). */
export function sortCandidatesByLastName<T extends { name: string }>(candidates: readonly T[]): T[] {
  return [...candidates].sort((a, b) =>
    sortKeyByLastName(a.name).localeCompare(sortKeyByLastName(b.name), undefined, { sensitivity: "base" })
  );
}

/**
 * Maps gateway `GET /elections/:id/positions` rows to the printable ballot shape.
 */
export function mapPositionsToPrintableBallot(positions: Position[]): PrintableBallotPosition[] {
  return [...positions]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      positionId: p.id,
      positionName: p.name,
      maxVotes: p.maxVotes,
      candidates: sortCandidatesByLastName(p.candidates).map((c) => ({
        candidateId: c.id,
        name: c.name,
        /** Political party only (no program/department on the paper ballot). */
        affiliation: c.party?.trim() || undefined,
      })),
    }));
}
