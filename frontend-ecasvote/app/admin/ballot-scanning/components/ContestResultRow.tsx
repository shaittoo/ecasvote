"use client";

import { Badge } from "@/components/ui/badge";
import type { Position } from "@/lib/ecasvoteApi";
import type { ContestReadItem } from "./ScanPageContent";

interface Props {
  position: Position;
  detectedSelections: string[];
  contestRead: ContestReadItem | null;
}

function validityBadge(reason: string) {
  switch (reason) {
    case "valid_fill":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
          ✓ valid
        </Badge>
      );
    case "partial_fill":
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">
          ⚠ partial
        </Badge>
      );
    case "stroke_like":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">
          ✗ stroke
        </Badge>
      );
    case "low_fill":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-1.5 py-0">
          ✗ low fill
        </Badge>
      );
    case "empty":
      return null;
    default:
      return null;
  }
}

export function ContestResultRow({
  position,
  detectedSelections,
  contestRead,
}: Props) {
  const isOvervote = contestRead?.overvoteDetected ?? false;
  const validityMap = contestRead?.validityResults ?? {};
  const maxVotes = position.maxVotes;
  const selectedCount = detectedSelections.length;

  return (
    <div
      className={`rounded-lg border p-4 ${
        isOvervote
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
          {selectedCount === 0 && !isOvervote && (
            <span className="text-xs text-gray-400 italic">No vote detected</span>
          )}
          {selectedCount > 0 && (
            <span className="text-xs text-gray-500">
              {selectedCount}/{maxVotes} selected
            </span>
          )}
        </div>
      </div>

      {/* Candidates */}
      <div className="space-y-1">
        {position.candidates.map((cand) => {
          const isSelected = detectedSelections.includes(cand.id);
          const validity = validityMap[cand.id];

          return (
            <div
              key={cand.id}
              className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                isSelected
                  ? "bg-[#7A0019]/5 border border-[#7A0019]/20"
                  : "border border-transparent"
              }`}
            >
              {/* Selection indicator */}
              <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                isSelected
                  ? "border-[#7A0019] bg-[#7A0019]"
                  : "border-gray-300"
              }`}>
                {isSelected && (
                  <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              {/* Candidate info */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm ${
                    isSelected
                      ? "font-medium text-gray-900"
                      : "text-gray-500"
                  }`}
                >
                  {cand.name}
                </span>
                {cand.party && (
                  <span className="ml-1.5 text-xs text-gray-400">
                    ({cand.party})
                  </span>
                )}
              </div>

              {/* Validity badge */}
              {validity && validityBadge(validity.reason)}
            </div>
          );
        })}

        {/* Abstain */}
        {(() => {
          const abstainId = `abstain:${position.id}`;
          const isSelected = detectedSelections.includes(abstainId);
          const validity = validityMap[abstainId];

          if (!isSelected && !validity) return null;

          return (
            <div
              className={`flex items-center gap-3 rounded-md px-3 py-2 border-t mt-1 pt-2 ${
                isSelected
                  ? "bg-gray-100 border border-gray-300"
                  : "border border-transparent"
              }`}
            >
              <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                isSelected ? "border-gray-500 bg-gray-500" : "border-gray-300"
              }`}>
                {isSelected && (
                  <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span className={`text-sm italic ${isSelected ? "text-gray-700" : "text-gray-400"}`}>
                Abstain
              </span>
              {validity && validityBadge(validity.reason)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}