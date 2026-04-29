"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CandidateDraft } from "./types";

const DEGREE_PROGRAMS = [
  "BA in Communication and Media Studies",
  "BA in Community Development",
  "BA in History",
  "BA in Literature",
  "BA in Political Science",
  "BA in Sociology",
  "BS Applied Mathematics",
  "BS Biology",
  "BS Chemistry",
  "BS Computer Science",
  "BS Economics",
  "BS Psychology",
  "BS Public Health",
  "BS Statistics",
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  ballotPositions: string[];
  drafts: CandidateDraft[];
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onUpdateDraft: (index: number, field: keyof CandidateDraft, value: string | File | null) => void;
  onSave: () => void;
  locked?: boolean;
};

export function AddCandidatesModal({
  open,
  onClose,
  ballotPositions,
  drafts,
  onAddRow,
  onRemoveRow,
  onUpdateDraft,
  onSave,
  locked = false,
}: Props) {
  if (!open) return null;

  // If locked, show a simple read-only notice instead of the form
  if (locked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-10 mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl text-center">
          <p className="text-lg font-semibold text-gray-800">Election is locked</p>
          <p className="mt-2 text-sm text-gray-500">
            Candidates cannot be added or modified once the election has started.
          </p>
          <button
            className="mt-4 text-sm text-[#7A0019] underline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h3 className="text-2xl font-semibold text-[#7A0019]">Add Candidates</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="mt-4 space-y-6">
          {drafts.map((d, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4"
            >
              {/* Row header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  Candidate #{idx + 1}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => onRemoveRow(idx)}
                >
                  Remove
                </Button>
              </div>

              {/* Photo upload */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Photo <span className="text-xs text-gray-400">(optional)</span>
                </label>
                <div className="flex items-center gap-3">
                  {d.imagePreview ? (
                    <img
                      src={d.imagePreview}
                      alt="preview"
                      className="h-14 w-14 rounded-full object-cover border-2 border-gray-200 shrink-0"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs border-2 border-dashed border-gray-300 shrink-0">
                      No photo
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-[#7A0019] file:px-3 file:py-1.5 file:text-xs file:text-white file:cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      onUpdateDraft(idx, "imageFile", file);
                      onUpdateDraft(
                        idx,
                        "imagePreview",
                        file ? URL.createObjectURL(file) : ""
                      );
                    }}
                  />
                </div>
              </div>

              {/* Position + Name */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Position <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full rounded border px-2 py-2 text-sm"
                    value={d.position}
                    onChange={(e) => onUpdateDraft(idx, "position", e.target.value)}
                  >
                    <option value="">Select Position</option>
                    {ballotPositions.length > 0 ? (
                      ballotPositions.map((p, i) => (
                        <option key={i} value={p}>
                          {p}
                        </option>
                      ))
                    ) : (
                      <>
                        <option>USC Councilor</option>
                        <option>CAS Representative to the USC</option>
                        <option>CAS Chairperson</option>
                        <option>CAS Vice Chairperson</option>
                        <option>CAS Councilor</option>
                        <option>Clovers Governor</option>
                        <option>Elektrons Governor</option>
                        <option>Redbolts Governor</option>
                        <option>Skimmers Governor</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="Full name"
                    value={d.name}
                    onChange={(e) => onUpdateDraft(idx, "name", e.target.value)}
                  />
                </div>
              </div>

              {/* Party + Program + Year */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                    Party
                  </label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A0019]/40"
                    value={d.party}
                    onChange={(e) =>
                      onUpdateDraft(idx, "party", e.target.value)
                    }
                  >
                    <option value="">Select Political Party</option>
                    <option>PMB</option>
                    <option>SAMASA</option>
                    <option>Independent</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Degree Program
                  </label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A0019]/40"
                    value={d.program}
                    onChange={(e) => onUpdateDraft(idx, "program", e.target.value)}
                  >
                    <option value="">Select Program</option>
                    {DEGREE_PROGRAMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Year Level
                  </label>
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A0019]/40"
                    value={d.yearLevel}
                    onChange={(e) =>
                      onUpdateDraft(idx, "yearLevel", e.target.value)
                    }
                  >
                    <option value="">Select Year</option>
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4</option>
                    <option>5</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <Button variant="ghost" onClick={onAddRow} className="text-[#7A0019]">
            + Add another candidate
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="text-white"
              style={{ backgroundColor: "#7A0019" }}
              onClick={onSave}
            >
              Save Candidates
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}