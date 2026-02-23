"use client";

import Image from "next/image";
import type { Position } from "@/lib/ecasvoteApi";

type Candidate = Position["candidates"][number] & { imageUrl?: string };

interface CandidateCardProps {
  candidate: Candidate;
}

export function CandidateCard({ candidate }: CandidateCardProps) {
  let bgColor = "#ffffff";
  let borderColor = "#e5e7eb";

  const party = candidate.party?.toLowerCase();

  if (party === "pmb") {
    bgColor = "#dbeafe";
    borderColor = "#3b82f6";
  } else if (party === "samasa") {
    bgColor = "#fee2e2";
    borderColor = "#b80000";
  } else {
    bgColor = "#fef3c7";
    borderColor = "#d39b1d";
  }

  const imageSrc = candidate.imageUrl?.trim()
    ? candidate.imageUrl
    : "/default-img.png"; // for now

  return (
    <div
      style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
      className="flex rounded-lg overflow-hidden hover:shadow-md transition-shadow"
    >

      <div className="relative w-25 h-25 rounded-full overflow-hidden border border-gray-300 bg-white my-4 ml-4">
        <Image
          src={imageSrc}
          alt={`${candidate.name} photo`}
          fill
          className="object-cover"
          sizes="112px"
        />
      </div>

      <div className="flex flex-col justify-center p-4 flex-1">
        <p className="font-bold text-xl text-gray-900 leading-tight">
          {candidate.name}
        </p>

        {candidate.party && (
          <p className="text-sm text-gray-700 mt-1">
            Party:{" "}
            {["samasa", "pmb"].includes(party ?? "")
              ? candidate.party.toUpperCase()
              : candidate.party}
          </p>
        )}

        {candidate.program && (
          <p className="text-sm text-gray-700">
            Program: {candidate.program}
          </p>
        )}

        {candidate.yearLevel && (
          <p className="text-sm text-gray-700">
            Year Level: {candidate.yearLevel}
          </p>
        )}
      </div>
    </div>
  );
}