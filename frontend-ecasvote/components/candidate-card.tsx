"use client";

import Image from "next/image";
import type { Position } from "@/lib/ecasvoteApi";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

type Candidate = Position["candidates"][number] & { imageUrl?: string };

interface CandidateCardProps {
  candidate: Candidate;
}

/** Normalize party string: PMB and PMD both map to PMB styling */
function partyKind(party: string | undefined): "pmb" | "samasa" | "independent" | "other" {
  const p = party?.toLowerCase().trim() ?? "";
  if (p === "pmb" || p === "pmd") return "pmb";
  if (p === "samasa") return "samasa";
  if (p === "independent") return "independent";
  return "other";
}

function partyAccent(kind: ReturnType<typeof partyKind>): string {
  switch (kind) {
    case "pmb":
      return "border-l-blue-600 bg-gradient-to-r from-blue-50/90 to-card";
    case "samasa":
      return "border-l-red-600 bg-gradient-to-r from-red-50/90 to-card";
    case "independent":
      return "border-l-yellow-500 bg-gradient-to-r from-yellow-50/90 to-card";
    default:
      return "border-l-muted-foreground/30 bg-gradient-to-r from-muted/40 to-card";
  }
}

function badgeClasses(kind: ReturnType<typeof partyKind>): string {
  switch (kind) {
    case "pmb":
      return "border-blue-300 bg-blue-50 text-blue-900";
    case "samasa":
      return "border-red-300 bg-red-50 text-red-900";
    case "independent":
      return "border-yellow-400 bg-yellow-50 text-yellow-950";
    default:
      return "border-border bg-muted/50 text-foreground";
  }
}

function formatPartyLabel(party: string | undefined, kind: ReturnType<typeof partyKind>): string {
  if (!party?.trim()) return "";
  if (kind === "pmb") return "PMB";
  if (kind === "samasa") return "SAMASA";
  if (kind === "independent") return "Independent";
  return party;
}

export function CandidateCard({ candidate }: CandidateCardProps) {
  const kind = partyKind(candidate.party);
  const imageSrc = candidate.imageUrl?.trim()
    ? candidate.imageUrl
    : "/default-img.png";

  const partyLabel = formatPartyLabel(candidate.party, kind);

  return (
    <div
      className={cn(
        "group flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-all",
        "sm:flex-row sm:items-stretch sm:gap-5",
        "hover:shadow-md hover:border-foreground/20",
        "border-l-4",
        partyAccent(kind)
      )}
    >
      <div className="relative mx-auto shrink-0 sm:mx-0">
        <div
          className={cn(
            "relative h-28 w-28 overflow-hidden rounded-full border-2 border-background bg-muted shadow-inner",
            "ring-2 ring-border/60"
          )}
        >
          <Image
            src={imageSrc}
            alt={`Portrait of ${candidate.name}`}
            fill
            className="object-cover"
            sizes="112px"
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center space-y-2 text-center sm:text-left">
        <div>
          <h3 className="font-semibold text-lg leading-snug tracking-tight text-foreground">
            {candidate.name}
          </h3>
          {candidate.party ? (
            <Badge variant="outline" className={cn("mt-2 font-medium", badgeClasses(kind))}>
              {partyLabel}
            </Badge>
          ) : null}
        </div>

        <dl className="space-y-1.5 text-sm text-muted-foreground">
          {candidate.program ? (
            <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 sm:justify-start">
              <dt className="sr-only">Program</dt>
              <dd>
                <span className="font-medium text-foreground/90">Program:</span>{" "}
                {candidate.program}
              </dd>
            </div>
          ) : null}
          {candidate.yearLevel ? (
            <div className="flex flex-wrap items-baseline justify-center gap-x-2 sm:justify-start">
              <dt className="sr-only">Year level</dt>
              <dd>
                <span className="font-medium text-foreground/90">Year:</span>{" "}
                {candidate.yearLevel}
              </dd>
            </div>
          ) : null}
          {!candidate.program && !candidate.yearLevel && !candidate.party ? (
            <p className="flex items-center justify-center gap-1.5 text-xs italic sm:justify-start">
              <User className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
              No extra details on file
            </p>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
