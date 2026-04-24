"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createElection as createElectionApi } from "@/lib/ecasvoteApi";
import { notify } from "@/lib/notify";

type Props = {
  open: boolean;
  onClose: () => void;
  newTitle: string;
  setNewTitle: (v: string) => void;
  newAcademicYear: string;
  setNewAcademicYear: (v: string) => void;
  newSemester: string;
  setNewSemester: (v: string) => void;
  newStartDate: string;
  setNewStartDate: (v: string) => void;
  newEndDate: string;
  setNewEndDate: (v: string) => void;
  // newStatus removed — elections always start as DRAFT
  /** Called after successful create with the new election id. */
  onCreated?: (electionId: string) => void;
};

export function CreateElectionModal({
  open,
  onClose,
  newTitle,
  setNewTitle,
  newAcademicYear,
  setNewAcademicYear,
  newSemester,
  setNewSemester,
  newStartDate,
  setNewStartDate,
  newEndDate,
  setNewEndDate,
  onCreated,
}: Props) {
  if (!open) return null;

  const handleCreate = async () => {
    if (!newTitle || !newStartDate || !newEndDate) {
      notify.error({
        title: "Missing fields",
        description: "Title, start, and end date & time are required.",
      });
      return;
    }
    try {
      const startTime = new Date(newStartDate).toISOString();
      const endTime = new Date(newEndDate).toISOString();
      const result = await createElectionApi({
        electionId: crypto.randomUUID(),
        name: newTitle,
        description: `${newAcademicYear} - ${newSemester}`,
        startTime,
        endTime,
      });
      notify.success({ title: "Election created!" });
      onClose();
      if (result?.id) onCreated?.(result.id);
    } catch (err: unknown) {
      notify.error({
        title: "Failed to create election",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 w-full max-w-2xl rounded-lg bg-white p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-2xl font-semibold text-[#7A0019]">
            Create New Election
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ✕
          </Button>
        </div>

        <p className="mt-1 text-sm text-gray-500">
          New elections start as <span className="font-medium">DRAFT</span> and open
          automatically when the start time is reached.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Election Title */}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Election Title <span className="text-red-500">*</span>
            </label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. CAS SC Elections 2025-2026"
            />
          </div>

          {/* Academic Year */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Academic Year
            </label>
            <Input
              value={newAcademicYear}
              onChange={(e) => setNewAcademicYear(e.target.value)}
              placeholder="2025-2026"
            />
          </div>

          {/* Semester */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Semester
            </label>
            <select
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7A0019]/40"
              value={newSemester}
              onChange={(e) => setNewSemester(e.target.value)}
            >
              <option>First Semester</option>
              <option>Second Semester</option>
              <option>Summer</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Start Date &amp; Time (Philippine Time){" "}
              <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
            />
          </div>

          {/* End Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              End Date &amp; Time (Philippine Time){" "}
              <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="text-white"
            style={{ backgroundColor: "#7A0019" }}
            onClick={() => void handleCreate()}
          >
            Create Election
          </Button>
        </div>
      </div>
    </div>
  );
}