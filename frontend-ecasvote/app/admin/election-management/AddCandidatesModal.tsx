"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CandidateDraft } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  ballotPositions: string[];
  drafts: CandidateDraft[];
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onUpdateDraft: (index: number, field: keyof CandidateDraft, value: string) => void;
  onSave: () => void;
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
}: Props) {
  if (!open) return null;

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
        <div className="mt-4 space-y-4">
          {drafts.map((d, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 items-end gap-3 border-b pb-3 md:grid-cols-7"
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Position
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
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Candidate Name
                </label>
                <Input
                  value={d.name}
                  onChange={(e) => onUpdateDraft(idx, "name", e.target.value)}
                  placeholder="Candidate Full Name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Party
                </label>
                <select
                  className="w-full rounded border px-2 py-2 text-sm"
                  value={d.party}
                  onChange={(e) => onUpdateDraft(idx, "party", e.target.value)}
                >
                  <option value="">Select Political Party</option>
                  <option>PMB</option>
                  <option>SAMASA</option>
                  <option>Independent</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Program
                </label>
                <Input
                  value={d.program}
                  onChange={(e) => onUpdateDraft(idx, "program", e.target.value)}
                  placeholder="e.g., BS Computer Science"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Year Level
                </label>
                <select
                  className="w-full rounded border px-2 py-2 text-sm"
                  value={d.yearLevel}
                  onChange={(e) => onUpdateDraft(idx, "yearLevel", e.target.value)}
                >
                  <option value="">Select Year</option>
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                  <option>5</option>
                </select>
              </div>
              <div className="flex items-center px-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600"
                  onClick={() => onRemoveRow(idx)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="ghost" onClick={onAddRow}>
            + Add additional candidate
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
              Add Candidates
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
