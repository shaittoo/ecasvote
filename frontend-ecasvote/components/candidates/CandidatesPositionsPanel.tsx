"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchPositions } from "@/lib/ecasvoteApi";
import type { Position } from "@/lib/ecasvoteApi";
import { CandidateCard } from "@/components/candidate-card";
import { Users } from "lucide-react";

const ELECTION_ID = "election-2025";

export type CandidatesPositionsPanelProps = {
  /** Shown under “No positions found” when the election has no positions. */
  emptyPositionsHint?: string;
  /** Shown inside a position card when it has no candidates. */
  emptyCandidatesHint?: string;
};

export function CandidatesPositionsPanel({
  emptyPositionsHint = "Check back later.",
  emptyCandidatesHint = "No candidates for this position yet.",
}: CandidatesPositionsPanelProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPositions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPositions(ELECTION_ID);
      setPositions(data || []);
    } catch (error) {
      console.error("Failed to load positions:", error);
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {loading ? (
        <div className="rounded-xl border border-dashed bg-muted/30 py-16 text-center text-sm text-muted-foreground">
          Loading candidates…
        </div>
      ) : positions.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">No positions found</p>
          <p className="mt-1 text-xs text-muted-foreground">{emptyPositionsHint}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {positions.map((position) => (
            <Card key={position.id} className="overflow-hidden border-border/80 shadow-sm">
              <CardHeader className="border-b bg-muted/25 pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-semibold tracking-tight">{position.name}</CardTitle>
                    <CardDescription className="text-sm">
                      You may vote for up to {position.maxVotes} candidate
                      {position.maxVotes === 1 ? "" : "s"} in this race.
                    </CardDescription>
                  </div>
                  <Badge
                    variant="secondary"
                    className="w-fit shrink-0 border border-border/80 bg-background font-medium"
                  >
                    Max {position.maxVotes} vote{position.maxVotes === 1 ? "" : "s"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {position.candidates.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{emptyCandidatesHint}</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {position.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <CandidateCard candidate={candidate} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
