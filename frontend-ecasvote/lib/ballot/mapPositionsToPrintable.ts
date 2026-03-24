import type { Position } from "@/lib/ecasvoteApi";
import type { PrintableBallotPosition } from "./printableBallotTypes";

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
      candidates: p.candidates.map((c) => ({
        candidateId: c.id,
        name: c.name,
        affiliation: [c.party, c.program].filter(Boolean).join(" · ") || undefined,
      })),
    }));
}
