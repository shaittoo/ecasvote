"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchElection, fetchElections, fetchPositions } from "@/lib/ecasvoteApi";
import type { Election, Position } from "@/lib/ecasvoteApi";
import { CandidateCard } from "@/components/candidate-card";
import { Lock, Users } from "lucide-react";

export type CandidatesPositionsPanelProps = {
  /** Override the election ID to display. If omitted, uses the current active election. */
  electionId?: string;
  /** Shown under "No positions found" when the election has no positions. */
  emptyPositionsHint?: string;
  /** Shown inside a position card when it has no candidates. */
  emptyCandidatesHint?: string;
  /** Skip the candidatesPublished check (for admin views). */
  skipPublishCheck?: boolean;
};

export function CandidatesPositionsPanel({
  electionId: electionIdProp,
  emptyPositionsHint = "Check back later.",
  emptyCandidatesHint = "No candidates for this position yet.",
  skipPublishCheck = false,
}: CandidatesPositionsPanelProps) {
  const [elections, setElections] = useState<Election[]>([]);
  const [loadingElections, setLoadingElections] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [published, setPublished] = useState(true);
  const [resolvedElectionId, setResolvedElectionId] = useState<string | null>(electionIdProp ?? null);

  // Resolve the election ID: use prop, or find the active/recent election
  useEffect(() => {
    if (electionIdProp) {
      setResolvedElectionId(electionIdProp);
      return;
    }
    setLoadingElections(true);
    fetchElections()
      .then((list) => {
        setElections(list);
        const open = list.find((e: Election) => e.status === "OPEN");
        const closed = list.find((e: Election) => e.status === "CLOSED");
        const best = open ?? closed ?? list[0] ?? null;
        setResolvedElectionId(best?.id ?? null);
      })
      .catch(() => {
        setElections([]);
        setResolvedElectionId(null);
      })
      .finally(() => setLoadingElections(false));
  }, [electionIdProp]);

  const loadPositions = useCallback(async () => {
    if (!resolvedElectionId) return;
    setLoading(true);
    try {
      if (!skipPublishCheck) {
        const election = await fetchElection(resolvedElectionId).catch(() => null);
        setPublished(!!election?.candidatesPublished);
      }
      const data = await fetchPositions(resolvedElectionId);
      setPositions(data || []);
    } catch (error) {
      console.error("Failed to load positions:", error);
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedElectionId, skipPublishCheck]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {!electionIdProp ? (
        <div className="max-w-md">
          <label htmlFor="candidates-election-select" className="mb-1.5 block text-sm font-medium text-gray-700">
            Election
          </label>
          <select
            id="candidates-election-select"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={resolvedElectionId ?? ""}
            disabled={loadingElections || elections.length === 0}
            onChange={(e) => setResolvedElectionId(e.target.value || null)}
          >
            {elections.length === 0 ? (
              <option value="">
                {loadingElections ? "Loading elections..." : "No elections"}
              </option>
            ) : (
              elections.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || e.id}
                </option>
              ))
            )}
          </select>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-dashed bg-muted/30 py-16 text-center text-sm text-muted-foreground">
          Loading candidates...
        </div>
      ) : !published ? (
        <div className="rounded-xl border border-dashed bg-card py-16 text-center">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">Candidate list has not been published yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Check back later - candidates will be visible once published by the election board.</p>
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
