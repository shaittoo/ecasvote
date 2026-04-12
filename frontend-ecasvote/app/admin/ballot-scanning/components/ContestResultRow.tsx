"use client";

import { Badge } from "@/components/ui/badge";
import type { Position } from "@/lib/ecasvoteApi";
import type { ContestReadItem } from "./ScanPageContent";

interface Props {
  position: Position;
  detectedSelections: string[];
  currentSelections: string[];
  contestRead: ContestReadItem | null;
  isOverridden: boolean;
  onToggle: (candidateId: string) => void;
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
  currentSelections,
  contestRead,
  isOverridden,
  onToggle,
}: Props) {
  const isOvervote = contestRead?.overvoteDetected ?? false;
  const validityMap = contestRead?.validityResults ?? {};
  const maxVotes = position.maxVotes;
  const atMax = currentSelections.length >= maxVotes;

  return (
    <div
      className={`rounded-lg border p-4 ${
        isOvervote
          ? "border-red-300 bg-red-50/50"
          : isOverridden
          ? "border-amber-300 bg-amber-50/30"
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
            (choose up to {maxVotes})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isOvervote && (
            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
              OVERVOTE
            </Badge>
          )}
          {isOverridden && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
              OVERRIDDEN
            </Badge>
          )}
          <span className="text-xs text-gray-400">
            {currentSelections.length}/{maxVotes} selected
          </span>
        </div>
      </div>

      {/* Candidates */}
      <div className="space-y-1.5">
        {position.candidates.map((cand) => {
          const isSelected = currentSelections.includes(cand.id);
          const wasDetected = detectedSelections.includes(cand.id);
          const validity = validityMap[cand.id];
          const isDisabled = !isSelected && atMax;

          return (
            <label
              key={cand.id}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors ${
                isSelected
                  ? "bg-[#7A0019]/5 border border-[#7A0019]/20"
                  : "hover:bg-gray-50 border border-transparent"
              } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[#7A0019] focus:ring-[#7A0019]/30 accent-[#7A0019]"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => {
                  if (!isDisabled) onToggle(cand.id);
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm ${
                      isSelected
                        ? "font-medium text-gray-900"
                        : "text-gray-600"
                    }`}
                  >
                    {cand.name}
                  </span>
                  {cand.party && (
                    <span className="text-xs text-gray-400">
                      ({cand.party})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {validity && validityBadge(validity.reason)}
                {wasDetected && !isSelected && isOverridden && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 text-gray-400 line-through"
                  >
                    detected
                  </Badge>
                )}
                {!wasDetected && isSelected && isOverridden && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">
                    added
                  </Badge>
                )}
              </div>
            </label>
          );
        })}

        {/* Abstain option */}
        {(() => {
          const abstainId = `abstain:${position.id}`;
          const isSelected = currentSelections.includes(abstainId);
          const wasDetected = detectedSelections.includes(abstainId);
          const validity = validityMap[abstainId];
          const isDisabled = !isSelected && atMax;

          return (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors border-t mt-1 pt-2 ${
                isSelected
                  ? "bg-gray-100 border border-gray-300"
                  : "hover:bg-gray-50 border border-transparent"
              } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-gray-500 focus:ring-gray-300 accent-gray-500"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => {
                  if (!isDisabled) onToggle(abstainId);
                }}
              />
              <span
                className={`text-sm italic ${
                  isSelected ? "text-gray-700" : "text-gray-400"
                }`}
              >
                Abstain
              </span>
              {validity && validityBadge(validity.reason)}
            </label>
          );
        })()}
      </div>
    </div>
  );
}