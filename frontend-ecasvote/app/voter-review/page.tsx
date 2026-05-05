"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VoterReviewPayload } from "@/types/voterReview";

const VOTER_REVIEW_STORAGE_KEY = "ecasvote_review_payload";
const VOTER_REVIEW_BROADCAST_NAME = "ecasvote_review";

function maskBallotToken(token: string): string {
  const t = token.trim();
  if (!t) return "****";
  return `****${t.slice(-4)}`;
}

export default function VoterReviewPage() {
  const [payload, setPayload] = useState<VoterReviewPayload | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOTER_REVIEW_STORAGE_KEY);
      if (!raw) {
        setParseError("No review data found. Ask the admin to scan again.");
        return;
      }
      const parsed = JSON.parse(raw) as VoterReviewPayload;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof parsed.ballotToken !== "string"
      ) {
        setParseError("Review data was invalid.");
        return;
      }
      setPayload(parsed);
    } catch {
      setParseError("Could not read review data.");
    }
  }, []);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(VOTER_REVIEW_BROADCAST_NAME);
      ch.onmessage = (ev: MessageEvent<{ type?: string }>) => {
        if (ev.data?.type === "REVIEW_DONE") {
          window.close();
        }
      };
    } catch {
      /* BroadcastChannel unsupported — page stays open */
    }
    return () => {
      try {
        ch?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const orderedPositionIds = useMemo(() => {
    if (!payload) return [];
    return Object.keys(payload.selectionsByPosition);
  }, [payload]);

  if (parseError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8f6f4] to-[#ebe8e4] px-4 py-10">
        <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center text-sm text-amber-950 shadow-sm">
          {parseError}
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#f8f6f4] to-[#ebe8e4]">
        <p className="text-sm text-muted-foreground">Loading review…</p>
      </div>
    );
  }

  const tokenMasked = maskBallotToken(payload.ballotToken);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f6f4] to-[#ebe8e4] px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[#7A0019]">
            Ballot selections review
          </h1>
          <p className="text-sm text-muted-foreground">{payload.electionName}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <Badge variant="outline" className="font-mono text-xs">
              {tokenMasked}
            </Badge>
            <Badge
              className={
                payload.tokenValidationOk
                  ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                  : "border-red-200 bg-red-100 text-red-900"
              }
            >
              Token {payload.tokenValidationOk ? "validated" : "not validated"}
            </Badge>
          </div>
        </header>

        <div className="rounded-lg border border-[#7A0019]/20 bg-[#7A0019]/5 px-4 py-3 text-center text-sm text-gray-800">
          Please confirm with the SEB Admin that these selections match your ballot.
        </div>

        <div className="space-y-4">
          {orderedPositionIds.length === 0 ? (
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No contests were included for this review.
              </CardContent>
            </Card>
          ) : (
            orderedPositionIds.map((positionId) => {
              const positionName =
                payload.positionLabels[positionId] ?? positionId;
              const maxVotes = payload.maxVotesByPosition[positionId] ?? 0;
              const ids = payload.selectionsByPosition[positionId] ?? [];

              const lines = ids.map((id) => {
                if (id.startsWith("abstain:")) return "Abstain";
                return payload.candidateLabels[id] ?? id;
              });

              return (
                <Card key={positionId} className="border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base font-semibold">
                      <span>{positionName}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        Up to {maxVotes}{" "}
                        {maxVotes === 1 ? "selection" : "selections"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    {lines.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground">
                        No selection detected
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {lines.map((label, i) => (
                          <li
                            key={`${positionId}-${i}`}
                            className="flex items-start gap-2 rounded-md border border-[#7A0019]/15 bg-white px-3 py-2 text-sm"
                          >
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#7A0019]"
                              aria-hidden
                            />
                            <span className="font-medium leading-snug">{label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <p className="pb-6 text-center text-xs text-muted-foreground">
          This screen closes automatically when the admin finishes. Do not refresh or close it unless instructed.
        </p>
      </div>
    </div>
  );
}
