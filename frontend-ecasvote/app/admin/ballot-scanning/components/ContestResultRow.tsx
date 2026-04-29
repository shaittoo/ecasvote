"use client";

import { Badge } from "@/components/ui/badge";
import type { Position } from "@/lib/ecasvoteApi";
import type { ContestReadItem } from "./ScanPageContent";

interface Props {
  position: Position;
  detectedSelections: string[];
  contestRead: ContestReadItem | null;
}

export function ContestResultRow({
  position,
  detectedSelections,
  contestRead,
}: Props) {
  const isOvervote = contestRead?.overvoteDetected ?? false;
  const isUndervote = contestRead?.undervoteDetected ?? false;
  const isAbstainConflict = contestRead?.abstainConflict ?? false;
  const isInvalid = isOvervote || isUndervote || isAbstainConflict;
  const maxVotes = position.maxVotes;
  const selectedCount = detectedSelections.length;

  return (
    <div
      className={`rounded-lg border p-4 ${
        isInvalid
          ? "border-red-300 bg-red-50/50"
          : selectedCount > 0
          ? "border-emerald-200 bg-emerald-50/30"
          : "border-gray-200"
      }`}
    >
      {/* Contest header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">
            {position.name}
          </h3>
          <span className="text-xs text-gray-400">
            (max {maxVotes})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isOvervote && (
            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
              OVERVOTE
            </Badge>
          )}
          {isAbstainConflict && (
            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
              CANDIDATE + ABSTAIN
            </Badge>
          )}
          {isUndervote && (
            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
              NO VOTE
            </Badge>
          )}
          {!isInvalid && selectedCount > 0 && (
            <span className="text-xs text-gray-500">
              {selectedCount}/{maxVotes} selected
            </span>
          )}
        </div>
      </div>

      {/* Selected candidates only (preserves ballot secrecy) */}
      <div className="space-y-1">
        {(() => {
          const abstainId = `abstain:${position.id}`;
          const hasAbstain = detectedSelections.includes(abstainId);
          const selectedCandidates = position.candidates.filter((cand) =>
            detectedSelections.includes(cand.id)
          );

          if (selectedCandidates.length === 0 && !hasAbstain) {
            return (
              <div className="flex items-center gap-3 rounded-md px-3 py-2 border border-transparent">
                <span className="text-sm italic text-gray-400">No selection</span>
              </div>
            );
          }

          return (
            <>
              {selectedCandidates.map((cand) => (
                <div
                  key={cand.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2 bg-[#7A0019]/5 border border-[#7A0019]/20"
                >
                  <div className="h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center border-[#7A0019] bg-[#7A0019]">
                    <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">
                      {cand.name}
                    </span>
                    {cand.party && (
                      <span className="ml-1.5 text-xs text-gray-400">
                        ({cand.party})
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {hasAbstain && (
                <div className="flex items-center gap-3 rounded-md px-3 py-2 bg-gray-100 border border-gray-300">
                  <div className="h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center border-gray-500 bg-gray-500">
                    <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm italic text-gray-700">Abstain</span>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}